import assert from "node:assert/strict";
import { createECDH, createHmac, createDecipheriv, createPublicKey, randomBytes, verify } from "node:crypto";
import test from "node:test";
import webPush from "web-push";
import { enviarPush, validarSuscripcion, pushConfigurado, retrasoPush } from "../src/services/webPush.ts";

function receiver() {
  const curve=createECDH("prime256v1");curve.generateKeys();
  const auth=randomBytes(16);
  return { curve, auth, subscription:{endpoint:"https://fcm.googleapis.com/fcm/send/test",keys:{p256dh:curve.getPublicKey().toString("base64url"),auth:auth.toString("base64url")}} };
}
const keys=webPush.generateVAPIDKeys();
const env={VAPID_PUBLIC_KEY:keys.publicKey,VAPID_PRIVATE_KEY:keys.privateKey,VAPID_SUBJECT:"https://quickdrop.example"};
const payload={title:"Rutas listas",body:"Listo",url:"/?trabajo=1",tag:"rutas-1"};

test("solo acepta proveedores HTTPS conocidos y claves P-256 válidas",async()=>{
  const {subscription}=receiver();
  assert.equal((await validarSuscripcion(subscription)).endpoint,subscription.endpoint);
  for(const endpoint of ["http://fcm.googleapis.com/a","https://127.0.0.1/a","https://evil.example/a","https://fcm.googleapis.com.evil.example/a","https://user:secret@fcm.googleapis.com/a","https://fcm.googleapis.com:8443/a"]){
    await assert.rejects(()=>validarSuscripcion({...subscription,endpoint}),{status:400});
  }
  await assert.rejects(()=>validarSuscripcion({...subscription,keys:{...subscription.keys,p256dh:"a".repeat(87)}}),{status:400});
});

test("el payload se cifra para el navegador y VAPID firma el audience correcto",async()=>{
  const {curve,auth,subscription}=receiver();
  let details;
  assert.equal(await enviarPush(env,subscription,payload,async(url,options)=>{details={url,...options};return new Response(null,{status:201});}),"enviado");
  assert.equal(details.redirect,"manual");
  assert.equal(details.url,subscription.endpoint);
  const headers=new Headers(details.headers);
  assert.equal(headers.get("content-encoding"),"aes128gcm");
  assert.equal(headers.get("ttl"),"86400");
  const token=/t=([^,]+)/.exec(headers.get("authorization"))[1];
  const [header,claims,signature]=token.split(".");
  const jwt=JSON.parse(Buffer.from(claims,"base64url"));
  assert.equal(jwt.aud,"https://fcm.googleapis.com");
  assert.equal(jwt.sub,env.VAPID_SUBJECT);
  const raw=Buffer.from(keys.publicKey,"base64url");
  const key=createPublicKey({format:"jwk",key:{kty:"EC",crv:"P-256",x:raw.subarray(1,33).toString("base64url"),y:raw.subarray(33).toString("base64url")}});
  assert.equal(verify("sha256",Buffer.from(`${header}.${claims}`),{key,dsaEncoding:"ieee-p1363"},Buffer.from(signature,"base64url")),true);
  // Descifrado independiente del emisor, según RFC 8291 / RFC 8188.
  const body=Buffer.from(details.body),salt=body.subarray(0,16),sender=body.subarray(21,21+body[20]);
  const hmac=(key,value)=>createHmac("sha256",key).update(value).digest();
  const expand=(key,info)=>hmac(key,Buffer.concat([info,Buffer.from([1])]));
  const shared=curve.computeSecret(sender);
  const ikm=expand(hmac(auth,shared),Buffer.concat([Buffer.from("WebPush: info\0"),curve.getPublicKey(),sender]));
  const prk=hmac(salt,ikm);
  const cek=expand(prk,Buffer.from("Content-Encoding: aes128gcm\0")).subarray(0,16);
  const nonce=expand(prk,Buffer.from("Content-Encoding: nonce\0")).subarray(0,12);
  const ciphertext=body.subarray(21+body[20]);
  const decipher=createDecipheriv("aes-128-gcm",cek,nonce);
  decipher.setAuthTag(ciphertext.subarray(-16));
  const decoded=Buffer.concat([decipher.update(ciphertext.subarray(0,-16)),decipher.final()]);
  assert.equal(decoded.at(-1),2);
  assert.deepEqual(JSON.parse(decoded.subarray(0,-1)),payload);
});

test("404/410 desactivan suscripciones; errores transitorios quedan para reintentar",async()=>{
  const {subscription}=receiver();
  for(const status of [404,410])assert.equal(await enviarPush(env,subscription,payload,async()=>new Response(null,{status})),"vencido");
  for(const status of [400,401,403])assert.equal(await enviarPush(env,subscription,payload,async()=>new Response(null,{status})),"rechazado");
  assert.equal(await enviarPush(env,subscription,payload,async()=>new Response(null,{status:302,headers:{Location:"https://evil.example/"}})),"rechazado");
  for(const status of [429,500,503])await assert.rejects(()=>enviarPush(env,subscription,payload,async()=>new Response(null,{status})));
  await assert.rejects(()=>enviarPush(env,subscription,payload,async()=>{throw new Error("network");}));
});

test("verifica la pareja VAPID y respeta Retry-After sin ocupar CPU esperando",async()=>{
  assert.equal(pushConfigurado(env),true);
  assert.equal(pushConfigurado({...env,VAPID_PUBLIC_KEY:webPush.generateVAPIDKeys().publicKey}),false);
  const {subscription}=receiver();
  await assert.rejects(()=>enviarPush(env,subscription,payload,async()=>new Response(null,{status:429,headers:{"Retry-After":"120"}})),error=>{
    assert.equal(retrasoPush(error,1),120_000);return true;
  });
  assert.equal(retrasoPush(new Error("network"),1),30_000);
  assert.equal(retrasoPush(new Error("network"),3),120_000);
});
