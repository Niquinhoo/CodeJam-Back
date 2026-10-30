import assert from "node:assert/strict";
import test from "node:test";
import { database } from "./helpers/d1.mjs";
import { validarSolicitud, identificarInstalacion, hash, ErrorPeticion } from "../src/services/validacion.ts";
import { registrarTrabajo, buscarTrabajo, guardarResultado } from "../src/models/trabajoModel.ts";
import { guardarSuscripcion, buscarSuscripcion, borrarSuscripcion } from "../src/models/pushModel.ts";
import { procesarTrabajo, notificarTrabajo, despacharTrabajo } from "../src/services/trabajos.ts";

const id = "6fd72a53-415e-498f-9a78-d115898bdc53";
const body = { archivos: { "mundo.json": "{}", "pedidos.json": '[{"id":1,"x":2,"y":3,"peso":1}]', "vehiculos.json": '[{"id":"V1"}]' }, opciones: { iteraciones: 0 } };
const solicitud = () => JSON.stringify(validarSolicitud(body));
const registrar = async (db, owner = "owner") => registrarTrabajo(db, { id, ownerHash: owner, requestHash: await hash(solicitud()), requestJson: solicitud() });

test("valida carga y límites de CPU antes de persistir", () => {
  assert.equal(validarSolicitud(body).opciones.iteraciones, 0);
  for (const bad of [null, {}, {archivos:[]}, {...body,opciones:{iteraciones:Infinity}}, {...body,opciones:{iteraciones:300001}}, {...body,archivos:{...body.archivos,"pedidos.json":"null"}}, {...body,archivos:{...body.archivos,"vehiculos.json":JSON.stringify(Array.from({length:9},(_,i)=>({id:`V${i}`})))}}]) {
    assert.throws(() => validarSolicitud(bad), ErrorPeticion);
  }
});

test("requiere identidad fuerte y almacena solo su hash", async () => {
  await assert.rejects(() => identificarInstalacion(undefined), {status:401});
  await assert.rejects(() => identificarInstalacion("Bearer abc"), {status:401});
  const token = "a".repeat(64);
  assert.equal(await identificarInstalacion(`Bearer ${token}`), await hash(token));
  assert.notEqual(await hash(token), token);
});

test("registro idempotente, no permite leer ni sobrescribir trabajos ajenos", async () => {
  const db = database();
  await registrar(db);
  await registrar(db);
  assert.equal((await buscarTrabajo(db,id,"owner")).estado, "pendiente");
  assert.equal(await buscarTrabajo(db,id,"otro"), null);
  await assert.rejects(() => registrar(db,"otro"), {status:409});
  await assert.rejects(() => registrarTrabajo(db,{id,ownerHash:"owner",requestHash:"diferente",requestJson:"{}"}), {status:409});
});

test("resuelve y guarda antes de notificar; un reintento no recalcula el resultado", async () => {
  const db = database();
  await registrar(db);
  await procesarTrabajo(db,id);
  const row = await buscarTrabajo(db,id,"owner");
  assert.equal(row.estado,"completado");
  assert.equal(JSON.parse(row.resultado_json).evaluacion.metricas.entregados,1);
  assert.equal(row.solicitud_json,null);
  await procesarTrabajo(db,id,()=>{throw new Error("No debe volver a calcular");});
  assert.equal((await buscarTrabajo(db,id,"owner")).resultado_json,row.resultado_json);
});

test("el paso de notificación reintenta sin perder rutas y no repite un envío confirmado", async () => {
  const db = database();
  await registrar(db);
  await procesarTrabajo(db,id);
  await guardarSuscripcion(db,"owner",{endpoint:"https://fcm.googleapis.com/fcm/send/test",keys:{auth:"auth",p256dh:"key"}});
  let attempts=0;
  const send=async(_env,_subscription,payload)=>{attempts++;assert.equal(payload.url,`/?trabajo=${id}`);if(attempts===1)throw new Error("Fallo temporal");return "enviado";};
  await assert.rejects(()=>notificarTrabajo({DB:db},id,send));
  assert.equal((await buscarTrabajo(db,id,"owner")).estado,"completado");
  await notificarTrabajo({DB:db},id,send);
  await notificarTrabajo({DB:db},id,send);
  assert.equal(attempts,2);
  assert.equal((await buscarTrabajo(db,id,"owner")).aviso,"enviado");
});

test("una suscripción vencida se borra sin borrar una renovación concurrente", async () => {
  const db=database();await registrar(db);await procesarTrabajo(db,id);
  const subscription={endpoint:"https://fcm.googleapis.com/fcm/send/old",keys:{auth:"old",p256dh:"old"}};
  await guardarSuscripcion(db,"owner",subscription);
  await notificarTrabajo({DB:db},id,async()=>{
    await guardarSuscripcion(db,"owner",{...subscription,keys:{auth:"new",p256dh:"new"}});
    return "vencido";
  });
  assert.equal((await buscarSuscripcion(db,"owner")).suscripcion.keys.auth,"new");
  await borrarSuscripcion(db,"owner");
  assert.equal(await buscarSuscripcion(db,"owner"),null);
});

test("sin push habilitado el trabajo termina y el resultado sigue disponible", async () => {
  const db=database();await registrar(db);await procesarTrabajo(db,id);
  await notificarTrabajo({DB:db},id,()=>{throw new Error("No debería enviar");});
  assert.equal((await buscarTrabajo(db,id,"owner")).aviso,"sin_suscripcion");
});

test("un despacho fallido no se da por aceptado; reconoce un workflow ya creado", async () => {
  const calls=[];
  const workflows={create:async(params)=>{calls.push(params);throw new Error("duplicado o indisponible");},get:async()=>({status:async()=>({status:"running"})})};
  await despacharTrabajo(workflows,id);
  assert.equal(calls[0].id,id);
  workflows.get=async()=>({status:async()=>{throw new Error("no existe");}});
  await assert.rejects(()=>despacharTrabajo(workflows,id),{status:503});
});
