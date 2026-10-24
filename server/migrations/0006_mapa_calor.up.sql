-- DATA-04: tiempo que hubo gente en cada celda (2×2 unidades) del piso de
-- cada espacio, por día. Agregado: no guarda quién estaba.
CREATE TABLE mapa_calor (
    espacio_id INT NOT NULL,
    dia        DATE NOT NULL,
    cx         SMALLINT NOT NULL,
    cz         SMALLINT NOT NULL,
    segundos   INT NOT NULL DEFAULT 0,
    PRIMARY KEY (espacio_id, dia, cx, cz),
    FOREIGN KEY (espacio_id) REFERENCES espacios(id) ON DELETE CASCADE
);
