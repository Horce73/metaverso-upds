-- Revierte 0001_esquema_inicial: elimina todas las tablas del esquema base
-- y sus datos semilla. Orden inverso de dependencias.
DROP TABLE IF EXISTS
    pizarra_snapshots,
    sesion_materiales,
    materiales,
    asistencias,
    sesiones_clase,
    espacios,
    inscripciones,
    asignaturas,
    avatares,
    consentimientos,
    bitacora,
    perfiles_docente,
    perfiles_estudiante,
    carreras,
    datos_personales,
    usuario_roles,
    usuarios,
    roles;
