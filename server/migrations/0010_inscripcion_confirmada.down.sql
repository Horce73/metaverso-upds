-- Revierte 0010_inscripcion_confirmada
ALTER TABLE inscripciones DROP COLUMN IF EXISTS confirmada;
