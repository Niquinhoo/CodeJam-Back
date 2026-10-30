import type { Request, Response } from "express";
import { env } from "cloudflare:workers";
import { buscarTrabajo, marcarFallido, registrarTrabajo } from "../models/trabajoModel.ts";
import { despacharTrabajo } from "../services/trabajos.ts";
import { ErrorPeticion, hash, identificarInstalacion, validarId, validarSolicitud } from "../services/validacion.ts";

export async function putTrabajo(request: Request, response: Response): Promise<void> {
  const id = String(request.params.id);
  validarId(id);
  const ownerHash = await identificarInstalacion(request.get("Authorization"));
  const solicitud = validarSolicitud(request.body);
  const requestJson = JSON.stringify(solicitud);
  const requestHash = await hash(requestJson);
  const existing = await buscarTrabajo(env.DB,id,ownerHash);
  if (!existing) {
    const limit = await env.JOBS_LIMIT.limit({ key: request.get("CF-Connecting-IP") ?? "local" });
    if (!limit.success) throw new ErrorPeticion(429,"Demasiados trabajos. Esperá un minuto para volver a intentar.");
  }
  const row = await registrarTrabajo(env.DB,{id,ownerHash,requestHash,requestJson});
  if (["pendiente","procesando"].includes(row.estado)) await despacharTrabajo(env.RUTAS_WORKFLOW,id);
  response.setHeader("Cache-Control","no-store");
  response.status(202).json({ id, estado: row.estado });
}

export async function getTrabajo(request: Request, response: Response): Promise<void> {
  const row = await autorizado(request);
  response.setHeader("Cache-Control","no-store");
  response.json({id:row.id,estado:row.estado,aviso:row.aviso,error:row.error,creado:row.creado,vence:row.vence});
}

export async function getResultado(request: Request, response: Response): Promise<void> {
  const row = await autorizado(request);
  if (row.estado !== "completado" || !row.resultado_json) throw new ErrorPeticion(409,"El resultado todavía no está disponible.");
  response.setHeader("Cache-Control","no-store");
  response.type("json").send(row.resultado_json);
}

async function autorizado(request: Request) {
  const id = String(request.params.id);
  validarId(id);
  const ownerHash = await identificarInstalacion(request.get("Authorization"));
  let row = await buscarTrabajo(env.DB,id,ownerHash);
  if (!row) throw new ErrorPeticion(404,"No se encontró el trabajo para esta instalación.");
  if (row.vence <= Date.now()) throw new ErrorPeticion(410,"El resultado venció después de 7 días.");
  if (row.estado === "pendiente" || row.estado === "procesando") {
    const instance = await env.RUTAS_WORKFLOW.get(id);
    const workflow = await instance.status();
    if (["errored","terminated","complete"].includes(workflow.status)) {
      await marcarFallido(env.DB,id);
      row = (await buscarTrabajo(env.DB,id,ownerHash))!;
    }
  }
  return row;
}
