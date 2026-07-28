# Plan de Implementación Actualizado — Metaverso UPDS

> **Stack real:** React 19 + TypeScript + Vite | Node.js + Express + Socket.io | PostgreSQL 15 (Docker) | Three.js (R3F)
> **Fecha de actualización:** 20/07/2026
> **Base:** Esqueleto original (`2026-07-15-esqueleto-app.md`) adaptado al stack actual

---

## Equipo y Roles

| Desarrollador | Rol | Sprints asignados |
|---|---|---|
| **Néstor Ávila** | Backend / Scrum Master | Sprint 1 (Fundamentos), Sprint 5 (Integración) |
| **Pedro Rodríguez** | Backend API | Sprint 2 (Auth + RBAC), Sprint 4 (Académico) |
| **Horacio López** | Backend DB + Seguridad | Sprint 1 (Schema + DB), Sprint 3 (Seguridad) |
| **Cristian Mamani** | Frontend UI | Sprint 2 (Login/Registro), Sprint 6 (Dashboard + HUD) |
| **Melvin Chipana** | Escena 3D | Sprint 4 (Campus), Sprint 7 (Aula + Transiciones) |
| **Ignacio Calvimontes** | Avatar + Controles | Sprint 3 (Avatar), Sprint 7 (Asistencia visual) |
| **Lucas Vargas** | Documentación | Sprint 8 (README + Docs) |

---

## Global Constraints (del esqueleto original, adaptados)

- Directorio: `C:\xampp\htdocs\Metaverso_UPDS`
- Todo texto visible al usuario en **español**
- Contraseñas siempre con `bcrypt` (RNF-05). Nunca texto plano.
- La API responde JSON UTF-8; errores con código HTTP apropiado y `{"error": "..."}`
- La voz NO se persiste (RNF-03/RNF-16). WebRTC PeerJS es en tiempo real.
- PostgreSQL debe estar corriendo via Docker (`docker compose up -d`)
- Backend en `localhost:3001`, Frontend en `localhost:5173` (Vite proxy configurado)
- **NO usar Mock DB** — todas las rutas requieren conexión real a PostgreSQL
- Usuarios demo (contraseña `123456`): docente `docente.isw@upds.edu.bo`; estudiantes se crean desde la UI

---

## Sprint 1: Fundamentos — Schema PostgreSQL + Entorno (Néstor + Horacio)

**Objetivo:** Migrar el esquema PostgreSQL a la versión completa con RBAC, eliminar mock DB, configurar Docker con init script.

**Responsables:** Néstor Ávila (infraestructura) + Horacio López (schema SQL)

### Task 1.1: Schema PostgreSQL completo con RBAC (Horacio)

**Archivo:** `database/schema.sql` (nuevo, reemplaza `database.md`)

Migrar las 18 tablas del `schema_mysql.sql` a PostgreSQL, adaptando tipos:

```sql
-- Mapeo de tipos MySQL → PostgreSQL:
-- TINYINT UNSIGNED → SMALLINT
-- INT UNSIGNED → SERIAL o INTEGER
-- TIMESTAMP → TIMESTAMPTZ
-- ENUM('a','b') → VARCHAR con CHECK o custom TYPE
-- JSON → JSONB
-- AUTO_INCREMENT → SERIAL
```

**Tablas a crear (orden de dependencias):**

1. `roles` — id SERIAL PK, nombre VARCHAR(30) UNIQUE NOT NULL, descripcion VARCHAR(200)
2. `usuarios` — id SERIAL PK, email VARCHAR(120) UNIQUE NOT NULL, password_hash TEXT NOT NULL, nombre VARCHAR(60), apellido VARCHAR(60), activo BOOLEAN DEFAULT TRUE, intentos_fallidos SMALLINT DEFAULT 0, bloqueado_hasta TIMESTAMPTZ, creado_en TIMESTAMPTZ DEFAULT NOW(), ultimo_acceso TIMESTAMPTZ
3. `usuario_roles` — usuario_id INT FK→usuarios, rol_id INT FK→roles, asignado_en TIMESTAMPTZ, asignado_por INT FK→usuarios NULL, PK(usuario_id, rol_id)
4. `datos_personales` — usuario_id INT PK FK→usuarios, documento_identidad VARCHAR(25) UNIQUE, fecha_nacimiento DATE, nacionalidad VARCHAR(40), genero VARCHAR(20), domicilio VARCHAR(150), tipo_sangre VARCHAR(5), estado_civil VARCHAR(20), actualizado_en TIMESTAMPTZ
5. `carreras` — id SERIAL PK, sigla VARCHAR(10) UNIQUE, nombre VARCHAR(80) UNIQUE, titulo_academico VARCHAR(60), sistema_ensenanza VARCHAR(20), modelo_estudio VARCHAR(40), activa BOOLEAN
6. `perfiles_estudiante` — usuario_id INT PK FK→usuarios, registro_upds VARCHAR(20) UNIQUE, carrera_id SMALLINT FK→carreras, fecha_inicio DATE, sistema_estudio VARCHAR(20), turno VARCHAR(10), estado VARCHAR(15) DEFAULT 'VIGENTE', semestre SMALLINT
7. `perfiles_docente` — usuario_id INT PK FK→usuarios, codigo_docente VARCHAR(20) UNIQUE, titulo_academico VARCHAR(80), grado_academico VARCHAR(60), especialidad VARCHAR(120), fecha_ingreso DATE, tipo_contrato VARCHAR(20), turno VARCHAR(10), estado VARCHAR(15) DEFAULT 'VIGENTE'
8. `bitacora` — id BIGSERIAL PK, usuario_id INT FK→usuarios NULL, evento VARCHAR(50), detalle VARCHAR(255), ip VARCHAR(45), fecha TIMESTAMPTZ DEFAULT NOW()
9. `consentimientos` — id SERIAL PK, usuario_id INT FK→usuarios, tipo VARCHAR(30), otorgado BOOLEAN, fecha TIMESTAMPTZ DEFAULT NOW(), version_politica VARCHAR(20)
10. `avatares` — id SERIAL PK, usuario_id INT UNIQUE FK→usuarios, nombre_visible VARCHAR(40), modelo_url TEXT, apariencia JSONB, actualizado_en TIMESTAMPTZ
11. `asignaturas` — id SERIAL PK, codigo VARCHAR(20) UNIQUE, nombre VARCHAR(120), carrera_id SMALLINT FK→carreras, docente_id INT FK→perfiles_docente, gestion VARCHAR(10), activa BOOLEAN
12. `inscripciones` — usuario_id INT FK→perfiles_estudiante, asignatura_id INT FK→asignaturas, inscrito_en TIMESTAMPTZ, PK(usuario_id, asignatura_id)
13. `espacios` — id SERIAL PK, nombre VARCHAR(80), tipo VARCHAR(10) CHECK(tipo IN ('campus','aula')), asignatura_id INT FK→asignaturas NULL, escena_url TEXT, capacidad_max SMALLINT DEFAULT 40, activo BOOLEAN, CHECK: aula requiere asignatura
14. `sesiones_clase` — id SERIAL PK, espacio_id INT FK→espacios, docente_id INT FK→perfiles_docente, tema VARCHAR(200), inicio_programado TIMESTAMPTZ, fin_programado TIMESTAMPTZ, inicio_real TIMESTAMPTZ, fin_real TIMESTAMPTZ, estado VARCHAR(15) DEFAULT 'programada', tolerancia_min SMALLINT DEFAULT 10, CHECK: fin > inicio
15. `asistencias` — id SERIAL PK, sesion_id INT FK→sesiones_clase, usuario_id INT FK→perfiles_estudiante, hora_ingreso TIMESTAMPTZ DEFAULT NOW(), hora_salida TIMESTAMPTZ, estado VARCHAR(10) DEFAULT 'presente', UNIQUE(sesion_id, usuario_id)
16. `materiales` — id SERIAL PK, asignatura_id INT FK→asignaturas, subido_por INT FK→usuarios, tipo VARCHAR(10), titulo VARCHAR(150), archivo_url TEXT, tamano_bytes BIGINT, subido_en TIMESTAMPTZ
17. `sesion_materiales` — sesion_id INT FK→sesiones_clase, material_id INT FK→materiales, mostrado_en TIMESTAMPTZ, PK(sesion_id, material_id)
18. `pizarra_snapshots` — id SERIAL PK, sesion_id INT FK→sesiones_clase, trazos JSONB, guardado_en TIMESTAMPTZ

**Índices:**
- `idx_bitacora_usuario(usuario_id, fecha)`
- `idx_consentimientos_usuario(usuario_id)`
- `idx_inscripciones_asignatura(asignatura_id)`
- `idx_sesiones_espacio(espacio_id, inicio_programado)`
- `idx_asistencias_usuario(usuario_id)`
- `idx_materiales_asignatura(asignatura_id)`

**Datos semilla:**
- Roles: administrador, docente, estudiante
- Usuarios con bcrypt real de `123456`
- Carrera: Ingeniería de Sistemas (320)
- Perfil docente: Carlos Mendoza (DOC-001)
- Perfiles estudiantes: Ana (EST-101), Luis (EST-102), María (EST-103)
- Asignatura: ISW-501 Ingeniería de Software
- Espacios: Campus Central + Aula ISW
- Sesión semilla en estado `en_curso`

### Task 1.2: Docker init + migración (Néstor)

**Archivos:**
- `docker-compose.yml` (actualizar)
- `database/schema.sql` (crear el directorio `database/`)

Cambios al `docker-compose.yml`:
```yaml
services:
  db:
    image: postgres:15-alpine
    container_name: metaverso_upds_postgres
    restart: always
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: metaverso_upds
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

### Task 1.3: Eliminar Mock DB del backend (Néstor + Pedro)

**Archivos a modificar:**
- `server/src/db.ts` — eliminar `mockDb`, `isUsingMock()`, `useMock`, todo el fallback
- `server/src/index.ts` — eliminar todos los `if (isUsingMock())` branches
- `server/src/socketHandler.ts` — eliminar branches de mock

**Regla:** Todas las rutas usan `pool.query()` directamente. Si PostgreSQL no está disponible, el servidor falla al arrancar (el healthcheck de Docker previene esto).

### Task 1.4: Variables de entorno (Néstor)

**Archivos:**
- `server/.env` (nuevo, NO versionar)
- `server/.env.example` (versionar)

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/metaverso_upds
PORT=3001
JWT_SECRET=cambiar-en-produccion-2026
```

### Task 1.5: Commit

```bash
git add database/ docker-compose.yml server/src/db.ts server/src/index.ts server/src/socketHandler.ts server/.env.example
git commit -m "feat(db): schema PostgreSQL completo con RBAC, eliminar mock DB, Docker init"
```

---

## Sprint 2: Auth + RBAC + Login React (Pedro + Cristian)

**Objetivo:** Autenticación completa con RBAC real, registro con perfiles, y login/registro en React.

**Responsables:** Pedro Rodríguez (API backend) + Cristian Mamani (UI frontend)

### Task 2.1: RBAC middleware y helpers (Pedro)

**Archivo nuevo:** `server/src/middleware/auth.ts`

Funciones:
- `autenticarJWT(req, res, next)` — extrae y verifica JWT, carga usuario + roles desde `usuario_roles`
- `requiereRol(...roles)` — middleware que verifica roles del usuario
- `bitacora(usuarioId, evento, detalle, ip)` — registra evento en tabla `bitacora`

**Cambios en `server/src/index.ts`:**
- Reemplazar el middleware JWT actual (línea 218-230) por la versión mejorada
- Agregar bitácora en login, registro, logout

### Task 2.2: Login con RBAC + bloqueo (Pedro)

**Endpoint:** `POST /api/auth/login` (modificar en `index.ts`)

Cambios:
1. Consultar `intentos_fallidos` y `bloqueado_hasta`
2. Si `bloqueado_hasta > NOW()` → 423 con mensaje
3. Si falla → incrementar `intentos_fallidos`; >= 5 → `bloqueado_hasta = NOW() + 15min`
4. Si éxito → resetear contadores, setear `ultimo_acceso`
5. Cargar roles desde `usuario_roles` JOIN `roles`
6. Sin roles → 403
7. Bitácora: `login_ok`, `login_fallido`, `login_bloqueado`

### Task 2.3: Registro completo con RBAC (Pedro)

**Endpoint:** `POST /api/auth/register` (modificar en `index.ts`)

Todo dentro de una transacción PostgreSQL:
1. INSERT en `usuarios` (bcrypt)
2. INSERT en `usuario_roles` (rol estudiante)
3. INSERT en `perfiles_estudiante` (registro_upds=NULL)
4. INSERT en `datos_personales` (vacío)
5. INSERT en `avatares` (nombre_visible, apariencia JSONB)
6. INSERT en `consentimientos` (si acepta_datos)
7. INSERT en `inscripciones` (asignaturas activas)
8. Bitácora: `registro`

### Task 2.4: Endpoints auxiliares (Pedro)

- `GET /api/auth/yo` → usuario + avatar (carga roles)
- `POST /api/auth/logout` → confirma (stateless JWT, frontend borra token)

### Task 2.5: Login + Registro React (Cristian)

**Archivo:** `src/components/Login.tsx`

Cambios:
1. Login: manejar 423 (bloqueado) con mensaje específico
2. Registro: agregar campos `nombre_visible`, color de avatar, checkbox consentimiento
3. Usar rutas relativas `/api/auth/...` en vez de `http://localhost:3001`

### Task 2.6: Vite proxy (Néstor)

**Archivo:** `vite.config.ts` (modificar)

```typescript
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/socket.io': { target: 'http://localhost:3001', ws: true },
      '/peer': 'http://localhost:3001'
    }
  }
});
```

Eliminar todas las URLs `http://localhost:3001` de los componentes frontend.

### Task 2.7: Commit

```bash
git add server/src/middleware/ server/src/index.ts src/components/Login.tsx vite.config.ts
git commit -m "feat(auth): RBAC completo, bloqueo por intentos, registro con perfiles"
```

---

## Sprint 3: Seguridad + Avatar (Horacio + Ignacio)

**Objetivo:** Bitácora completa, avatares 3D mejorados, consentimiento RNF-03.

**Responsables:** Horacio López (seguridad) + Ignacio Calvimontes (avatar 3D)

### Task 3.1: Bitácora completa (Horacio)

**Endpoint nuevo:** `GET /api/admin/bitacora` (solo admin)

Retorna últimos 200 eventos con filtros opcionales: `?evento=login_ok&desde=...&hasta=...`

Eventos a registrar automáticamente:
- `login_ok`, `login_fallido`, `login_bloqueado`
- `registro`
- `inicio_clase`, `fin_clase`
- `subida_material`
- `cambio_avatar`
- `consulta_reporte`

### Task 3.2: Datos personales (Horacio)

- `GET /api/usuario/datos-personales` → datos del usuario actual
- `PUT /api/usuario/datos-personales` → actualizar (sólo propio o admin)

### Task 3.3: Consentimientos (Horacio)

- `GET /api/usuario/consentimientos` → lista del usuario
- `POST /api/usuario/consentimientos` → registrar nuevo

### Task 3.4: Avatar 3D mejorado (Ignacio)

**Archivo:** `src/components/Avatar3D.tsx`

Mejoras:
1. Leer `apariencia.color` → colorear torso
2. Leer `apariencia.genero` → variar geometría (hombros/caderas)
3. Agregar pelo básico según `apariencia.colorCabello`
4. Letrero nombre con fondo semi-transparente
5. Animación idle sutil (respiración)

### Task 3.5: CustomAvatar completo (Ignacio)

**Archivo:** `src/components/CustomAvatar.tsx`

1. Enviar `nombre_visible` + `apariencia` completa al backend
2. Preview 3D en tiempo real mientras se personaliza
3. Guardar en `PUT /api/avatar/custom`

### Task 3.6: Commit

```bash
git add server/src/index.ts src/components/Avatar3D.tsx src/components/CustomAvatar.tsx
git commit -m "feat(security): bitacora, datos personales, consentimientos + avatar mejorado"
```

---

## Sprint 4: API Académica + Campus 3D (Pedro + Melvin)

**Objetivo:** Endpoints de espacios/asistencia/reporte y escena 3D del campus.

**Responsables:** Pedro Rodríguez (API) + Melvin Chipana (escena 3D)

### Task 4.1: API espacios con control de acceso (Pedro)

**Endpoint:** `GET /api/espacios` (modificar)

Lógica RBAC:
- Campus → público para todos
- Aulas → solo si está inscrito (`inscripciones`) o es el docente de la asignatura

### Task 4.2: API asistencia REST (Pedro)

**Endpoint:** `POST /api/asistencia` (nuevo)

```
Body: { espacio_id: number }
Solo estudiantes (verificar usuario_roles)
Buscar sesión en_curso para ese espacio
Calcular presente/tarde según tolerancia_min
INSERT ... ON CONFLICT DO NOTHING (idempotente)
Respuesta: { registrada, estado, hora_ingreso, motivo? }
```

### Task 4.3: API reporte docente (Pedro)

**Endpoint:** `GET /api/reporte?sesion_id=N`

Verificar: usuario es docente Y es el docente de esa sesión.
Incluir `registro_upds` (JOIN perfiles_estudiante).

### Task 4.4: Campus 3D completo (Melvin)

**Archivo:** `src/components/MetaversoCanvas.tsx` — componente `Escenario`

Reconstruir campus según el plan original:
- Suelo verde 100x100
- Camino central gris
- Edificio del aula al fondo
- **Puerta verde** (zona de detección para transición)
- Edificios decorativos
- Árboles
- Iluminación hemisférica + direccional con sombras

Coordenadas del plan:
- Suelo: (0, 0, 0)
- Camino: (0, 0.01, -5)
- Edificio: (0, 5, -32)
- Puerta verde: (0, 3, -24.9) — 4x6, color `#22c55e`

### Task 4.5: Commit

```bash
git add server/src/index.ts src/components/MetaversoCanvas.tsx
git commit -m "feat(api): espacios con RBAC, asistencia REST, reporte + campus 3D"
```

---

## Sprint 5: Integración Backend + Correcciones (Néstor + Pedro)

**Objetivo:** Unificar backend, corregir chat roto, verificar integridad.

**Responsables:** Néstor Ávila (integración) + Pedro Rodríguez (chat)

### Task 5.1: Fix chat en tiempo real (Pedro)

**Archivo:** `server/src/socketHandler.ts`

Agregar handler para `chat_msg_send`:
```typescript
socket.on('chat_msg_send', (data) => {
  socket.to(data.espacioId).emit('chat_msg_received', data.message);
});
```

### Task 5.2: Fix App.css dead code (Néstor)

- Eliminar `src/App.css` (CSS scaffold de Vite no usado)
- Eliminar import en `App.tsx`
- Eliminar assets: `hero.png`, `react.svg`, `vite.svg`

### Task 5.3: Eliminar URLs hardcodeadas (Néstor)

| Archivo | Cambio |
|---|---|
| `Login.tsx:21` | Eliminar `API_URL`, usar `/api/auth/...` |
| `CustomAvatar.tsx:30` | `/api/avatar/custom` |
| `App.tsx:83` | `/api/espacios` |
| `App.tsx:101` | `io()` sin argumentos |
| `App.tsx:242` | `/api/sesiones` |
| `App.tsx:272` | `/api/asistencias/...` |
| `AudioClient.ts:42` | Detectar de `window.location` |

### Task 5.4: Fix toggleMics (Pedro)

Mover función antes del return o eliminar wrapper innecesario.

### Task 5.5: Verificación integral (Néstor)

Pruebas manuales:
1. Login docente → funciona
2. Login × 5 con mala → bloquea 15 min
3. Registro estudiante → crea todo (usuario, avatar, perfil, inscripción)
4. Campus 3D renderiza → edificio, camino, puerta
5. Chat entre 2 ventanas → mensajes llegan
6. Docente crea sesión → asistencia se registra
7. Docente ve reporte → muestra asistencias

### Task 5.6: Commit

```bash
git add -A
git commit -m "fix: chat en tiempo real, eliminar URLs hardcodeadas, limpieza"
```

---

## Sprint 6: Dashboard + HUD + Interfaz (Cristian)

**Objetivo:** Dashboard de espacios y HUD del mundo 3D.

**Responsable:** Cristian Mamani

### Task 6.1: Dashboard mejorado

Mejoras en Flujo 3 de `App.tsx`:
1. Mostrar rol del usuario en header
2. Docentes: botón "Iniciar Clase" + acceso a reporte
3. Cards mejoradas: icono, capacidad, estado
4. Badge "En vivo" si hay sesión activa
5. Loading skeleton mientras carga espacios

### Task 6.2: HUD con toasts de asistencia

Toast notifications (adaptado del plan original):
- Verde: "Asistencia registrada: PRESENTE"
- Amarillo: "Asistencia registrada: TARDE"
- Rojo: "No hay una clase en curso"

Plus:
- Indicador mic muted/unmuted
- Contador usuarios en tiempo real
- Indicador VoIP (conectado/conectando)
- Pizarra solo visible en aula con sesión activa

### Task 6.3: Reporte modal mejorado

- Columnas: Estudiante, Registro UPDS, Ingreso, Salida, Estado
- Colores por estado
- Botón "Exportar CSV"
- Conteo: X presentes, Y tardes, Z ausentes

### Task 6.4: Commit

```bash
git add src/App.tsx src/index.css
git commit -m "feat(ui): dashboard mejorado, HUD con toasts, reporte modal"
```

---

## Sprint 7: Aula 3D + Transiciones + Asistencia Visual (Melvin + Ignacio)

**Objetivo:** Interior del aula, transiciones campus↔aula, feedback visual.

**Responsables:** Melvin Chipana (escena) + Ignacio Calvimontes (interacción)

### Task 7.1: Interior del aula 3D (Melvin)

Aula en `Escenario` (isAula=true):
- Piso madera (#8d8578)
- Paredes laterales + frontal
- Pizarra blanca
- Bancos en filas (2×3)
- Escritorio docente
- Iluminación interior

### Task 7.2: Transiciones campus↔aula (Melvin + Ignacio)

Implementación:
1. **Detección de puerta** en `PlayerController`:
   - Campus: si `z < -22` → emitir `enter_aula`
   - Aula: si `z > 12` → volver al campus
2. **Transición visual**: fade-out → cambio de espacio → fade-in
3. **Llamada a asistencia**: `POST /api/asistencia` al entrar
4. **Toast resultado**: mostrar estado de asistencia

### Task 7.3: Sonido de transición (Ignacio)

Efecto "whoosh" sutil al entrar/salir del aula.

### Task 7.4: Commit

```bash
git add src/App.tsx src/components/MetaversoCanvas.tsx
git commit -m "feat(3d): aula interior, transiciones campus↔aula con asistencia visual"
```

---

## Sprint 8: Documentación + Polish (Lucas + Néstor)

**Objetivo:** Documentación completa, polish final.

**Responsables:** Lucas Vargas (docs) + Néstor Ávila (revisión)

### Task 8.1: README.md actualizado (Lucas)

Reescribir con stack actual: React + Node + PostgreSQL. Incluir instalación, usuarios demo, requerimientos cubiertos.

### Task 8.2: Documentación API (Lucas)

**Archivo nuevo:** `docs/api.md`

Documentar los 13+ endpoints con métodos, parámetros, respuestas y ejemplos curl.

### Task 8.3: Limpiar docs obsoletos (Lucas)

- Eliminar `database.md` o mover a `docs/`
- Agregar nota obsoleta al inicio de `2026-07-15-esqueleto-app.md`

### Task 8.4: Commit final

```bash
git add README.md docs/ database.md 2026-07-15-esqueleto-app.md
git commit -m "docs: documentación completa, README actualizado, marcado obsoleto"
```

---

## Cronograma

| Sprint | Fechas | Responsables | Dependencias |
|---|---|---|---|
| **S1: Fundamentos** | 20-21/07 | Néstor + Horacio | Ninguna |
| **S2: Auth + RBAC** | 22-23/07 | Pedro + Cristian | S1 |
| **S3: Seguridad + Avatar** | 24-25/07 | Horacio + Ignacio | S1, S2 |
| **S4: API Académica + Campus** | 25-26/07 | Pedro + Melvin | S1 |
| **S5: Integración** | 26/07 | Néstor + Pedro | S2, S3, S4 |
| **S6: Dashboard + HUD** | 27/07 | Cristian | S2, S5 |
| **S7: Aula + Transiciones** | 27-28/07 | Melvin + Ignacio | S4, S5 |
| **S8: Documentación** | 28/07 | Lucas + Néstor | Todos |

---

## Criterios de Aceptación

1. **Auth:** 5 usuarios demo autentican; registro crea usuario+avatar+perfil+inscripción
2. **RBAC:** Docente no accede a endpoints admin; estudiante no crea sesiones
3. **Asistencia:** Entrar al aula registra automáticamente (presente/tarde); idempotente
4. **3D:** Campus con edificio y puerta; aula con pizarra y bancos; transiciones con fade
5. **Chat:** Mensajes se transmiten en tiempo real entre todos del espacio
6. **VoIP:** Audio espacial funciona (más fuerte al cercano)
7. **Pizarra:** Dibujos sincronizados y persistidos
8. **Reporte:** Docente ve tabla con estados y horas
9. **Seguridad:** Bloqueo tras 5 intentos; bitácora; sin URLs hardcodeadas
10. **Docker:** `docker compose up -d` levanta PostgreSQL con schema + datos semilla
