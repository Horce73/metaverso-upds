CREATE TABLE accesos_oyente (
  id BIGSERIAL PRIMARY KEY,
  sesion_id INTEGER NOT NULL REFERENCES sesiones_clase(id) ON DELETE CASCADE,
  credencial_hash TEXT NOT NULL UNIQUE,
  creado_por INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  vence_en TIMESTAMPTZ NOT NULL,
  revocado_en TIMESTAMPTZ,
  max_oyentes SMALLINT NOT NULL CHECK (max_oyentes BETWEEN 1 AND 100),
  CHECK (vence_en > creado_en)
);

CREATE UNIQUE INDEX idx_accesos_oyente_activo_sesion
  ON accesos_oyente(sesion_id)
  WHERE revocado_en IS NULL;

CREATE INDEX idx_accesos_oyente_sesion_vencimiento
  ON accesos_oyente(sesion_id, vence_en);

CREATE TABLE conexiones_oyente (
  socket_id TEXT PRIMARY KEY,
  acceso_id BIGINT NOT NULL REFERENCES accesos_oyente(id) ON DELETE CASCADE,
  nombre_visible VARCHAR(80) NOT NULL,
  conectado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  desconectado_en TIMESTAMPTZ
);

CREATE INDEX idx_conexiones_oyente_activas
  ON conexiones_oyente(acceso_id)
  WHERE desconectado_en IS NULL;
