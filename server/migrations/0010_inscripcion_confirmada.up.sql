-- ACCESO-02: el registro inscribe a cada estudiante nuevo en todas las
-- asignaturas activas (piloto ISW), para que vea sus aulas en el campus. Esa
-- inscripción automática no puede abrir el aula: sólo la que se confirma con
-- el código del curso (o la que carga la demo) deja entrar sin pase.
ALTER TABLE inscripciones ADD COLUMN confirmada BOOLEAN NOT NULL DEFAULT FALSE;
