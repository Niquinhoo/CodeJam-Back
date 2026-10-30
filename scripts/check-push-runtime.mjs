import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createECDH,randomBytes,randomUUID} from "node:crypto";
import {Miniflare,Response} from "miniflare";
import webPush from "web-push";

const root=".cloudflare/output/v0/workers/default";
const config=JSON.parse(await readFile(`${root}/worker.config.json`,"utf8"));
const source=await readFile(`${root}/bundle/index.js`,"utf8");
config.manifest={mainModule:"index.js",modules:{"index.js":{type:"esm",contents:source}}};
const vapid=webPush.generateVAPIDKeys();
for(const [name,value] of Object.entries({VAPID_PUBLIC_KEY:vapid.publicKey,VAPID_PRIVATE_KEY:vapid.privateKey,VAPID_SUBJECT:"https://quickdrop.example"}))config.env[name]={type:"text",value};
const requests=[];
const runtime=new Miniflare({workers:[{config,dev:{outboundService:{type:"fetcher",handler:async request=>{
  assert.equal(new URL(request.url).hostname,"fcm.googleapis.com");
  requests.push({headers:Object.fromEntries(request.headers),body:Buffer.from(await request.arrayBuffer())});
  return new Response(null,{status:201});
}}}}],enableDevRegistry:false,unsafeLocalExplorer:true});
try{
  const db=await runtime.getD1Database("DB");
  const migration=await readFile("migrations/0001_async_routes_push.sql","utf8");
  for(const sql of migration.split(";").filter(value=>value.trim()))await db.prepare(sql).run();
  const token=randomBytes(32).toString("hex");
  const headers={"Content-Type":"application/json",Authorization:`Bearer ${token}`,Origin:"http://localhost:5175"};
  const curve=createECDH("prime256v1");curve.generateKeys();
  const subscription={endpoint:"https://fcm.googleapis.com/fcm/send/runtime-test",keys:{p256dh:curve.getPublicKey().toString("base64url"),auth:randomBytes(16).toString("base64url")}};
  const send=(path,options={})=>runtime.dispatchFetch(`http://localhost${path}`,{headers,...options});
  let response=await send("/api/push/suscripcion",{method:"PUT",body:JSON.stringify(subscription)});
  assert.equal(response.status,204,await response.text());
  const id=randomUUID();
  const body=JSON.stringify({archivos:{"pedidos.json":'[{"id":1,"x":2,"y":3,"peso":1}]',"vehiculos.json":'[{"id":"V1"}]'},opciones:{iteraciones:0}});
  response=await send(`/api/trabajos/${id}`,{method:"PUT",body});
  assert.equal(response.status,202,await response.text());
  let state;
  const deadline=Date.now()+5_000;
  do{
    response=await send(`/api/trabajos/${id}`);state=await response.json();
    if(state.aviso==="enviado")break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }while(Date.now()<deadline);
  if(state.aviso!=="enviado"){
    const bindings=await runtime.getBindings();
    const instance=await bindings.RUTAS_WORKFLOW.get(id);
    console.log("Diagnóstico de prueba:",JSON.stringify({state,requests:requests.length,workflow:await instance.status()}));
    const url=new URL(`/cdn-cgi/local/explorer/api/workflows/quickdrop-rutas/instances/${id}`,await runtime.ready);
    console.log("Detalles:",await (await fetch(url)).text());
  }
  assert.equal(state.estado,"completado");assert.equal(state.aviso,"enviado");
  assert.equal(requests.length,1);
  assert.equal(requests[0].headers["content-encoding"],"aes128gcm");
  assert.ok(requests[0].headers.authorization.startsWith("vapid "));
  assert.ok(requests[0].body.byteLength>100);
  await send(`/api/trabajos/${id}`,{method:"PUT",body});
  assert.equal(requests.length,1,"repetir el trabajo no reenvía el push confirmado");
  response=await send(`/api/trabajos/${id}/resultado`);
  assert.equal((await response.json()).evaluacion.metricas.entregados,1);
  response=await send("/api/push/suscripcion",{method:"DELETE"});assert.equal(response.status,204);
  console.log("PASS: API real → D1 → Workflow real → rutas persistidas → Web Push cifrado aceptado por proveedor simulado → recuperación del resultado y baja.");
}finally{await runtime.dispose();}
