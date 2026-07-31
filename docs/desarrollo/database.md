-- ============================================================================
-- METAVERSO EDUCATIVO UPDS - Base de Datos
-- Materia piloto: Ingeniería de Software
-- Motor: PostgreSQL 15+
-- ============================================================================
-- Cobertura de requerimientos:
--   RF-01 -> usuarios, avatares
--   RF-02 -> espacios (campus central + aulas), asignaturas
--   RF-03 -> sesiones_clase (registro de salas de voz; el audio es WebRTC en
--            tiempo real, no se persiste)
--   RF-04 -> materiales, pizarra_snapshots
--   RF-05 -> asistencias (registro automático al entrar al aula)
--   RNF-03 -> acepta_terminos, datos mínimos de usuario
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tipos enumerados
-- ----------------------------------------------------------------------------
CREATE TYPE rol_usuario AS ENUM ('estudiante', 'docente', 'admin');
CREATE TYPE tipo_espacio AS ENUM ('campus', 'aula');
CREATE TYPE estado_sesion AS ENUM ('programada', 'en_curso', 'finalizada', 'cancelada');
CREATE TYPE estado_asistencia AS ENUM ('presente', 'tarde', 'ausente', 'justificado');
CREATE TYPE tipo_material AS ENUM ('pdf', 'ppt', 'pptx', 'imagen', 'pizarra', 'otro');

-- ----------------------------------------------------------------------------
-- 1. USUARIOS  (RF-01, RNF-03)
--    Datos mínimos necesarios para la operación del metaverso.
-- ----------------------------------------------------------------------------
CREATE TABLE usuarios (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registro_upds   VARCHAR(20) UNIQUE,           -- código de estudiante/docente UPDS
    email           VARCHAR(120) NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,                -- bcrypt/argon2, nunca texto plano
    nombre          VARCHAR(60) NOT NULL,
    apellido        VARCHAR(60) NOT NULL,
    rol             rol_usuario NOT NULL DEFAULT 'estudiante',
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    acepta_terminos BOOLEAN NOT NULL DEFAULT FALSE, -- aceptación de términos básicos de la plataforma
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    ultimo_acceso   TIMESTAMPTZ
);

-- ----------------------------------------------------------------------------
-- 3. AVATARES  (RF-01)
--    Un avatar por usuario. La personalización se guarda como JSONB para
--    poder agregar rasgos nuevos (ropa, accesorios) sin migrar la tabla.
--    Compatible con Ready Player Me (se guarda la URL del .glb).
-- ----------------------------------------------------------------------------
CREATE TABLE avatares (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id      UUID NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
    nombre_visible  VARCHAR(40) NOT NULL,         -- nombre que flota sobre el avatar
    modelo_url      TEXT,                         -- URL del modelo glb (Ready Player Me u otro)
    apariencia      JSONB NOT NULL DEFAULT '{}',  -- {"genero":"f","piel":"#c68642","cabello":"corto",...}
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 4. ASIGNATURAS  (RF-02)
--    Por ahora solo habrá una fila: Ingeniería de Software.
--    El diseño ya soporta escalar a más materias sin cambios.
-- ----------------------------------------------------------------------------
CREATE TABLE asignaturas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo          VARCHAR(20) NOT NULL UNIQUE,  -- ej. 'ISW-501'
    nombre          VARCHAR(120) NOT NULL,
    docente_id      UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    gestion         VARCHAR(10) NOT NULL,         -- ej. '2026-2'
    activa          BOOLEAN NOT NULL DEFAULT TRUE
);

-- ----------------------------------------------------------------------------
-- 5. INSCRIPCIONES  (relación estudiante <-> asignatura)
--    Controla quién puede entrar a qué aula privada.
-- ----------------------------------------------------------------------------
CREATE TABLE inscripciones (
    usuario_id      UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    asignatura_id   UUID NOT NULL REFERENCES asignaturas(id) ON DELETE CASCADE,
    inscrito_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (usuario_id, asignatura_id)
);

-- ----------------------------------------------------------------------------
-- 6. ESPACIOS  (RF-02: Campus Central y Aulas Virtuales)
--    El campus es público (asignatura_id NULL); las aulas pertenecen a una
--    asignatura y solo entran inscritos.
-- ----------------------------------------------------------------------------
CREATE TABLE espacios (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre          VARCHAR(80) NOT NULL,
    tipo            tipo_espacio NOT NULL,
    asignatura_id   UUID REFERENCES asignaturas(id) ON DELETE CASCADE,
    escena_url      TEXT NOT NULL,                -- ruta del entorno 3D (.glb comprimido)
    capacidad_max   SMALLINT NOT NULL DEFAULT 40,
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT aula_requiere_asignatura
        CHECK (tipo <> 'aula' OR asignatura_id IS NOT NULL)
);

-- ----------------------------------------------------------------------------
-- 7. SESIONES DE CLASE  (RF-03, RF-05)
--    Cada clase dictada dentro de un aula. La asistencia y los materiales
--    cuelgan de aquí.
-- ----------------------------------------------------------------------------
CREATE TABLE sesiones_clase (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    espacio_id      UUID NOT NULL REFERENCES espacios(id) ON DELETE CASCADE,
    docente_id      UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    tema            VARCHAR(200),                 -- ej. 'Unidad 2: Requerimientos'
    inicio_programado TIMESTAMPTZ NOT NULL,
    fin_programado    TIMESTAMPTZ NOT NULL,
    inicio_real     TIMESTAMPTZ,
    fin_real        TIMESTAMPTZ,
    estado          estado_sesion NOT NULL DEFAULT 'programada',
    tolerancia_min  SMALLINT NOT NULL DEFAULT 10, -- minutos antes de marcar 'tarde'
    CHECK (fin_programado > inicio_programado)
);

-- ----------------------------------------------------------------------------
-- 8. ASISTENCIAS  (RF-05: registro automático al ingresar al aula)
--    El servidor inserta la fila cuando el avatar cruza la puerta del aula.
--    hora_salida se actualiza al desconectarse, para calcular permanencia.
-- ----------------------------------------------------------------------------
CREATE TABLE asistencias (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sesion_id       UUID NOT NULL REFERENCES sesiones_clase(id) ON DELETE CASCADE,
    usuario_id      UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    hora_ingreso    TIMESTAMPTZ NOT NULL DEFAULT now(),
    hora_salida     TIMESTAMPTZ,
    estado          estado_asistencia NOT NULL DEFAULT 'presente',
    UNIQUE (sesion_id, usuario_id)                -- una fila por alumno por clase
);

-- ----------------------------------------------------------------------------
-- 9. MATERIALES  (RF-04: PPT/PDF compartidos en el aula)
--    Los archivos viven en almacenamiento de objetos (S3/Supabase Storage);
--    aquí solo se guarda la referencia.
-- ----------------------------------------------------------------------------
CREATE TABLE materiales (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sesion_id       UUID REFERENCES sesiones_clase(id) ON DELETE CASCADE,
    asignatura_id   UUID NOT NULL REFERENCES asignaturas(id) ON DELETE CASCADE,
    subido_por      UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    tipo            tipo_material NOT NULL,
    titulo          VARCHAR(150) NOT NULL,
    archivo_url     TEXT NOT NULL,
    tamano_bytes    BIGINT,
    subido_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 10. PIZARRA_SNAPSHOTS  (RF-04: pizarras digitales)
--     El dibujo en vivo va por WebSocket; aquí se persisten instantáneas
--     (trazos vectoriales en JSONB) para poder reabrir la pizarra después.
-- ----------------------------------------------------------------------------
CREATE TABLE pizarra_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sesion_id       UUID NOT NULL REFERENCES sesiones_clase(id) ON DELETE CASCADE,
    trazos          JSONB NOT NULL,               -- [{tipo:'linea',puntos:[...],color:'#000'},...]
    guardado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- Índices para las consultas frecuentes
-- ----------------------------------------------------------------------------
CREATE INDEX idx_asistencias_sesion   ON asistencias(sesion_id);
CREATE INDEX idx_asistencias_usuario  ON asistencias(usuario_id);
CREATE INDEX idx_sesiones_espacio     ON sesiones_clase(espacio_id, inicio_programado);
CREATE INDEX idx_materiales_asignatura ON materiales(asignatura_id);
CREATE INDEX idx_inscripciones_asignatura ON inscripciones(asignatura_id);

-- ============================================================================
-- DATOS SEMILLA: la materia piloto
-- ============================================================================
-- (Se ejecuta después de crear el usuario docente real; ejemplo ilustrativo)
--
-- INSERT INTO usuarios (email, password_hash, nombre, apellido, rol)
-- VALUES ('docente.isw@upds.edu.bo', '<hash>', 'Nombre', 'Docente', 'docente');
--
-- INSERT INTO asignaturas (codigo, nombre, docente_id, gestion)
-- VALUES ('ISW-501', 'Ingeniería de Software', <id_docente>, '2026-2');
--
-- INSERT INTO espacios (nombre, tipo, escena_url)
-- VALUES ('Campus Central UPDS', 'campus', '/escenas/campus.glb');
--
-- INSERT INTO espacios (nombre, tipo, asignatura_id, escena_url)
-- VALUES ('Aula Ingeniería de Software', 'aula', <id_asignatura>, '/escenas/aula_isw.glb');
