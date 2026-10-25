-- DATA-03: el visor de bitácora filtra por evento y por rango de fechas, y
-- pagina por id. Sin estos índices cada consulta recorre la tabla entera,
-- que crece con cada login, clase y exportación.
CREATE INDEX idx_bitacora_fecha ON bitacora (fecha);
CREATE INDEX idx_bitacora_evento ON bitacora (evento, id DESC);
