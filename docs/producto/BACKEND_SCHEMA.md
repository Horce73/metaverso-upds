# Esquema de backend — eventos, oyentes y moderación

Propuesta de migraciones `0011` a `0013` (la última fusionada es `0010_inscripcion_confirmada`). Hasta que se aprueben, nada de esto está en `server/migrations/`.

Reglas del repo que se respetan: una migración por cambio con su `.down.sql`; nunca se edita una ya fusionada; ids `SERIAL`; texto cerrado con `CHECK`; `TIMESTAMPTZ`; claves foráneas explícitas. El backend aplica las pendientes al arrancar.

## 1. Qué cambia y qué no

| Campo del PRD | Persistencia |
|---|---|
| A. Gestos y reacciones | **Ninguna.** Son efímeros (TRD §2.1) |
| B. Diseño | Ninguna |
| C. Oyentes | `roles` (+1 fila), `evento_oyentes`, `chat_mensajes.oyente_id` |
| D. Eventos | `eventos`, `evento_enlaces`, `evento_inscripciones`, `evento_oyentes` |
| E. Moderación | `reportes`, `sanciones`, `moderacion_reglas`, `chat_mensajes` (borrado lógico), eventos nuevos en `bitacora` |
| F. Facultad | Filas nuevas en `espacios` (datos, no esquema) |

## 2. Diagrama de relaciones

```
usuarios ──< eventos >── espacios
               │  └── sesion_id ──> sesiones_clase     (se crea al iniciar)
               ├──< evento_enlaces
               ├──< evento_inscripciones >── usuarios (opcional)
               └──< evento_oyentes          (externos sin cuenta)

espacios ──< reportes >── chat_mensajes
   │            └── objetivo: usuario u oyente
   ├──< sanciones   (objetivo: usuario u oyente, opcional evento)
   └──1 moderacion_reglas
```

## 3. Migración `0011_eventos`

```sql
-- Eventos: convocatorias con fecha, aforo y visibilidad. Un evento usa un
-- espacio existente; al iniciarse se enlaza una sesión de clase para reutilizar
-- asistencia, chat, actas y grabación.
CREATE TABLE eventos (
    id                SERIAL PRIMARY KEY,
    titulo            VARCHAR(120) NOT NULL,
    descripcion       VARCHAR(1000) NOT NULL DEFAULT '',
    organizador_id    INT NOT NULL,
    espacio_id        INT NOT NULL,
    sesion_id         INT NULL,
    inicio_programado TIMESTAMPTZ NOT NULL,
    fin_programado    TIMESTAMPTZ NOT NULL,
    inicio_real       TIMESTAMPTZ NULL,
    fin_real          TIMESTAMPTZ NULL,
    estado            VARCHAR(15) NOT NULL DEFAULT 'programado'
                      CHECK (estado IN ('programado','en_curso','finalizado','cancelado')),
    visibilidad       VARCHAR(10) NOT NULL DEFAULT 'interno'
                      CHECK (visibilidad IN ('interno','enlace')),
    aforo             SMALLINT NOT NULL DEFAULT 40 CHECK (aforo BETWEEN 1 AND 500),
    max_oyentes_voz   SMALLINT NOT NULL DEFAULT 20 CHECK (max_oyentes_voz >= 0),
    chat_oyentes      BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (organizador_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
    FOREIGN KEY (espacio_id) REFERENCES espacios(id) ON DELETE RESTRICT,
    FOREIGN KEY (sesion_id) REFERENCES sesiones_clase(id) ON DELETE SET NULL,
    CONSTRAINT chk_evento_horario CHECK (fin_programado > inicio_programado)
);
CREATE INDEX idx_eventos_inicio ON eventos (inicio_programado) WHERE estado IN ('programado','en_curso');
CREATE INDEX idx_eventos_organizador ON eventos (organizador_id);

-- Enlaces de invitación. El token firmado lleva el jti; aquí se puede revocar.
CREATE TABLE evento_enlaces (
    id          SERIAL PRIMARY KEY,
    evento_id   INT NOT NULL,
    jti         VARCHAR(36) NOT NULL UNIQUE,
    creado_por  INT NOT NULL,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expira_en   TIMESTAMPTZ NOT NULL,
    revocado_en TIMESTAMPTZ NULL,
    FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE,
    FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE RESTRICT
);

-- Inscripción previa (RSVP): de un usuario con cuenta o de un externo por nombre.
CREATE TABLE evento_inscripciones (
    id          SERIAL PRIMARY KEY,
    evento_id   INT NOT NULL,
    usuario_id  INT NULL,
    nombre      VARCHAR(60) NOT NULL,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX uq_evento_inscripcion_usuario
    ON evento_inscripciones (evento_id, usuario_id) WHERE usuario_id IS NOT NULL;

-- Oyentes externos que entraron con enlace. oyente_id es el uuid del token.
-- ip_hash (HMAC con JWT_SECRET, nunca la IP) solo sirve para vetos.
CREATE TABLE evento_oyentes (
    oyente_id       UUID PRIMARY KEY,
    evento_id       INT NOT NULL,
    nombre_visible  VARCHAR(40) NOT NULL,
    ip_hash         VARCHAR(64) NOT NULL,
    acepto_terminos_en TIMESTAMPTZ NOT NULL,
    primera_entrada TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ultima_salida   TIMESTAMPTZ NULL,
    FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE
);
CREATE INDEX idx_evento_oyentes_evento ON evento_oyentes (evento_id);
```

`.down.sql`: `DROP TABLE evento_oyentes, evento_inscripciones, evento_enlaces, eventos;` en ese orden.

## 4. Migración `0012_moderacion`

```sql
CREATE TABLE reportes (
    id                    SERIAL PRIMARY KEY,
    espacio_id            INT NOT NULL,
    evento_id             INT NULL,
    reportante_usuario_id INT NULL,
    reportante_oyente_id  UUID NULL,
    objetivo_usuario_id   INT NULL,
    objetivo_oyente_id    UUID NULL,
    chat_mensaje_id       BIGINT NULL,
    motivo                VARCHAR(20) NOT NULL
                          CHECK (motivo IN ('acoso','spam','ofensivo','suplantacion','otro')),
    detalle               VARCHAR(300) NOT NULL DEFAULT '',
    estado                VARCHAR(10) NOT NULL DEFAULT 'abierto'
                          CHECK (estado IN ('abierto','resuelto','descartado')),
    resuelto_por          INT NULL,
    resuelto_en           TIMESTAMPTZ NULL,
    creado_en             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (espacio_id) REFERENCES espacios(id) ON DELETE CASCADE,
    FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE SET NULL,
    FOREIGN KEY (reportante_usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
    FOREIGN KEY (objetivo_usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
    FOREIGN KEY (chat_mensaje_id) REFERENCES chat_mensajes(id) ON DELETE SET NULL,
    FOREIGN KEY (resuelto_por) REFERENCES usuarios(id) ON DELETE SET NULL,
    CONSTRAINT chk_reporte_objetivo
        CHECK (objetivo_usuario_id IS NOT NULL OR objetivo_oyente_id IS NOT NULL OR chat_mensaje_id IS NOT NULL)
);
CREATE INDEX idx_reportes_abiertos ON reportes (espacio_id, creado_en DESC) WHERE estado = 'abierto';

-- Sanciones. hasta NULL = sin fecha de fin (expulsión o veto hasta que se levante).
-- Vetar a un usuario con cuenta de toda la plataforma es desactivarlo
-- (usuarios.activo, ya existe), no una fila aquí.
CREATE TABLE sanciones (
    id                  SERIAL PRIMARY KEY,
    tipo                VARCHAR(15) NOT NULL
                        CHECK (tipo IN ('silencio_voz','silencio_chat','expulsion','veto_evento')),
    objetivo_usuario_id INT NULL,
    objetivo_oyente_id  UUID NULL,
    ip_hash             VARCHAR(64) NULL,
    espacio_id          INT NULL,
    evento_id           INT NULL,
    aplicada_por        INT NOT NULL,
    motivo              VARCHAR(200) NOT NULL,
    reporte_id          INT NULL,
    desde               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hasta               TIMESTAMPTZ NULL,
    levantada_en        TIMESTAMPTZ NULL,
    levantada_por       INT NULL,
    FOREIGN KEY (objetivo_usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (espacio_id) REFERENCES espacios(id) ON DELETE CASCADE,
    FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE,
    FOREIGN KEY (aplicada_por) REFERENCES usuarios(id) ON DELETE RESTRICT,
    FOREIGN KEY (reporte_id) REFERENCES reportes(id) ON DELETE SET NULL,
    FOREIGN KEY (levantada_por) REFERENCES usuarios(id) ON DELETE SET NULL,
    CONSTRAINT chk_sancion_objetivo
        CHECK (objetivo_usuario_id IS NOT NULL OR objetivo_oyente_id IS NOT NULL OR ip_hash IS NOT NULL),
    CONSTRAINT chk_sancion_alcance
        CHECK (espacio_id IS NOT NULL OR evento_id IS NOT NULL)
);
CREATE INDEX idx_sanciones_usuario ON sanciones (objetivo_usuario_id) WHERE levantada_en IS NULL;
CREATE INDEX idx_sanciones_oyente ON sanciones (objetivo_oyente_id) WHERE levantada_en IS NULL;

-- Reglas del filtro de chat, por espacio.
CREATE TABLE moderacion_reglas (
    espacio_id           INT PRIMARY KEY,
    palabras_bloqueadas  TEXT[] NOT NULL DEFAULT '{}',
    bloquear_enlaces     BOOLEAN NOT NULL DEFAULT FALSE,
    max_mayusculas_pct   SMALLINT NOT NULL DEFAULT 100 CHECK (max_mayusculas_pct BETWEEN 0 AND 100),
    modo_lento_seg       SMALLINT NOT NULL DEFAULT 0 CHECK (modo_lento_seg >= 0),
    actualizado_por      INT NULL,
    actualizado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (espacio_id) REFERENCES espacios(id) ON DELETE CASCADE,
    FOREIGN KEY (actualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Chat: borrado lógico por moderación y autor oyente.
ALTER TABLE chat_mensajes
    ADD COLUMN oyente_id     UUID NULL,
    ADD COLUMN eliminado_en  TIMESTAMPTZ NULL,
    ADD COLUMN eliminado_por INT NULL REFERENCES usuarios(id) ON DELETE SET NULL;
```

`.down.sql`: quitar las tres columnas de `chat_mensajes` y `DROP TABLE moderacion_reglas, sanciones, reportes;`.

Cambio de código asociado: la consulta del historial (`chatPersistencia.ts`) agrega `WHERE eliminado_en IS NULL`.

### Eventos nuevos en `bitacora` (sin migración)
`EVENTO_CREADO`, `EVENTO_INICIADO`, `EVENTO_FINALIZADO`, `EVENTO_CANCELADO`, `EVENTO_ENLACE_REVOCADO`, `MOD_REPORTE`, `MOD_REPORTE_RESUELTO`, `MOD_SILENCIO`, `MOD_EXPULSION`, `MOD_VETO`, `MOD_SANCION_LEVANTADA`, `MOD_MENSAJE_ELIMINADO`. El campo `detalle` (255) lleva ids, no texto de mensajes.

## 5. Migración `0013_rol_oyente`

```sql
INSERT INTO roles (nombre, descripcion)
VALUES ('oyente', 'Asiste a un evento por enlace: escucha, reacciona y pide la palabra');
```
`.down.sql`: `DELETE FROM roles WHERE nombre = 'oyente';`

El oyente no tiene fila en `usuarios` ni en `usuario_roles`: el rol viaja en el token. La fila en `roles` existe para que el catálogo y los permisos hablen un solo idioma.

Si la respuesta al supuesto 3 del PRD es «sí hay moderadores designados», se agrega aquí mismo `('moderador', …)` y se asigna por `usuario_roles`.

## 6. Consultas clave

```sql
-- ¿Está sancionado este usuario en este espacio ahora?
SELECT tipo, hasta FROM sanciones
 WHERE objetivo_usuario_id = $1
   AND (espacio_id = $2 OR evento_id = $3)
   AND levantada_en IS NULL
   AND (hasta IS NULL OR hasta > NOW());

-- Aforo de oyentes conectados: se cuenta en memoria (activeUsers), no en base.
-- Eventos de la cartelera (público, sin datos sensibles)
SELECT e.id, e.titulo, e.inicio_programado, sp.nombre AS espacio
  FROM eventos e JOIN espacios sp ON sp.id = e.espacio_id
 WHERE e.estado = 'programado' AND e.visibilidad = 'enlace'
   AND e.inicio_programado BETWEEN NOW() AND NOW() + INTERVAL '30 days'
 ORDER BY e.inicio_programado LIMIT 20;
```

## 7. Integridad y retención

- Borrar un usuario: sus sanciones se borran (`CASCADE`), sus reportes quedan con el campo en `NULL` (`SET NULL`) para no perder la constancia.
- `ip_hash` de oyentes y `evento_oyentes` se purgan a los **N días** de finalizado el evento. N lo decide quien dirige el proyecto (supuesto 4 del PRD); hasta entonces, 30 como valor propuesto.
- Las sanciones activas se consultan en el `join_space` y en cada `chat` y señal de voz; además se guardan en memoria por espacio para no ir a la base por mensaje.

## 8. Datos de prueba

La semilla de demo (`sembrarDemo.ts`, cuentas `@demo.local`) gana un evento de ejemplo y un par de reportes. Sin contraseñas literales ni correos de la universidad con clave (GitGuardian).

## 9. Estado de la propuesta

| Migración | Estado | Depende de |
|---|---|---|
| 0011_eventos | Propuesta | Aprobación de tablas nuevas; supuesto 2 |
| 0012_moderacion | Propuesta | Aprobación; supuesto 3 |
| 0013_rol_oyente | Propuesta | Aprobación; supuestos 1 y 4 |
