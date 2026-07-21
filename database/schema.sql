-- ============================================================================
-- METAVERSO EDUCATIVO UPDS - Base de Datos v3 (PostgreSQL 15+)
-- Materia piloto: Ingenieria de Software
-- Migrado desde schema_mysql.sql (v2) con RBAC completo
-- ============================================================================
-- SEGURIDAD (RNF-05):
--   RBAC: tabla de credenciales (usuarios) + catalogo de roles +
--   usuario_roles (N:M). Perfiles separados por rol.
--   Bloqueo tras 5 intentos fallidos. Bitacora auditable.
--   La app se conecta con usuario de|minimos privilegios.
-- ============================================================================
-- Cobertura:
--   RF-01 -> usuarios, avatares
--   RF-02, RF-07 -> espacios, inscripciones
--   RF-04 -> materiales, pizarra_snapshots, sesion_materiales
--   RF-05, RF-08 -> sesiones_clase, asistencias
--   RF-06, RNF-05 -> usuarios, roles, usuario_roles, perfiles_*, bitacora
--   RNF-03 -> consentimientos, datos_personales
-- ============================================================================

-- Limpiar si existe (solo para desarrollo)
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- ----------------------------------------------------------------------------
-- 1. ROLES (catalogo RBAC)
-- ----------------------------------------------------------------------------
CREATE TABLE roles (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(30) NOT NULL UNIQUE,
    descripcion VARCHAR(200) NOT NULL DEFAULT ''
);

-- ----------------------------------------------------------------------------
-- 2. USUARIOS (credenciales y datos basicos)
-- ----------------------------------------------------------------------------
CREATE TABLE usuarios (
    id                SERIAL PRIMARY KEY,
    email             VARCHAR(120) NOT NULL UNIQUE,
    password_hash     TEXT NOT NULL,
    nombre            VARCHAR(60) NOT NULL,
    apellido          VARCHAR(60) NOT NULL,
    activo            BOOLEAN NOT NULL DEFAULT TRUE,
    intentos_fallidos SMALLINT NOT NULL DEFAULT 0,
    bloqueado_hasta   TIMESTAMPTZ NULL,
    creado_en         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ultimo_acceso     TIMESTAMPTZ NULL
);

-- ----------------------------------------------------------------------------
-- 3. USUARIO_ROLES (N:M - un usuario puede tener mas de un rol)
-- ----------------------------------------------------------------------------
CREATE TABLE usuario_roles (
    usuario_id   INT NOT NULL,
    rol_id       INT NOT NULL,
    asignado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    asignado_por INT NULL,
    PRIMARY KEY (usuario_id, rol_id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (rol_id) REFERENCES roles(id) ON DELETE RESTRICT,
    FOREIGN KEY (asignado_por) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------------
-- 4. DATOS PERSONALES Y PERFILES POR ROL
-- ----------------------------------------------------------------------------
CREATE TABLE datos_personales (
    usuario_id          INT PRIMARY KEY,
    documento_identidad VARCHAR(25) NULL UNIQUE,
    fecha_nacimiento    DATE NULL,
    nacionalidad        VARCHAR(40) NULL,
    genero              VARCHAR(20) NULL CHECK (genero IN ('MASCULINO','FEMENINO','OTRO','NO_DECLARA')),
    domicilio           VARCHAR(150) NULL,
    tipo_sangre         VARCHAR(5) NULL CHECK (tipo_sangre IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
    estado_civil        VARCHAR(20) NULL CHECK (estado_civil IN ('SOLTERO(A)','CASADO(A)','DIVORCIADO(A)','VIUDO(A)','UNION LIBRE')),
    actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE carreras (
    id                SERIAL PRIMARY KEY,
    sigla             VARCHAR(10) NOT NULL UNIQUE,
    nombre            VARCHAR(80) NOT NULL UNIQUE,
    titulo_academico  VARCHAR(60) NOT NULL,
    sistema_ensenanza VARCHAR(20) NOT NULL DEFAULT 'MODULAR' CHECK (sistema_ensenanza IN ('MODULAR','SEMESTRAL','ANUAL')),
    modelo_estudio    VARCHAR(40) NOT NULL DEFAULT 'POR COMPETENCIAS',
    activa            BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE perfiles_estudiante (
    usuario_id      INT PRIMARY KEY,
    registro_upds   VARCHAR(20) NULL UNIQUE,
    carrera_id      SMALLINT NULL,
    fecha_inicio    DATE NULL,
    sistema_estudio VARCHAR(20) NULL CHECK (sistema_estudio IN ('PRESENCIAL','SEMIPRESENCIAL','VIRTUAL')),
    turno           VARCHAR(10) NULL CHECK (turno IN ('MANANA','TARDE','NOCHE')),
    estado          VARCHAR(15) NOT NULL DEFAULT 'VIGENTE' CHECK (estado IN ('VIGENTE','EGRESADO','TITULADO','RETIRADO','SUSPENDIDO')),
    semestre        SMALLINT NULL,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (carrera_id) REFERENCES carreras(id) ON DELETE RESTRICT
);

CREATE TABLE perfiles_docente (
    usuario_id       INT PRIMARY KEY,
    codigo_docente   VARCHAR(20) NULL UNIQUE,
    titulo_academico VARCHAR(80) NULL,
    grado_academico  VARCHAR(60) NULL,
    especialidad     VARCHAR(120) NULL,
    fecha_ingreso    DATE NULL,
    tipo_contrato    VARCHAR(20) NULL CHECK (tipo_contrato IN ('TIEMPO COMPLETO','TIEMPO HORARIO','INVITADO')),
    turno            VARCHAR(10) NULL CHECK (turno IN ('MANANA','TARDE','NOCHE')),
    estado           VARCHAR(15) NOT NULL DEFAULT 'VIGENTE' CHECK (estado IN ('VIGENTE','LICENCIA','RETIRADO')),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- 5. BITACORA (RNF-05: auditoria de seguridad y actividad)
-- ----------------------------------------------------------------------------
CREATE TABLE bitacora (
    id         BIGSERIAL PRIMARY KEY,
    usuario_id INT NULL,
    evento     VARCHAR(50) NOT NULL,
    detalle    VARCHAR(255) NOT NULL DEFAULT '',
    ip         VARCHAR(45) NOT NULL DEFAULT '',
    fecha      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_bitacora_usuario ON bitacora(usuario_id, fecha);

-- ----------------------------------------------------------------------------
-- 6. CONSENTIMIENTOS (RNF-03: GDPR/LOPD)
-- ----------------------------------------------------------------------------
CREATE TABLE consentimientos (
    id               SERIAL PRIMARY KEY,
    usuario_id       INT NOT NULL,
    tipo             VARCHAR(30) NOT NULL CHECK (tipo IN ('tratamiento_datos','uso_voz','grabacion_clase')),
    otorgado         BOOLEAN NOT NULL,
    fecha            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version_politica VARCHAR(20) NOT NULL,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);
CREATE INDEX idx_consentimientos_usuario ON consentimientos(usuario_id);

-- ----------------------------------------------------------------------------
-- 7. AVATARES (RF-01)
-- ----------------------------------------------------------------------------
CREATE TABLE avatares (
    id             SERIAL PRIMARY KEY,
    usuario_id     INT NOT NULL UNIQUE,
    nombre_visible VARCHAR(40) NOT NULL,
    modelo_url     TEXT NULL,
    apariencia     JSONB NOT NULL DEFAULT '{}',
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- 8. ASIGNATURAS (RF-02)
-- ----------------------------------------------------------------------------
CREATE TABLE asignaturas (
    id         SERIAL PRIMARY KEY,
    codigo     VARCHAR(20) NOT NULL UNIQUE,
    nombre     VARCHAR(120) NOT NULL,
    carrera_id SMALLINT NOT NULL,
    docente_id INT NOT NULL,
    gestion    VARCHAR(10) NOT NULL,
    activa     BOOLEAN NOT NULL DEFAULT TRUE,
    FOREIGN KEY (carrera_id) REFERENCES carreras(id) ON DELETE RESTRICT,
    FOREIGN KEY (docente_id) REFERENCES perfiles_docente(usuario_id) ON DELETE RESTRICT
);

-- ----------------------------------------------------------------------------
-- 9. INSCRIPCIONES (RF-02)
-- ----------------------------------------------------------------------------
CREATE TABLE inscripciones (
    usuario_id    INT NOT NULL,
    asignatura_id INT NOT NULL,
    inscrito_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (usuario_id, asignatura_id),
    FOREIGN KEY (usuario_id) REFERENCES perfiles_estudiante(usuario_id) ON DELETE CASCADE,
    FOREIGN KEY (asignatura_id) REFERENCES asignaturas(id) ON DELETE CASCADE
);
CREATE INDEX idx_inscripciones_asignatura ON inscripciones(asignatura_id);

-- ----------------------------------------------------------------------------
-- 10. ESPACIOS (RF-02: Campus Central y Aulas)
-- ----------------------------------------------------------------------------
CREATE TABLE espacios (
    id            SERIAL PRIMARY KEY,
    nombre        VARCHAR(80) NOT NULL,
    tipo          VARCHAR(10) NOT NULL CHECK (tipo IN ('campus','aula')),
    asignatura_id INT NULL,
    escena_url    TEXT NOT NULL,
    capacidad_max SMALLINT NOT NULL DEFAULT 40,
    activo        BOOLEAN NOT NULL DEFAULT TRUE,
    FOREIGN KEY (asignatura_id) REFERENCES asignaturas(id) ON DELETE CASCADE,
    CONSTRAINT chk_espacio_aula CHECK (
        (tipo = 'aula'   AND asignatura_id IS NOT NULL) OR
        (tipo = 'campus' AND asignatura_id IS NULL)
    )
);

-- ----------------------------------------------------------------------------
-- 11. SESIONES DE CLASE (RF-08)
-- ----------------------------------------------------------------------------
CREATE TABLE sesiones_clase (
    id                SERIAL PRIMARY KEY,
    espacio_id        INT NOT NULL,
    docente_id        INT NOT NULL,
    tema              VARCHAR(200),
    inicio_programado TIMESTAMPTZ NOT NULL,
    fin_programado    TIMESTAMPTZ NOT NULL,
    inicio_real       TIMESTAMPTZ NULL,
    fin_real          TIMESTAMPTZ NULL,
    estado            VARCHAR(15) NOT NULL DEFAULT 'programada'
                      CHECK (estado IN ('programada','en_curso','finalizada','cancelada')),
    tolerancia_min    SMALLINT NOT NULL DEFAULT 10,
    FOREIGN KEY (espacio_id) REFERENCES espacios(id) ON DELETE CASCADE,
    FOREIGN KEY (docente_id) REFERENCES perfiles_docente(usuario_id) ON DELETE RESTRICT,
    CONSTRAINT chk_sesion_horario CHECK (fin_programado > inicio_programado)
);
CREATE INDEX idx_sesiones_espacio ON sesiones_clase(espacio_id, inicio_programado);

-- ----------------------------------------------------------------------------
-- 12. ASISTENCIAS (RF-05)
-- ----------------------------------------------------------------------------
CREATE TABLE asistencias (
    id           SERIAL PRIMARY KEY,
    sesion_id    INT NOT NULL,
    usuario_id   INT NOT NULL,
    hora_ingreso TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hora_salida  TIMESTAMPTZ NULL,
    estado       VARCHAR(10) NOT NULL DEFAULT 'presente'
                 CHECK (estado IN ('presente','tarde','ausente')),
    UNIQUE (sesion_id, usuario_id),
    FOREIGN KEY (sesion_id) REFERENCES sesiones_clase(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES perfiles_estudiante(usuario_id) ON DELETE CASCADE
);
CREATE INDEX idx_asistencias_usuario ON asistencias(usuario_id);

-- ----------------------------------------------------------------------------
-- 13. MATERIALES (RF-04)
-- ----------------------------------------------------------------------------
CREATE TABLE materiales (
    id            SERIAL PRIMARY KEY,
    asignatura_id INT NOT NULL,
    subido_por    INT NOT NULL,
    tipo          VARCHAR(10) NOT NULL CHECK (tipo IN ('pdf','ppt','pptx','imagen','otro')),
    titulo        VARCHAR(150) NOT NULL,
    archivo_url   TEXT NOT NULL,
    tamano_bytes  BIGINT NULL,
    subido_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (asignatura_id) REFERENCES asignaturas(id) ON DELETE CASCADE,
    FOREIGN KEY (subido_por) REFERENCES usuarios(id) ON DELETE RESTRICT
);
CREATE INDEX idx_materiales_asignatura ON materiales(asignatura_id);

-- ----------------------------------------------------------------------------
-- 14. SESION_MATERIALES (N:M)
-- ----------------------------------------------------------------------------
CREATE TABLE sesion_materiales (
    sesion_id   INT NOT NULL,
    material_id INT NOT NULL,
    mostrado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (sesion_id, material_id),
    FOREIGN KEY (sesion_id) REFERENCES sesiones_clase(id) ON DELETE CASCADE,
    FOREIGN KEY (material_id) REFERENCES materiales(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- 15. PIZARRA_SNAPSHOTS (RF-04)
-- ----------------------------------------------------------------------------
CREATE TABLE pizarra_snapshots (
    id          SERIAL PRIMARY KEY,
    sesion_id   INT NOT NULL,
    trazos      JSONB NOT NULL,
    guardado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (sesion_id) REFERENCES sesiones_clase(id) ON DELETE CASCADE
);

-- ============================================================================
-- DATOS DE PRUEBA (materia piloto: Ingenieria de Software)
-- Contraseña de todos los usuarios: 123456
-- ============================================================================

INSERT INTO roles (nombre, descripcion) VALUES
('administrador', 'Gestiona usuarios, asignaturas e inscripciones'),
('docente',       'Dicta clases, sube materiales y consulta asistencia'),
('estudiante',    'Asiste a clases y descarga materiales'),
('invitado',      'Accede solo al campus sin acceso a aulas de clase');

-- Password hash real de bcrypt para '123456'
INSERT INTO usuarios (email, password_hash, nombre, apellido) VALUES
('admin@upds.edu.bo',        '$2b$10$OWUXCvtgZBHZGGVp8My9HOztcOocCu3eBtcd1qpBDFQfXdbsj7IOO', 'Admin',  'UPDS'),
('docente.isw@upds.edu.bo',  '$2b$10$OWUXCvtgZBHZGGVp8My9HOztcOocCu3eBtcd1qpBDFQfXdbsj7IOO', 'Carlos', 'Mendoza'),
('ana.rojas@upds.edu.bo',    '$2b$10$OWUXCvtgZBHZGGVp8My9HOztcOocCu3eBtcd1qpBDFQfXdbsj7IOO', 'Ana',    'Rojas'),
('luis.garcia@upds.edu.bo',  '$2b$10$OWUXCvtgZBHZGGVp8My9HOztcOocCu3eBtcd1qpBDFQfXdbsj7IOO', 'Luis',   'Garcia'),
('maria.flores@upds.edu.bo', '$2b$10$OWUXCvtgZBHZGGVp8My9HOztcOocCu3eBtcd1qpBDFQfXdbsj7IOO', 'Maria',  'Flores');

-- RBAC: asignar roles
INSERT INTO usuario_roles (usuario_id, rol_id, asignado_por) VALUES
(1, 1, NULL),   -- admin
(2, 2, 1),      -- docente
(3, 3, 1), (4, 3, 1), (5, 3, 1);  -- estudiantes

-- Datos personales
INSERT INTO datos_personales
(usuario_id, documento_identidad, fecha_nacimiento, nacionalidad, genero, domicilio, tipo_sangre, estado_civil) VALUES
(2, '5566778 CHS', '1985-03-12', 'Boliviana/o', 'MASCULINO', 'AV. EJEMPLO NRO 100', 'A+', 'CASADO(A)'),
(3, '11223344 CHS', '2003-08-21', 'Boliviana/o', 'FEMENINO',  'CLL. FICTICIA NRO 45', 'O+', 'SOLTERO(A)'),
(4, '11223355 CHS', '2002-11-05', 'Boliviana/o', 'MASCULINO', 'CLL. FICTICIA NRO 46', 'B+', 'SOLTERO(A)'),
(5, '11223366 CHS', '2004-02-17', 'Boliviana/o', 'FEMENINO',  'CLL. FICTICIA NRO 47', 'O-', 'SOLTERO(A)');

-- Carrera
INSERT INTO carreras (sigla, nombre, titulo_academico, sistema_ensenanza, modelo_estudio) VALUES
('320', 'Ingenieria de Sistemas', 'LICENCIATURA', 'MODULAR', 'POR COMPETENCIAS');

-- Perfil docente
INSERT INTO perfiles_docente
(usuario_id, codigo_docente, titulo_academico, grado_academico, especialidad, fecha_ingreso, tipo_contrato, turno, estado) VALUES
(2, 'DOC-001', 'INGENIERO DE SISTEMAS', 'MAESTRIA', 'Ingenieria de Software', '2018-02-01', 'TIEMPO HORARIO', 'NOCHE', 'VIGENTE');

-- Perfiles estudiantes
INSERT INTO perfiles_estudiante
(usuario_id, registro_upds, carrera_id, fecha_inicio, sistema_estudio, turno, estado, semestre) VALUES
(3, 'EST-101', 1, '2022-12-30', 'PRESENCIAL', 'NOCHE', 'VIGENTE', 5),
(4, 'EST-102', 1, '2022-12-30', 'PRESENCIAL', 'NOCHE', 'VIGENTE', 5),
(5, 'EST-103', 1, '2023-07-15', 'PRESENCIAL', 'NOCHE', 'VIGENTE', 3);

-- Consentimientos
INSERT INTO consentimientos (usuario_id, tipo, otorgado, version_politica) VALUES
(1, 'tratamiento_datos', TRUE, 'v1.0'),
(2, 'tratamiento_datos', TRUE, 'v1.0'),
(3, 'tratamiento_datos', TRUE, 'v1.0'),
(4, 'tratamiento_datos', TRUE, 'v1.0'),
(5, 'tratamiento_datos', TRUE, 'v1.0');

-- Avatares
INSERT INTO avatares (usuario_id, nombre_visible, apariencia) VALUES
(1, 'Admin UPDS',   '{"genero":"n","color":"#64748b"}'),
(2, 'Ing. Mendoza', '{"genero":"m","color":"#0ea5e9","ropa":"formal"}'),
(3, 'Ana R.',       '{"genero":"f","color":"#e11d48","ropa":"casual"}'),
(4, 'Luis G.',      '{"genero":"m","color":"#16a34a","ropa":"casual"}'),
(5, 'Maria F.',     '{"genero":"f","color":"#f59e0b","ropa":"deportiva"}');

-- Asignatura
INSERT INTO asignaturas (codigo, nombre, carrera_id, docente_id, gestion) VALUES
('ISW-501', 'Ingenieria de Software', 1, 2, '2026-2');

-- Inscripciones
INSERT INTO inscripciones (usuario_id, asignatura_id) VALUES
(3, 1), (4, 1), (5, 1);

-- Espacios
INSERT INTO espacios (nombre, tipo, asignatura_id, escena_url) VALUES
('Campus Central UPDS', 'campus', NULL, '/escenas/campus.glb'),
('Aula Ingenieria de Software', 'aula', 1, '/escenas/aula_isw.glb');

-- Sesion semilla (en curso para pruebas)
INSERT INTO sesiones_clase (espacio_id, docente_id, tema, inicio_programado, fin_programado, inicio_real, estado) VALUES
(2, 2, 'Unidad 2: Ingenieria de Requerimientos', NOW(), NOW() + INTERVAL '90 minutes', NOW(), 'en_curso');

-- Asistencias semilla
INSERT INTO asistencias (sesion_id, usuario_id, hora_ingreso, estado) VALUES
(1, 3, NOW() - INTERVAL '5 minutes', 'presente'),
(1, 4, NOW() - INTERVAL '20 minutes', 'tarde');

-- Materiales semilla
INSERT INTO materiales (asignatura_id, subido_por, tipo, titulo, archivo_url, tamano_bytes) VALUES
(1, 2, 'pdf', 'Unidad 2 - Requerimientos.pdf', '/materiales/isw/unidad2.pdf', 1548732);

INSERT INTO sesion_materiales (sesion_id, material_id) VALUES
(1, 1);
