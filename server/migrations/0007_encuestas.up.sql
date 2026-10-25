-- AULA-05: encuestas en vivo del aula. El docente pregunta, cada estudiante
-- vota una opción (puede cambiarla mientras está abierta) y al cerrarla todos
-- ven el resultado. Quedan guardadas con la clase en la que se hicieron.
CREATE TABLE encuestas (
    id          SERIAL PRIMARY KEY,
    espacio_id  INT NOT NULL,
    sesion_id   INT NULL,
    autor_id    INT NULL,
    pregunta    VARCHAR(200) NOT NULL,
    opciones    JSONB NOT NULL,
    abierta     BOOLEAN NOT NULL DEFAULT TRUE,
    creada_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cerrada_en  TIMESTAMPTZ NULL,
    FOREIGN KEY (espacio_id) REFERENCES espacios(id) ON DELETE CASCADE,
    FOREIGN KEY (sesion_id) REFERENCES sesiones_clase(id) ON DELETE SET NULL,
    FOREIGN KEY (autor_id) REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_encuestas_espacio ON encuestas (espacio_id, creada_en DESC);
-- A lo sumo una abierta por aula
CREATE UNIQUE INDEX idx_encuestas_abierta ON encuestas (espacio_id) WHERE abierta;

CREATE TABLE encuesta_votos (
    encuesta_id INT NOT NULL,
    usuario_id  INT NOT NULL,
    opcion      SMALLINT NOT NULL,
    votado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (encuesta_id, usuario_id),
    FOREIGN KEY (encuesta_id) REFERENCES encuestas(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);
