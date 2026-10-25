-- AULA-04: grabación de la clase como acta. Mientras el docente graba (con
-- aviso visible para todos) se guardan los subtítulos finales y una captura
-- de la pantalla compartida cada tanto. El acta junta eso con lo que ya se
-- guarda de la clase: chat, encuestas, materiales mostrados y asistencia.
CREATE TABLE grabaciones (
    id            SERIAL PRIMARY KEY,
    sesion_id     INT NOT NULL,
    iniciada_por  INT NULL,
    inicio        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fin           TIMESTAMPTZ NULL,
    FOREIGN KEY (sesion_id) REFERENCES sesiones_clase(id) ON DELETE CASCADE,
    FOREIGN KEY (iniciada_por) REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_grabaciones_sesion ON grabaciones (sesion_id);

CREATE TABLE grabacion_eventos (
    id            BIGSERIAL PRIMARY KEY,
    grabacion_id  INT NOT NULL,
    tipo          VARCHAR(12) NOT NULL CHECK (tipo IN ('subtitulo', 'pantalla')),
    autor         VARCHAR(120) NOT NULL DEFAULT '',
    texto         TEXT NULL,
    -- Nombre del archivo de la captura en GRABACIONES_DIR (sólo 'pantalla')
    archivo       VARCHAR(80) NULL,
    en            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (grabacion_id) REFERENCES grabaciones(id) ON DELETE CASCADE
);
CREATE INDEX idx_grabacion_eventos ON grabacion_eventos (grabacion_id, en);
