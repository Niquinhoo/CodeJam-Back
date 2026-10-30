import { buscarTrabajo, guardarAviso, guardarResultado, marcarProcesando } from "../models/trabajoModel.ts";
import { borrarSuscripcion, buscarSuscripcion } from "../models/pushModel.ts";
import { resolverDesdeArchivos } from "../solver/resolver.ts";
import { ErrorPeticion } from "./validacion.ts";
import type { SolicitudTrabajo } from "./validacion.ts";
import { enviarPush } from "./webPush.ts";
import type { PushConfig } from "./webPush.ts";

export async function despacharTrabajo(workflows: Workflow<{ jobId: string }>, id: string): Promise<void> {
  try { await workflows.create({ id, params: { jobId: id } }); }
  catch {
    try {
      const instance = await workflows.get(id);
      const { status } = await instance.status();
      if (status === "unknown") throw new Error("Workflow no encontrado");
    } catch { throw new ErrorPeticion(503,"No se pudo iniciar el trabajo. Reintentá con el mismo identificador."); }
  }
}

export async function procesarTrabajo(db: D1Database, id: string, solve = resolverDesdeArchivos): Promise<void> {
  const row = await buscarTrabajo(db,id);
  if (!row || row.vence <= Date.now() || row.estado === "completado" || row.estado === "fallido") return;
  if (!row.solicitud_json) throw new Error("Falta el dataset del trabajo");
  await marcarProcesando(db,id);
  const solicitud = JSON.parse(row.solicitud_json) as SolicitudTrabajo;
  const informe = solve(solicitud.archivos,solicitud.opciones);
  const resultado = JSON.stringify(informe);
  if (new TextEncoder().encode(resultado).length > 1_900_000) throw new Error("El informe excede el límite de almacenamiento");
  await guardarResultado(db,id,resultado);
}

export async function notificarTrabajo(env: PushConfig & { DB: D1Database }, id: string, send = enviarPush): Promise<void> {
  const row = await buscarTrabajo(env.DB,id);
  if (!row || row.vence <= Date.now() || row.aviso !== "pendiente" || !["completado","fallido"].includes(row.estado)) return;
  const subscription = await buscarSuscripcion(env.DB,row.owner_hash);
  if (!subscription) { await guardarAviso(env.DB,id,"sin_suscripcion"); return; }
  const result = await send(env,subscription.suscripcion,{
    title: row.estado === "completado" ? "Tus rutas están listas" : "No se pudo completar el plan",
    body: row.estado === "completado" ? "Abrí QuickDrop para ver las rutas del dataset que cargaste." : "Abrí QuickDrop para consultar el estado e iniciar un nuevo trabajo.",
    url: `/?trabajo=${id}`, tag: `rutas-${id}`,
  });
  if (result === "vencido") await borrarSuscripcion(env.DB,row.owner_hash,subscription.version);
  await guardarAviso(env.DB,id,result === "rechazado" ? "fallido" : result);
}
