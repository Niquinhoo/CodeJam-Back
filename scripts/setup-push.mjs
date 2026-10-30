import { readFile, writeFile } from "node:fs/promises";
import webPush from "web-push";

if (process.argv.includes("--production")) {
  const keys = webPush.generateVAPIDKeys();
  await writeFile(".vapid.production.json",JSON.stringify({VAPID_PUBLIC_KEY:keys.publicKey,VAPID_PRIVATE_KEY:keys.privateKey,VAPID_SUBJECT:"https://codejam.citax.com.ar"},null,2),{mode:0o600,flag:"wx"});
  console.log("Claves de producción creadas en .vapid.production.json; cargalas como secretos del Worker y conservá el archivo en un lugar seguro.");
  process.exit(0);
}
let existing="";
try { existing=await readFile(".dev.vars","utf8"); } catch(error) { if(error.code!=="ENOENT")throw error; }
if (/^VAPID_/m.test(existing)) throw new Error(".dev.vars ya contiene claves VAPID. No se regeneran para conservar las suscripciones.");
const {publicKey,privateKey}=webPush.generateVAPIDKeys();
await writeFile(".dev.vars",`${existing}\nVAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}\nVAPID_SUBJECT=https://codejam.citax.com.ar\n`,{mode:0o600});
console.log("VAPID configurado en .dev.vars (ignorado por Git). Se conservaron las variables existentes. No uses estas claves de prueba en producción.");
