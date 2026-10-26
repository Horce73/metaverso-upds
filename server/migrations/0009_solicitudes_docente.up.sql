-- SEC-07: el rol docente ya no se elige en el registro público. Quien se
-- registra como docente entra como estudiante y deja una solicitud; un
-- administrador la aprueba (pasa a docente) o la rechaza.
CREATE TABLE solicitudes_docente (
    usuario_id    INT PRIMARY KEY,
    estado        VARCHAR(10) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
    creada_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resuelta_por  INT NULL,
    resuelta_en   TIMESTAMPTZ NULL,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (resuelta_por) REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_solicitudes_docente_pendientes ON solicitudes_docente (creada_en) WHERE estado = 'pendiente';
