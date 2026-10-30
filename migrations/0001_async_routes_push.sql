CREATE TABLE IF NOT EXISTS trabajos (
  id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  solicitud_json TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','procesando','completado','fallido')),
  resultado_json TEXT,
  error TEXT,
  aviso TEXT NOT NULL DEFAULT 'pendiente' CHECK (aviso IN ('pendiente','enviado','sin_suscripcion','vencido','fallido')),
  creado INTEGER NOT NULL,
  actualizado INTEGER NOT NULL,
  vence INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS trabajos_vencimiento ON trabajos(vence);

CREATE TABLE IF NOT EXISTS push_suscripciones (
  owner_hash TEXT PRIMARY KEY,
  suscripcion_json TEXT NOT NULL,
  actualizado INTEGER NOT NULL
);
