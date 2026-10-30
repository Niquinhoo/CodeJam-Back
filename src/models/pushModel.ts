import type { PushSubscription } from "web-push";

export async function guardarSuscripcion(db: D1Database, ownerHash: string, suscripcion: PushSubscription): Promise<void> {
  await db.prepare("INSERT INTO push_suscripciones (owner_hash,suscripcion_json,actualizado) VALUES (?,?,?) ON CONFLICT(owner_hash) DO UPDATE SET suscripcion_json=excluded.suscripcion_json,actualizado=excluded.actualizado")
    .bind(ownerHash,JSON.stringify(suscripcion),Date.now()).run();
}

export async function buscarSuscripcion(db: D1Database, ownerHash: string): Promise<{ suscripcion: PushSubscription; version: string } | null> {
  const row = await db.prepare("SELECT suscripcion_json FROM push_suscripciones WHERE owner_hash=?").bind(ownerHash).first<{ suscripcion_json: string }>();
  return row ? { suscripcion: JSON.parse(row.suscripcion_json) as PushSubscription, version: row.suscripcion_json } : null;
}

export async function borrarSuscripcion(db: D1Database, ownerHash: string, version?: string): Promise<void> {
  const query = version === undefined
    ? db.prepare("DELETE FROM push_suscripciones WHERE owner_hash=?").bind(ownerHash)
    : db.prepare("DELETE FROM push_suscripciones WHERE owner_hash=? AND suscripcion_json=?").bind(ownerHash,version);
  await query.run();
}
