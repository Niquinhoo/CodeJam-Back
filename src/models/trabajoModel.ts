import { ErrorPeticion } from "../services/validacion.ts";

export interface Trabajo {
  id: string;
  owner_hash: string;
  request_hash: string;
  solicitud_json: string | null;
  estado: "pendiente" | "procesando" | "completado" | "fallido";
  resultado_json: string | null;
  error: string | null;
  aviso: "pendiente" | "enviado" | "sin_suscripcion" | "vencido" | "fallido";
  creado: number;
  actualizado: number;
  vence: number;
}

export async function registrarTrabajo(db: D1Database, input: { id: string; ownerHash: string; requestHash: string; requestJson: string }): Promise<Trabajo> {
  const now = Date.now();
  await db.prepare("INSERT INTO trabajos (id,owner_hash,request_hash,solicitud_json,creado,actualizado,vence) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING")
    .bind(input.id,input.ownerHash,input.requestHash,input.requestJson,now,now,now + 7 * 86_400_000).run();
  const row = await buscarTrabajo(db,input.id);
  if (!row || row.owner_hash !== input.ownerHash || row.request_hash !== input.requestHash) throw new ErrorPeticion(409,"Ese identificador ya corresponde a otro trabajo.");
  if (row.vence <= now) throw new ErrorPeticion(410,"El trabajo venció. Iniciá uno nuevo.");
  return row;
}

export function buscarTrabajo(db: D1Database, id: string, ownerHash?: string): Promise<Trabajo | null> {
  return ownerHash === undefined
    ? db.prepare("SELECT * FROM trabajos WHERE id = ?").bind(id).first<Trabajo>()
    : db.prepare("SELECT * FROM trabajos WHERE id = ? AND owner_hash = ?").bind(id,ownerHash).first<Trabajo>();
}

export async function marcarProcesando(db: D1Database, id: string): Promise<void> {
  await db.prepare("UPDATE trabajos SET estado='procesando',actualizado=? WHERE id=? AND estado IN ('pendiente','procesando')").bind(Date.now(),id).run();
}

export async function guardarResultado(db: D1Database, id: string, resultado: string): Promise<void> {
  await db.prepare("UPDATE trabajos SET estado='completado',resultado_json=?,solicitud_json=NULL,error=NULL,actualizado=? WHERE id=? AND estado IN ('pendiente','procesando')").bind(resultado,Date.now(),id).run();
}

export async function marcarFallido(db: D1Database, id: string): Promise<void> {
  await db.prepare("UPDATE trabajos SET estado='fallido',solicitud_json=NULL,error='No se pudo resolver el dataset. Iniciá un nuevo trabajo.',actualizado=? WHERE id=? AND estado IN ('pendiente','procesando')").bind(Date.now(),id).run();
}

export async function guardarAviso(db: D1Database, id: string, aviso: Trabajo["aviso"]): Promise<void> {
  await db.prepare("UPDATE trabajos SET aviso=?,actualizado=? WHERE id=?").bind(aviso,Date.now(),id).run();
}

export async function limpiarVencidos(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM trabajos WHERE vence < ?").bind(Date.now()),
    db.prepare("DELETE FROM push_suscripciones WHERE actualizado < ?").bind(Date.now() - 90 * 86_400_000),
  ]);
}
