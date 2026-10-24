-- DATA-01: minutos efectivos por clase. asistencias guarda una fila por
-- estudiante y sesión (estado, primera entrada); cada entrada y salida del
-- aula es un tramo aparte, así quien se cae y vuelve a entrar suma sólo el
-- tiempo que estuvo dentro.
CREATE TABLE asistencia_tramos (
    id            SERIAL PRIMARY KEY,
    asistencia_id INT NOT NULL,
    entrada       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    salida        TIMESTAMPTZ NULL,
    FOREIGN KEY (asistencia_id) REFERENCES asistencias(id) ON DELETE CASCADE,
    CONSTRAINT chk_tramo_orden CHECK (salida IS NULL OR salida >= entrada)
);
CREATE INDEX idx_asistencia_tramos_asistencia ON asistencia_tramos (asistencia_id);
-- A lo sumo un tramo abierto por asistencia
CREATE UNIQUE INDEX idx_asistencia_tramos_abierto ON asistencia_tramos (asistencia_id) WHERE salida IS NULL;

-- Las asistencias ya registradas pasan a tener su único tramo conocido
INSERT INTO asistencia_tramos (asistencia_id, entrada, salida)
SELECT id, hora_ingreso, CASE WHEN hora_salida >= hora_ingreso THEN hora_salida END
FROM asistencias;
