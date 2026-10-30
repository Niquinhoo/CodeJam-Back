import webPush from "web-push";
import { createECDH } from "node:crypto";
import type { PushSubscription } from "web-push";
import { ErrorPeticion } from "./validacion.ts";

export interface PushConfig {
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}
export interface AvisoPush { title: string; body: string; url: string; tag: string }

export function pushConfigurado(env: PushConfig): boolean {
  try {
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return false;
    const key = createECDH("prime256v1");
    key.setPrivateKey(Buffer.from(env.VAPID_PRIVATE_KEY,"base64url"));
    if (key.getPublicKey().toString("base64url") !== env.VAPID_PUBLIC_KEY) return false;
    webPush.getVapidHeaders("https://fcm.googleapis.com",env.VAPID_SUBJECT,env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY,"aes128gcm");
    return true;
  } catch { return false; }
}

class ErrorPushTransitorio extends Error {
  retryAfterMs: number;
  constructor(status: number, retryAfter: string | null) {
    super(`El proveedor push respondió ${status}`);
    const seconds = Number(retryAfter);
    this.retryAfterMs = retryAfter && Number.isFinite(seconds) ? Math.max(0,seconds * 1000) : Math.max(0,Date.parse(retryAfter ?? "") - Date.now()) || 0;
  }
}

export function retrasoPush(error: Error, attempt: number): number {
  const requested = "retryAfterMs" in error && typeof error.retryAfterMs === "number" ? error.retryAfterMs : 0;
  return Math.min(86_400_000,Math.max(requested,30_000 * 2 ** Math.min(5,Math.max(0,attempt - 1))));
}

export async function validarSuscripcion(value: unknown): Promise<PushSubscription> {
  const sub = value as Partial<PushSubscription> | null;
  if (!sub || typeof sub.endpoint !== "string" || sub.endpoint.length > 4096 || typeof sub.keys?.auth !== "string" || typeof sub.keys.p256dh !== "string") throw new ErrorPeticion(400,"Suscripción push inválida.");
  let endpoint: URL;
  try { endpoint = new URL(sub.endpoint); } catch { throw new ErrorPeticion(400,"Endpoint push inválido."); }
  const host = endpoint.hostname;
  const trusted = host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" || host.endsWith(".push.services.mozilla.com") || host === "web.push.apple.com" || host.endsWith(".push.apple.com") || host.endsWith(".notify.windows.com");
  if (endpoint.protocol !== "https:" || endpoint.port || endpoint.username || endpoint.password || endpoint.hash || !trusted) throw new ErrorPeticion(400,"El endpoint no pertenece a un proveedor push admitido.");
  if (!/^[\w-]{22}$/.test(sub.keys.auth) || !/^[\w-]{87}$/.test(sub.keys.p256dh)) throw new ErrorPeticion(400,"Claves push inválidas.");
  const raw = Uint8Array.from(atob(sub.keys.p256dh.replace(/-/g,"+").replace(/_/g,"/")), c => c.charCodeAt(0));
  try { await crypto.subtle.importKey("raw",raw,{name:"ECDH",namedCurve:"P-256"},false,[]); }
  catch { throw new ErrorPeticion(400,"La clave pública push no es válida."); }
  return { endpoint: endpoint.href, keys: { auth: sub.keys.auth, p256dh: sub.keys.p256dh } };
}

export async function enviarPush(env: PushConfig, subscription: PushSubscription, payload: AvisoPush, fetcher: typeof fetch = fetch): Promise<"enviado" | "vencido" | "rechazado"> {
  if (!pushConfigurado(env)) throw new Error("Push no configurado");
  const details = webPush.generateRequestDetails(subscription,JSON.stringify(payload),{
    vapidDetails: { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY },
    TTL: 86_400,
    urgency: "normal",
    topic: payload.tag.replace(/[^a-zA-Z0-9_-]/g,"").slice(-32),
  });
  const response = await fetcher(details.endpoint,{
    method: "POST", headers: details.headers,
    body: details.body ? new Uint8Array(details.body) : null,
    redirect: "manual", signal: AbortSignal.timeout(15_000),
  });
  const status = response.status;
  await response.body?.cancel();
  if (status === 404 || status === 410) return "vencido";
  if (status >= 200 && status < 300) return "enviado";
  if (status >= 300 && status < 400) return "rechazado";
  if (status >= 400 && status < 500 && status !== 429) return "rechazado";
  throw new ErrorPushTransitorio(status,response.headers.get("Retry-After"));
}
