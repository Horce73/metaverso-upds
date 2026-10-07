-- AULA-02: la pizarra del aula se guarda trazo a trazo. Cada trazo es una
-- operación (de que se apoya el lápiz a que se levanta) con id propio: se
-- puede deshacer, y quien llega tarde o tras un reinicio del servidor
-- reconstruye la pizarra desde aquí. Borrar marca borrado_en; no se pierde
-- el historial de la clase.
CREATE TABLE pizarra_trazos (
    id          VARCHAR(64) PRIMARY KEY,
    espacio_id  INT NOT NULL,
    sesion_id   INT NULL,
    usuario_id  INT NULL,
    color       VARCHAR(7) NOT NULL,
    grosor      REAL NOT NULL,
    puntos      JSONB NOT NULL,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    borrado_en  TIMESTAMPTZ NULL,
    FOREIGN KEY (espacio_id) REFERENCES espacios(id) ON DELETE CASCADE,
    FOREIGN KEY (sesion_id) REFERENCES sesiones_clase(id) ON DELETE SET NULL,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
);
-- La consulta de siempre: lo que está a la vista en un aula, en orden
CREATE INDEX idx_pizarra_trazos_vigentes ON pizarra_trazos (espacio_id, creado_en) WHERE borrado_en IS NULL;
