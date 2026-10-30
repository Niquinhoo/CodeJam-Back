import type { Request, Response } from "express";
import { env } from "cloudflare:workers";
import { borrarSuscripcion, guardarSuscripcion } from "../models/pushModel.ts";
import { ErrorPeticion, identificarInstalacion } from "../services/validacion.ts";
import { pushConfigurado, validarSuscripcion } from "../services/webPush.ts";

export function getPushConfig(_request: Request, response: Response): void {
  response.setHeader("Cache-Control","no-store");
  if (!pushConfigurado(env)) throw new ErrorPeticion(503,"Las notificaciones todavía no están configuradas en el servidor.");
  response.json({ publicKey: env.VAPID_PUBLIC_KEY });
}

export async function putSuscripcion(request: Request, response: Response): Promise<void> {
  if (!pushConfigurado(env)) throw new ErrorPeticion(503,"Las notificaciones todavía no están configuradas en el servidor.");
  const ownerHash = await identificarInstalacion(request.get("Authorization"));
  const subscription = await validarSuscripcion(request.body);
  const limit = await env.JOBS_LIMIT.limit({key:`push:${request.get("CF-Connecting-IP") ?? "local"}`});
  if (!limit.success) throw new ErrorPeticion(429,"Demasiados cambios de suscripción. Esperá un minuto.");
  await guardarSuscripcion(env.DB,ownerHash,subscription);
  response.status(204).end();
}

export async function deleteSuscripcion(request: Request, response: Response): Promise<void> {
  const ownerHash = await identificarInstalacion(request.get("Authorization"));
  await borrarSuscripcion(env.DB,ownerHash);
  response.status(204).end();
}
