-- A11Y-02: el chat del espacio se guarda. Quien llega tarde, se reconecta o
-- recarga la página ve lo que ya se dijo; antes se perdía al salir. El texto
-- es el ya saneado por el servidor (SEC-05); el remitente queda como se
-- mostró en ese momento, aunque el usuario cambie de nombre o se borre.
CREATE TABLE chat_mensajes (
    id          BIGSERIAL PRIMARY KEY,
    espacio_id  INT NOT NULL,
    sesion_id   INT NULL,
    usuario_id  INT NULL,
    remitente   VARCHAR(120) NOT NULL,
    texto       TEXT NOT NULL,
    enviado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (espacio_id) REFERENCES espacios(id) ON DELETE CASCADE,
    FOREIGN KEY (sesion_id) REFERENCES sesiones_clase(id) ON DELETE SET NULL,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_chat_mensajes_espacio ON chat_mensajes (espacio_id, enviado_en DESC);
CREATE INDEX idx_chat_mensajes_sesion ON chat_mensajes (sesion_id) WHERE sesion_id IS NOT NULL;
