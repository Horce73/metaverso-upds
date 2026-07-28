# Esqueleto de la Aplicación (Metaverso UPDS) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el esqueleto funcional del metaverso educativo: API PHP (login, registro, espacios, asistencia automática, reporte) sobre la base MySQL `metaverso_upds` ya existente, y un mundo 3D en Three.js (campus + aula) donde entrar al aula registra la asistencia.

**Architecture:** Frontend estático (HTML/CSS/JS con Three.js desde CDN) servido por Apache/XAMPP desde `C:\xampp\htdocs\metaverso_ing_software_I`. Backend PHP plano (sin framework) en `api/` con sesiones PHP y PDO hacia MySQL. La base de datos ya existe con datos semilla (ver `database/schema_mysql.sql`).

**Tech Stack:** PHP 8 (XAMPP, `C:\xampp\php\php.exe`), MySQL/MariaDB de XAMPP (root sin contraseña, puerto 3306), Three.js 0.160 vía CDN jsdelivr, JavaScript ES Modules. Sin frameworks ni npm.

## Global Constraints

- Directorio del proyecto: `C:\xampp\htdocs\metaverso_ing_software_I` (rutas de este plan son relativas a él).
- Todo texto visible al usuario en **español**.
- Contraseñas siempre con `password_hash()`/`password_verify()` bcrypt (RNF-05). Nunca texto plano.
- La API responde siempre JSON UTF-8; errores con código HTTP apropiado y `{"error": "..."}`.
- No se persiste audio de voz (RNF-03/RNF-16 del diseño). La voz NO forma parte de este plan.
- La base `metaverso_upds` ya existe con 18 tablas y datos semilla (esquema v2.3 normalizado en 3FN: RBAC con `roles`/`usuario_roles`, `datos_personales`, `carreras`, `perfiles_estudiante`, `perfiles_docente`, `sesion_materiales`, `bitacora`). NO volver a ejecutar `schema_mysql.sql` (destruiría datos); solo consultarla.
- Integridad reforzada por la BD: `inscripciones.usuario_id` y `asistencias.usuario_id` referencian `perfiles_estudiante` (solo estudiantes); `asignaturas.docente_id` y `sesiones_clase.docente_id` referencian `perfiles_docente` (solo docentes). MariaDB corre en modo estricto (`STRICT_TRANS_TABLES`).
- RBAC: el rol NO es una columna de `usuarios`; se obtiene con JOIN a `usuario_roles`/`roles`. La sesión PHP guarda `rol` (principal) y `roles` (lista completa).
- La aplicación se conecta a MySQL como `metaverso_app` / contraseña `metaverso_dev_2026` (privilegios mínimos, solo DML), NUNCA como root. El usuario ya existe (lo crea el esquema).
- MySQL debe estar corriendo (`mysqld` de XAMPP). Si el puerto 3306 no responde, arrancarlo: `"C:/xampp/mysql/bin/mysqld.exe" --defaults-file=C:/xampp/mysql/bin/my.ini --standalone` en segundo plano.
- Servidor de pruebas para la API: `"C:/xampp/php/php.exe" -S 127.0.0.1:8080` ejecutado desde la raíz del proyecto (en segundo plano). Las pruebas curl usan esa URL.
- Usuarios demo (todos con contraseña `upds2026`, ya aplicada): admin `admin@upds.edu.bo`; docente `docente.isw@upds.edu.bo`; estudiantes `ana.rojas@upds.edu.bo`, `luis.garcia@upds.edu.bo`, `maria.flores@upds.edu.bo`.
- Los archivos `api/config.php`, `api/login.php`, `api/registro.php`, `api/logout.php` **ya existen** con el contenido exacto que muestran las Tareas 2 y 3. Verificar que coinciden; si difieren, sobrescribir con el código del plan.

---

### Task 0: Repositorio git y verificación del entorno

**Responsable:** Néstor Ávila (Backend/Scrum Master) · **Fecha:** 16/07/2026

**Files:**
- Create: `.gitignore`

**Interfaces:**
- Produces: repositorio git inicializado; entorno verificado (MySQL arriba, PHP disponible).

- [ ] **Step 1: Verificar PHP y MySQL**

Run (Git Bash):
```bash
"C:/xampp/php/php.exe" -v && "C:/xampp/mysql/bin/mysql.exe" -u root -e "USE metaverso_upds; SELECT COUNT(*) AS usuarios FROM usuarios;"
```
Expected: versión PHP 8.x y una tabla con `usuarios | 5`. Si MySQL no responde (error de conexión), arrancarlo según Global Constraints y reintentar.

- [ ] **Step 2: Crear `.gitignore`**

```gitignore
.remember/
.claude/
cookies*.txt
*.log
```

- [ ] **Step 3: Inicializar git y commit inicial**

```bash
cd "C:/xampp/htdocs/metaverso_ing_software_I"
git init
git add .gitignore database/ docs/ api/ 2>/dev/null || git add .gitignore database/ docs/
git commit -m "chore: estado inicial del proyecto (BD, docs, api parcial)"
```
Expected: commit creado sin errores.

---

### Task 1: Verificar contraseñas demo

**Responsable:** Horacio López (Backend) · **Fecha:** 17/07/2026

El script `database/actualizar_passwords_demo.php` **ya existe y ya fue ejecutado** (los 5 usuarios demo autentican con `upds2026`). Esta tarea solo lo verifica y lo deja versionado.

**Files:**
- Verify: `database/actualizar_passwords_demo.php` (ya existe)

**Interfaces:**
- Produces: garantía de que los 5 usuarios demo autentican con la contraseña `upds2026`.

- [ ] **Step 1: Re-ejecutar el script (es idempotente) y verificar**

Run:
```bash
"C:/xampp/php/php.exe" database/actualizar_passwords_demo.php
```
Expected: `Usuarios demo actualizados: 5. Contraseña: upds2026`

Run verificación:
```bash
"C:/xampp/php/php.exe" -r "\$p=new PDO('mysql:host=127.0.0.1;dbname=metaverso_upds','root','');\$h=\$p->query(\"SELECT password_hash FROM usuarios WHERE email='ana.rojas@upds.edu.bo'\")->fetchColumn();var_dump(password_verify('upds2026',\$h));"
```
Expected: `bool(true)`

- [ ] **Step 2: Commit**

```bash
git add database/actualizar_passwords_demo.php database/schema_mysql.sql
git commit -m "feat(db): esquema v2 RBAC y script de contraseñas demo"
```

---

### Task 2: API de autenticación (config, login, yo, logout)

**Responsable:** Pedro Rodríguez (Backend) · **Fecha:** 17-18/07/2026 · Revisión de seguridad: Néstor Ávila (23/07)

**Files:**
- Create/Verify: `api/config.php`, `api/login.php`, `api/logout.php` (ya existen — verificar contra el código de abajo)
- Create: `api/yo.php`

**Interfaces:**
- Produces (usado por todas las tareas siguientes):
  - `db(): PDO` — conexión compartida.
  - `json_out(array $data, int $code = 200): void` — responde JSON y termina.
  - `entrada_json(): array` — cuerpo JSON de la petición.
  - `usuario_actual(): ?array` — usuario en sesión o null.
  - `requiere_sesion(): array` — devuelve el usuario o corta con 401.
  - Sesión PHP: `$_SESSION['usuario']` = `{id, registro_upds, email, nombre, apellido, rol}`.
  - Endpoints: `POST api/login.php {email, password}` → `{usuario, avatar}`; `GET api/yo.php` → `{usuario, avatar}`; `POST api/logout.php` → `{ok: true}`.
  - Forma de `avatar`: `{nombre_visible: string, apariencia: {genero?: string, color?: string, ...}}` o `null`.

- [ ] **Step 1: `api/config.php`**

```php
<?php
// Conexión y utilidades compartidas de la API.
// RNF-05: la app se conecta con 'metaverso_app' (privilegios mínimos), no root.
declare(strict_types=1);
session_start();

const DB_DSN  = 'mysql:host=127.0.0.1;port=3306;dbname=metaverso_upds;charset=utf8mb4';
const DB_USER = 'metaverso_app';
const DB_PASS = 'metaverso_dev_2026';   // desarrollo local; cambiar en producción

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(DB_DSN, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }
    return $pdo;
}

function json_out(array $data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function entrada_json(): array {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

function usuario_actual(): ?array {
    return $_SESSION['usuario'] ?? null;
}

// Corta la petición con 401 si no hay sesión iniciada (RNF-05).
function requiere_sesion(): array {
    $u = usuario_actual();
    if ($u === null) {
        json_out(['error' => 'No autenticado'], 401);
    }
    return $u;
}

// Corta con 403 si el usuario en sesión no tiene el rol requerido (RBAC).
function requiere_rol(string $rol): array {
    $u = requiere_sesion();
    if (!in_array($rol, $u['roles'] ?? [], true)) {
        json_out(['error' => 'No tienes permisos para esta operación'], 403);
    }
    return $u;
}

// Registra un evento de seguridad/actividad en la bitácora (RNF-05).
function bitacora(?int $usuarioId, string $evento, string $detalle = ''): void {
    db()->prepare('INSERT INTO bitacora (usuario_id, evento, detalle, ip) VALUES (?,?,?,?)')
        ->execute([$usuarioId, $evento, $detalle, $_SERVER['REMOTE_ADDR'] ?? '']);
}
```

- [ ] **Step 2: `api/login.php`**

```php
<?php
// RF-06: inicio de sesión con RBAC. Verifica hash bcrypt, aplica bloqueo
// temporal tras 5 intentos fallidos y registra el evento en la bitácora (RNF-05).
require __DIR__ . '/config.php';

$in    = entrada_json();
$email = trim($in['email'] ?? '');
$pass  = $in['password'] ?? '';

if ($email === '' || $pass === '') {
    json_out(['error' => 'Correo y contraseña son obligatorios'], 400);
}

$stmt = db()->prepare(
    'SELECT id, email, password_hash, nombre, apellido, intentos_fallidos, bloqueado_hasta
     FROM usuarios WHERE email = ? AND activo = 1'
);
$stmt->execute([$email]);
$u = $stmt->fetch();

// Cuenta bloqueada temporalmente (RNF-05).
if ($u && $u['bloqueado_hasta'] !== null && new DateTime($u['bloqueado_hasta']) > new DateTime()) {
    bitacora((int)$u['id'], 'login_bloqueado');
    json_out(['error' => 'Cuenta bloqueada temporalmente por intentos fallidos. Intenta en unos minutos.'], 423);
}

if (!$u || !password_verify($pass, $u['password_hash'])) {
    if ($u) {
        $fallos  = (int)$u['intentos_fallidos'] + 1;
        $bloqueo = $fallos >= 5 ? (new DateTime('+15 minutes'))->format('Y-m-d H:i:s') : null;
        db()->prepare('UPDATE usuarios SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id = ?')
            ->execute([$fallos >= 5 ? 0 : $fallos, $bloqueo, $u['id']]);
        bitacora((int)$u['id'], 'login_fallido');
    }
    json_out(['error' => 'Correo o contraseña incorrectos'], 401);
}

// Roles del usuario (RBAC): un usuario puede tener más de uno.
$r = db()->prepare(
    'SELECT r.nombre FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id WHERE ur.usuario_id = ?'
);
$r->execute([$u['id']]);
$roles = array_column($r->fetchAll(), 'nombre');
if (!$roles) {
    json_out(['error' => 'El usuario no tiene roles asignados'], 403);
}

db()->prepare('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = NOW() WHERE id = ?')
    ->execute([$u['id']]);
bitacora((int)$u['id'], 'login_ok');

$av = db()->prepare('SELECT nombre_visible, apariencia FROM avatares WHERE usuario_id = ?');
$av->execute([$u['id']]);
$avatar = $av->fetch() ?: null;
if ($avatar) {
    $avatar['apariencia'] = json_decode($avatar['apariencia'], true);
}

session_regenerate_id(true);   // evita fijación de sesión
$_SESSION['usuario'] = [
    'id'       => (int)$u['id'],
    'email'    => $u['email'],
    'nombre'   => $u['nombre'],
    'apellido' => $u['apellido'],
    'rol'      => $roles[0],
    'roles'    => $roles,
];

json_out(['usuario' => $_SESSION['usuario'], 'avatar' => $avatar]);
```

- [ ] **Step 3: `api/yo.php`**

```php
<?php
// Devuelve el usuario de la sesión actual y su avatar (para mundo.html).
require __DIR__ . '/config.php';
$u = requiere_sesion();

$av = db()->prepare('SELECT nombre_visible, apariencia FROM avatares WHERE usuario_id = ?');
$av->execute([$u['id']]);
$avatar = $av->fetch() ?: null;
if ($avatar) {
    $avatar['apariencia'] = json_decode($avatar['apariencia'], true);
}

json_out(['usuario' => $u, 'avatar' => $avatar]);
```

- [ ] **Step 4: `api/logout.php`**

```php
<?php
require __DIR__ . '/config.php';
$_SESSION = [];
session_destroy();
json_out(['ok' => true]);
```

- [ ] **Step 5: Levantar servidor de pruebas y probar el flujo completo**

Run (una vez, en segundo plano, desde la raíz del proyecto):
```bash
cd "C:/xampp/htdocs/metaverso_ing_software_I" && "C:/xampp/php/php.exe" -S 127.0.0.1:8080 &
```

Run pruebas:
```bash
# 1) Login incorrecto -> 401
curl -s -o /dev/null -w "%{http_code}\n" -H "Content-Type: application/json" \
  -d '{"email":"ana.rojas@upds.edu.bo","password":"mala"}' http://127.0.0.1:8080/api/login.php
# 2) Login correcto -> guarda cookie de sesión
curl -s -c /tmp/cookies.txt -H "Content-Type: application/json" \
  -d '{"email":"ana.rojas@upds.edu.bo","password":"upds2026"}' http://127.0.0.1:8080/api/login.php
# 3) Sesión activa
curl -s -b /tmp/cookies.txt http://127.0.0.1:8080/api/yo.php
# 4) Logout y verificación de 401
curl -s -b /tmp/cookies.txt -X POST http://127.0.0.1:8080/api/logout.php
curl -s -o /dev/null -w "%{http_code}\n" -b /tmp/cookies.txt http://127.0.0.1:8080/api/yo.php
```
Expected:
1. `401`
2. JSON con `"usuario"` (email de Ana, `"rol":"estudiante"`, `"roles":["estudiante"]`, sin `password_hash`) y `"avatar"` con `nombre_visible: "Ana R."`.
3. El mismo usuario y avatar.
4. `{"ok":true}` y luego `401`.

Run prueba de bloqueo por intentos fallidos (usa a Luis para no bloquear a Ana):
```bash
for i in 1 2 3 4 5; do curl -s -o /dev/null -w "%{http_code} " -H "Content-Type: application/json" \
  -d '{"email":"luis.garcia@upds.edu.bo","password":"mala"}' http://127.0.0.1:8080/api/login.php; done; echo
curl -s -o /dev/null -w "%{http_code}\n" -H "Content-Type: application/json" \
  -d '{"email":"luis.garcia@upds.edu.bo","password":"upds2026"}' http://127.0.0.1:8080/api/login.php
```
Expected: `401 401 401 401 401` y luego `423` (bloqueado aun con la contraseña correcta). Desbloquear para no estorbar pruebas posteriores:
```bash
"C:/xampp/mysql/bin/mysql.exe" -u root -e "USE metaverso_upds; UPDATE usuarios SET bloqueado_hasta = NULL, intentos_fallidos = 0 WHERE email='luis.garcia@upds.edu.bo';"
```
Verificar bitácora:
```bash
"C:/xampp/mysql/bin/mysql.exe" -u root -e "USE metaverso_upds; SELECT evento, COUNT(*) FROM bitacora GROUP BY evento;"
```
Expected: filas con `login_ok`, `login_fallido` (5) y `login_bloqueado` (1).

- [ ] **Step 6: Commit**

```bash
git add api/config.php api/login.php api/yo.php api/logout.php
git commit -m "feat(api): autenticación con sesiones PHP y bcrypt (RF-06, RNF-05)"
```

---

### Task 3: API de registro de usuarios

**Responsable:** Horacio López (Backend) · **Fecha:** 18/07/2026

**Files:**
- Create/Verify: `api/registro.php` (ya existe — verificar contra el código de abajo)

**Interfaces:**
- Consumes: helpers de `api/config.php` (Task 2).
- Produces: `POST api/registro.php {email, password, nombre, apellido, nombre_visible?, color?, genero?, acepta_datos}` → 201 `{usuario, avatar}`. Inscribe automáticamente en las asignaturas activas y registra el consentimiento (RNF-03).

- [ ] **Step 1: `api/registro.php`**

```php
<?php
// RF-06 (registro) + RF-01 (creación del avatar) + RNF-03 (consentimiento).
require __DIR__ . '/config.php';

$in       = entrada_json();
$email    = trim($in['email'] ?? '');
$pass     = $in['password'] ?? '';
$nombre   = trim($in['nombre'] ?? '');
$apellido = trim($in['apellido'] ?? '');
$visible  = trim($in['nombre_visible'] ?? '') ?: $nombre;
$color    = $in['color'] ?? '#3b82f6';
$genero   = $in['genero'] ?? 'n';
$acepta   = (bool)($in['acepta_datos'] ?? false);

if ($email === '' || $pass === '' || $nombre === '' || $apellido === '') {
    json_out(['error' => 'Todos los campos son obligatorios'], 400);
}
if (strlen($pass) < 6) {
    json_out(['error' => 'La contraseña debe tener al menos 6 caracteres'], 400);
}
if (!$acepta) {
    json_out(['error' => 'Debes aceptar la política de tratamiento de datos'], 400);
}

$pdo = db();
try {
    $pdo->beginTransaction();

    $pdo->prepare('INSERT INTO usuarios (email, password_hash, nombre, apellido)
                   VALUES (?,?,?,?)')
        ->execute([$email, password_hash($pass, PASSWORD_BCRYPT), $nombre, $apellido]);
    $uid = (int)$pdo->lastInsertId();

    // RBAC: rol estudiante + perfil académico vacío (lo completa la U al validar)
    $pdo->prepare('INSERT INTO usuario_roles (usuario_id, rol_id)
                   SELECT ?, id FROM roles WHERE nombre = \'estudiante\'')
        ->execute([$uid]);
    $pdo->prepare('INSERT INTO perfiles_estudiante (usuario_id) VALUES (?)')
        ->execute([$uid]);
    $pdo->prepare('INSERT INTO datos_personales (usuario_id) VALUES (?)')
        ->execute([$uid]);

    $apariencia = json_encode(['genero' => $genero, 'color' => $color], JSON_UNESCAPED_UNICODE);
    $pdo->prepare('INSERT INTO avatares (usuario_id, nombre_visible, apariencia)
                   VALUES (?,?,?)')
        ->execute([$uid, $visible, $apariencia]);

    $pdo->prepare('INSERT INTO consentimientos (usuario_id, tipo, otorgado, version_politica)
                   VALUES (?,\'tratamiento_datos\',1,\'v1.0\')')
        ->execute([$uid]);

    // Piloto: se inscribe automáticamente en las asignaturas activas (solo ISW).
    $pdo->prepare('INSERT INTO inscripciones (usuario_id, asignatura_id)
                   SELECT ?, id FROM asignaturas WHERE activa = 1')
        ->execute([$uid]);

    $pdo->commit();
} catch (PDOException $e) {
    $pdo->rollBack();
    if ($e->getCode() === '23000') {
        json_out(['error' => 'Ese correo ya está registrado'], 409);
    }
    throw $e;
}

bitacora($uid, 'registro');

$_SESSION['usuario'] = [
    'id' => $uid, 'email' => $email,
    'nombre' => $nombre, 'apellido' => $apellido,
    'rol' => 'estudiante', 'roles' => ['estudiante'],
];

json_out([
    'usuario' => $_SESSION['usuario'],
    'avatar'  => ['nombre_visible' => $visible, 'apariencia' => ['genero' => $genero, 'color' => $color]],
], 201);
```

- [ ] **Step 2: Probar registro, duplicado e inscripción automática**

Run:
```bash
# 1) Registro nuevo -> 201
curl -s -w "\n%{http_code}\n" -c /tmp/ck_reg.txt -H "Content-Type: application/json" \
  -d '{"email":"test.estudiante@upds.edu.bo","password":"secreta1","nombre":"Test","apellido":"Estudiante","color":"#e74c3c","genero":"f","acepta_datos":true}' \
  http://127.0.0.1:8080/api/registro.php
# 2) Mismo correo otra vez -> 409
curl -s -o /dev/null -w "%{http_code}\n" -H "Content-Type: application/json" \
  -d '{"email":"test.estudiante@upds.edu.bo","password":"secreta1","nombre":"Test","apellido":"Estudiante","acepta_datos":true}' \
  http://127.0.0.1:8080/api/registro.php
# 3) Sin consentimiento -> 400
curl -s -o /dev/null -w "%{http_code}\n" -H "Content-Type: application/json" \
  -d '{"email":"otro@upds.edu.bo","password":"secreta1","nombre":"Otro","apellido":"Test","acepta_datos":false}' \
  http://127.0.0.1:8080/api/registro.php
```
Expected: (1) JSON con `usuario.email = test.estudiante@upds.edu.bo` y código `201`; (2) `409`; (3) `400`.

Run verificación en BD (rol RBAC + perfil + avatar + inscripción + consentimiento creados):
```bash
"C:/xampp/mysql/bin/mysql.exe" -u root -e "USE metaverso_upds; SELECT (SELECT COUNT(*) FROM usuario_roles ur JOIN usuarios u ON u.id=ur.usuario_id JOIN roles r ON r.id=ur.rol_id WHERE u.email='test.estudiante@upds.edu.bo' AND r.nombre='estudiante') AS rol, (SELECT COUNT(*) FROM perfiles_estudiante pe JOIN usuarios u ON u.id=pe.usuario_id WHERE u.email='test.estudiante@upds.edu.bo') AS perfil, (SELECT COUNT(*) FROM avatares av JOIN usuarios u ON u.id=av.usuario_id WHERE u.email='test.estudiante@upds.edu.bo') AS avatar, (SELECT COUNT(*) FROM inscripciones i JOIN usuarios u ON u.id=i.usuario_id WHERE u.email='test.estudiante@upds.edu.bo') AS inscrito, (SELECT COUNT(*) FROM consentimientos c JOIN usuarios u ON u.id=c.usuario_id WHERE u.email='test.estudiante@upds.edu.bo') AS consent;"
```
Expected: `rol 1 | perfil 1 | avatar 1 | inscrito 1 | consent 1`.

- [ ] **Step 3: Commit**

```bash
git add api/registro.php
git commit -m "feat(api): registro con avatar, consentimiento e inscripción automática (RF-01, RF-06, RNF-03)"
```

---

### Task 4: API académica (espacios, asistencia automática, reporte)

**Responsable:** Pedro Rodríguez (`espacios.php`, `reporte.php`) y Horacio López (`asistencia.php`) · **Fecha:** 19/07/2026

**Files:**
- Create: `api/espacios.php`
- Create: `api/asistencia.php`
- Create: `api/reporte.php`

**Interfaces:**
- Consumes: helpers de `api/config.php` (Task 2).
- Produces:
  - `GET api/espacios.php` → `{espacios: [{id, nombre, tipo, escena_url, capacidad_max, asignatura}]}` (campus siempre; aulas solo si está inscrito o es el docente).
  - `POST api/asistencia.php {espacio_id}` → `{registrada: true, estado: 'presente'|'tarde', hora_ingreso}` o `{registrada: false, motivo: 'sin_sesion'|'docente'}`. Idempotente (entrar dos veces no duplica).
  - `GET api/reporte.php?sesion_id=N` (solo docente dueño de la sesión) → `{sesion, asistencias: [...]}` (RF-08).

- [ ] **Step 1: `api/espacios.php`**

```php
<?php
// RF-02: espacios a los que este usuario puede entrar.
// El campus es público; las aulas exigen inscripción o ser el docente.
require __DIR__ . '/config.php';
$u = requiere_sesion();

$stmt = db()->prepare(
    'SELECT e.id, e.nombre, e.tipo, e.escena_url, e.capacidad_max,
            a.nombre AS asignatura
     FROM espacios e
     LEFT JOIN asignaturas a ON a.id = e.asignatura_id
     LEFT JOIN inscripciones i
            ON i.asignatura_id = e.asignatura_id AND i.usuario_id = :uid
     WHERE e.activo = 1
       AND (e.tipo = \'campus\' OR i.usuario_id IS NOT NULL OR a.docente_id = :uid2)'
);
$stmt->execute(['uid' => $u['id'], 'uid2' => $u['id']]);

json_out(['espacios' => $stmt->fetchAll()]);
```

- [ ] **Step 2: `api/asistencia.php`**

```php
<?php
// RF-05: registro automático de asistencia al entrar al aula.
// Marca 'tarde' si supera la tolerancia de la sesión (RF-08).
require __DIR__ . '/config.php';
$u = requiere_sesion();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_out(['error' => 'Método no permitido'], 405);
}
$espacioId = (int)(entrada_json()['espacio_id'] ?? 0);

// Solo los estudiantes registran asistencia (docente y admin no).
if (!in_array('estudiante', $u['roles'] ?? [], true)) {
    json_out(['registrada' => false, 'motivo' => 'no_estudiante']);
}

$s = db()->prepare(
    "SELECT id, COALESCE(inicio_real, inicio_programado) AS inicio, tolerancia_min
     FROM sesiones_clase
     WHERE espacio_id = ? AND estado = 'en_curso'
     ORDER BY inicio_programado DESC LIMIT 1"
);
$s->execute([$espacioId]);
$sesion = $s->fetch();

if (!$sesion) {
    json_out(['registrada' => false, 'motivo' => 'sin_sesion']);
}

$limite = (new DateTime($sesion['inicio']))
    ->modify('+' . (int)$sesion['tolerancia_min'] . ' minutes');
$estado = (new DateTime()) > $limite ? 'tarde' : 'presente';

// INSERT IGNORE + clave única (sesion_id, usuario_id): salir y volver no duplica.
db()->prepare('INSERT IGNORE INTO asistencias (sesion_id, usuario_id, estado) VALUES (?,?,?)')
    ->execute([$sesion['id'], $u['id'], $estado]);

$q = db()->prepare('SELECT estado, hora_ingreso FROM asistencias WHERE sesion_id = ? AND usuario_id = ?');
$q->execute([$sesion['id'], $u['id']]);
$fila = $q->fetch();

json_out(['registrada' => true, 'estado' => $fila['estado'], 'hora_ingreso' => $fila['hora_ingreso']]);
```

- [ ] **Step 3: `api/reporte.php`**

```php
<?php
// RF-08: reporte de asistencia de una sesión, solo para su docente (RBAC).
require __DIR__ . '/config.php';
$u = requiere_rol('docente');

$sesionId = (int)($_GET['sesion_id'] ?? 0);

$s = db()->prepare(
    'SELECT id, tema, inicio_programado, estado
     FROM sesiones_clase WHERE id = ? AND docente_id = ?'
);
$s->execute([$sesionId, $u['id']]);
$sesion = $s->fetch();

if (!$sesion) {
    json_out(['error' => 'Sesión no encontrada'], 404);
}

// registro_upds vive en el perfil del estudiante (esquema RBAC v2).
$a = db()->prepare(
    'SELECT pe.registro_upds, u.nombre, u.apellido, a.hora_ingreso, a.hora_salida, a.estado
     FROM asistencias a
     JOIN usuarios u ON u.id = a.usuario_id
     LEFT JOIN perfiles_estudiante pe ON pe.usuario_id = u.id
     WHERE a.sesion_id = ?
     ORDER BY u.apellido'
);
$a->execute([$sesionId]);

json_out(['sesion' => $sesion, 'asistencias' => $a->fetchAll()]);
```

- [ ] **Step 4: Poner la sesión semilla "en vivo" para pruebas deterministas**

La sesión semilla (id 1) tiene horarios del 15/07/2026 19:00; para que la prueba dé `presente`, moverla al momento actual:

```bash
"C:/xampp/mysql/bin/mysql.exe" -u root -e "USE metaverso_upds; UPDATE sesiones_clase SET inicio_programado = NOW(), fin_programado = DATE_ADD(NOW(), INTERVAL 90 MINUTE), inicio_real = NOW(), estado = 'en_curso' WHERE id = 1;"
```
Expected: sin errores.

- [ ] **Step 5: Probar los tres endpoints**

Run:
```bash
# Login como María (estudiante SIN asistencia previa en la sesión 1)
curl -s -c /tmp/ck_maria.txt -H "Content-Type: application/json" \
  -d '{"email":"maria.flores@upds.edu.bo","password":"upds2026"}' http://127.0.0.1:8080/api/login.php > /dev/null
# 1) Espacios visibles para María
curl -s -b /tmp/ck_maria.txt http://127.0.0.1:8080/api/espacios.php
# 2) Entrar al aula (espacio 2) -> registra asistencia
curl -s -b /tmp/ck_maria.txt -H "Content-Type: application/json" \
  -d '{"espacio_id":2}' http://127.0.0.1:8080/api/asistencia.php
# 3) Repetir -> idempotente, mismo estado
curl -s -b /tmp/ck_maria.txt -H "Content-Type: application/json" \
  -d '{"espacio_id":2}' http://127.0.0.1:8080/api/asistencia.php
# 4) Reporte como docente
curl -s -c /tmp/ck_doc.txt -H "Content-Type: application/json" \
  -d '{"email":"docente.isw@upds.edu.bo","password":"upds2026"}' http://127.0.0.1:8080/api/login.php > /dev/null
curl -s -b /tmp/ck_doc.txt "http://127.0.0.1:8080/api/reporte.php?sesion_id=1"
# 5) Reporte como estudiante -> 403
curl -s -o /dev/null -w "%{http_code}\n" -b /tmp/ck_maria.txt "http://127.0.0.1:8080/api/reporte.php?sesion_id=1"
```
Expected: (1) 2 espacios: `Campus Central UPDS` (campus) y `Aula Ingenieria de Software` (aula); (2) `{"registrada":true,"estado":"presente",...}`; (3) idéntico al anterior (no duplica); (4) JSON con `sesion.tema` y `asistencias` incluyendo a Ana (presente), Luis (tarde) y María (presente); (5) `403`.

- [ ] **Step 6: Commit**

```bash
git add api/espacios.php api/asistencia.php api/reporte.php
git commit -m "feat(api): espacios, asistencia automática idempotente y reporte docente (RF-02, RF-05, RF-08)"
```

---

### Task 5: Frontend de acceso (login y registro)

**Responsable:** Cristian Mamani (Frontend) · **Fecha:** 17-18/07/2026 (maqueta) y 23/07 (integración con API real)

**Files:**
- Create: `index.html`
- Create: `css/estilos.css`
- Create: `js/auth.js`

**Interfaces:**
- Consumes: `POST api/login.php`, `POST api/registro.php` (Tasks 2-3).
- Produces: página de acceso en `/index.html`; al autenticar redirige a `mundo.html` (Task 6).

- [ ] **Step 1: `index.html`**

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Metaverso UPDS — Acceso</title>
  <link rel="stylesheet" href="css/estilos.css">
</head>
<body class="pantalla-acceso">
  <main class="tarjeta">
    <h1>Metaverso UPDS</h1>
    <p class="subtitulo">Clases virtuales — Ingeniería de Software</p>

    <div class="pestanas">
      <button id="tab-login" class="activa" type="button">Ingresar</button>
      <button id="tab-registro" type="button">Crear cuenta</button>
    </div>

    <form id="form-login">
      <label>Correo institucional
        <input type="email" name="email" required placeholder="nombre@upds.edu.bo">
      </label>
      <label>Contraseña
        <input type="password" name="password" required>
      </label>
      <button type="submit" class="principal">Entrar al campus</button>
    </form>

    <form id="form-registro" hidden>
      <div class="fila">
        <label>Nombre <input type="text" name="nombre" required></label>
        <label>Apellido <input type="text" name="apellido" required></label>
      </div>
      <label>Correo institucional
        <input type="email" name="email" required placeholder="nombre@upds.edu.bo">
      </label>
      <label>Contraseña (mínimo 6 caracteres)
        <input type="password" name="password" minlength="6" required>
      </label>
      <label>Nombre visible en el mundo
        <input type="text" name="nombre_visible" maxlength="40" placeholder="Como te verán los demás">
      </label>
      <div class="fila">
        <label>Género del avatar
          <select name="genero">
            <option value="n">Prefiero no decir</option>
            <option value="f">Femenino</option>
            <option value="m">Masculino</option>
          </select>
        </label>
        <label>Color del avatar
          <input type="color" name="color" value="#3b82f6">
        </label>
      </div>
      <label class="consentimiento">
        <input type="checkbox" name="acepta_datos" required>
        Acepto la política de tratamiento de datos personales (v1.0)
      </label>
      <button type="submit" class="principal">Crear cuenta y entrar</button>
    </form>

    <p id="mensaje-error" class="error" hidden></p>
    <p class="ayuda">Demo: ana.rojas@upds.edu.bo / upds2026</p>
  </main>
  <script type="module" src="js/auth.js"></script>
</body>
</html>
```

- [ ] **Step 2: `css/estilos.css`**

```css
/* Estilos compartidos: pantalla de acceso y HUD del mundo 3D. */
* { box-sizing: border-box; margin: 0; }
body {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #e8eaf0;
}

/* ---------- Acceso ---------- */
.pantalla-acceso {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: linear-gradient(160deg, #101a33 0%, #1c2f5e 60%, #274086 100%);
}
.tarjeta {
  width: min(420px, 92vw);
  background: rgba(13, 20, 40, .85);
  border: 1px solid rgba(255, 255, 255, .12);
  border-radius: 14px;
  padding: 28px;
  backdrop-filter: blur(6px);
}
.tarjeta h1 { font-size: 1.6rem; }
.subtitulo { color: #9fb0d8; margin: 4px 0 18px; font-size: .95rem; }
.pestanas { display: flex; gap: 8px; margin-bottom: 16px; }
.pestanas button {
  flex: 1; padding: 8px; border-radius: 8px; border: 1px solid #33406b;
  background: transparent; color: #9fb0d8; cursor: pointer; font-size: .95rem;
}
.pestanas button.activa { background: #2c3e78; color: #fff; border-color: #4b5fa8; }
form { display: grid; gap: 12px; }
.fila { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
label { display: grid; gap: 4px; font-size: .88rem; color: #b9c4e2; }
input, select {
  padding: 9px 10px; border-radius: 8px; border: 1px solid #33406b;
  background: #0d1428; color: #e8eaf0; font-size: .95rem; width: 100%;
}
input[type="color"] { padding: 2px; height: 40px; }
.consentimiento { grid-template-columns: auto 1fr; display: grid; align-items: center; gap: 8px; }
.consentimiento input { width: auto; }
button.principal {
  padding: 11px; border: none; border-radius: 8px; cursor: pointer;
  background: #3b82f6; color: #fff; font-size: 1rem; font-weight: 600;
}
button.principal:hover { background: #2f6fd8; }
.error { color: #ff8f8f; font-size: .9rem; margin-top: 12px; }
.ayuda { color: #7787b3; font-size: .8rem; margin-top: 14px; text-align: center; }

/* ---------- HUD del mundo ---------- */
.pantalla-mundo { overflow: hidden; background: #000; }
#hud {
  position: fixed; inset: 0; pointer-events: none;
  display: flex; flex-direction: column; justify-content: space-between;
}
.hud-superior {
  display: flex; justify-content: space-between; padding: 14px 18px;
}
.hud-panel {
  background: rgba(10, 15, 32, .72); border: 1px solid rgba(255,255,255,.14);
  border-radius: 10px; padding: 10px 14px; pointer-events: auto;
}
.hud-panel small { color: #9fb0d8; display: block; }
#btn-salir {
  background: #b33; color: #fff; border: none; border-radius: 8px;
  padding: 8px 14px; cursor: pointer; font-size: .9rem;
}
.hud-inferior { padding: 14px 18px; display: flex; justify-content: center; }
.controles { font-size: .85rem; color: #cdd6ee; }
#toast {
  position: fixed; top: 74px; left: 50%; transform: translateX(-50%);
  background: #16a34a; color: #fff; padding: 10px 18px; border-radius: 10px;
  font-size: .95rem; opacity: 0; transition: opacity .3s; pointer-events: none;
}
#toast.visible { opacity: 1; }
#toast.tarde { background: #d97706; }
```

- [ ] **Step 3: `js/auth.js`**

```javascript
// Login y registro contra la API PHP. Al autenticar redirige al mundo 3D.
const $ = (sel) => document.querySelector(sel);
const error = $('#mensaje-error');

function mostrarError(msg) {
  error.textContent = msg;
  error.hidden = false;
}

function cambiarPestana(login) {
  $('#form-login').hidden = !login;
  $('#form-registro').hidden = login;
  $('#tab-login').classList.toggle('activa', login);
  $('#tab-registro').classList.toggle('activa', !login);
  error.hidden = true;
}
$('#tab-login').addEventListener('click', () => cambiarPestana(true));
$('#tab-registro').addEventListener('click', () => cambiarPestana(false));

async function enviar(url, datos) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  });
  const json = await r.json();
  if (!r.ok) throw new Error(json.error || 'Error inesperado');
  return json;
}

$('#form-login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  try {
    await enviar('api/login.php', {
      email: f.get('email'),
      password: f.get('password'),
    });
    location.href = 'mundo.html';
  } catch (e) {
    mostrarError(e.message);
  }
});

$('#form-registro').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  try {
    await enviar('api/registro.php', {
      email: f.get('email'),
      password: f.get('password'),
      nombre: f.get('nombre'),
      apellido: f.get('apellido'),
      nombre_visible: f.get('nombre_visible'),
      genero: f.get('genero'),
      color: f.get('color'),
      acepta_datos: f.get('acepta_datos') === 'on',
    });
    location.href = 'mundo.html';
  } catch (e) {
    mostrarError(e.message);
  }
});
```

- [ ] **Step 4: Probar en el navegador**

Con el servidor de pruebas corriendo, abrir `http://127.0.0.1:8080/index.html` en el navegador (herramienta de Browser del harness si está disponible; si no, `curl -s http://127.0.0.1:8080/index.html | head -5` para al menos verificar que sirve HTML).

Verificar: (a) la página carga sin errores de consola; (b) login con `ana.rojas@upds.edu.bo` / `upds2026` redirige a `mundo.html` (dará 404 hasta la Task 6 — eso es lo esperado en este punto); (c) login con contraseña mala muestra "Correo o contraseña incorrectos" sin recargar.

- [ ] **Step 5: Commit**

```bash
git add index.html css/estilos.css js/auth.js
git commit -m "feat(web): pantalla de acceso con login y registro (RF-06, RNF-02)"
```

---

### Task 6: Mundo 3D (campus + aula con asistencia automática)

**Responsable:** Melvin Chipana (escena del campus e interior del aula) e Ignacio Calvimontes (avatar, controles, HUD y llamada de asistencia) · **Fecha:** 18-19/07 (partes A/B) y 23/07 (partes C/D + integración)

**Files:**
- Create: `mundo.html`
- Create: `js/mundo.js`

**Interfaces:**
- Consumes: `GET api/yo.php`, `GET api/espacios.php`, `POST api/asistencia.php`, `POST api/logout.php` (Tasks 2 y 4). Forma de `avatar.apariencia.color` (hex string, puede faltar).
- Produces: `mundo.html` — escena Three.js: campus con edificio del aula; caminar con WASD/flechas; al cruzar la puerta del aula se registra la asistencia y se teletransporta al interior (pizarra + bancos); zona de salida para volver al campus.

- [ ] **Step 1: `mundo.html`**

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Metaverso UPDS — Campus</title>
  <link rel="stylesheet" href="css/estilos.css">
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"
    }
  }
  </script>
</head>
<body class="pantalla-mundo">
  <div id="hud">
    <div class="hud-superior">
      <div class="hud-panel">
        <strong id="hud-nombre">…</strong>
        <small id="hud-ubicacion">Campus Central</small>
      </div>
      <div class="hud-panel">
        <button id="btn-salir" type="button">Salir</button>
      </div>
    </div>
    <div class="hud-inferior">
      <div class="hud-panel controles">
        Muévete con <strong>W A S D</strong> o las flechas · Entra por la puerta verde del aula para registrar tu asistencia
      </div>
    </div>
  </div>
  <div id="toast"></div>
  <script type="module" src="js/mundo.js"></script>
</body>
</html>
```

- [ ] **Step 2: `js/mundo.js`**

```javascript
// Mundo 3D del metaverso: campus con aula. RF-02, RF-05, RF-07.
import * as THREE from 'three';

// ---------- Puntos clave del mundo ----------
const SPAWN_CAMPUS  = new THREE.Vector3(0, 0, 20);
const PUERTA_AULA   = new THREE.Vector3(0, 0, -23);   // umbral de entrada
const AULA_INTERIOR = new THREE.Vector3(500, 0, 4);   // sala apartada del campus
const SALIDA_AULA   = new THREE.Vector3(500, 0, 13);  // zona para volver al campus
const VELOCIDAD = 8;

let usuario = null, avatarInfo = null, aulaEspacio = null;
let enAula = false, asistenciaPedida = false;

// ---------- Sesión y datos ----------
const rYo = await fetch('api/yo.php');
if (rYo.status === 401) location.href = 'index.html';
({ usuario, avatar: avatarInfo } = await rYo.json());

const rEsp = await fetch('api/espacios.php');
const { espacios } = await rEsp.json();
aulaEspacio = espacios.find((e) => e.tipo === 'aula') ?? null;

document.getElementById('hud-nombre').textContent =
  `${avatarInfo?.nombre_visible ?? usuario.nombre} (${usuario.rol})`;

// ---------- Escena base ----------
const escena = new THREE.Scene();
escena.background = new THREE.Color(0x87b5e0);
escena.fog = new THREE.Fog(0x87b5e0, 60, 160);

const camara = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 500);
const render = new THREE.WebGLRenderer({ antialias: true });
render.setSize(innerWidth, innerHeight);
render.shadowMap.enabled = true;
document.body.appendChild(render.domElement);

escena.add(new THREE.HemisphereLight(0xffffff, 0x446644, 0.9));
const sol = new THREE.DirectionalLight(0xffffff, 1.2);
sol.position.set(30, 50, 20);
sol.castShadow = true;
escena.add(sol);

const caja = (w, h, d, color, x, y, z) => {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  escena.add(m);
  return m;
};

// ---------- Campus ----------
const suelo = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshLambertMaterial({ color: 0x5da24e })
);
suelo.rotation.x = -Math.PI / 2;
suelo.receiveShadow = true;
escena.add(suelo);

// Camino central
const camino = new THREE.Mesh(
  new THREE.PlaneGeometry(8, 90),
  new THREE.MeshLambertMaterial({ color: 0xb9b3a4 })
);
camino.rotation.x = -Math.PI / 2;
camino.position.set(0, 0.01, -5);
escena.add(camino);

// Edificio del aula (al fondo del camino) con puerta verde
caja(24, 10, 14, 0xc8b89a, 0, 5, -32);                 // cuerpo
caja(26, 1.2, 16, 0x8a7b60, 0, 10.6, -32);             // techo
const puerta = caja(4, 6, 0.4, 0x22c55e, 0, 3, -24.9); // puerta (zona de entrada)
// Letrero flotante del aula
escena.add(hacerLetrero(aulaEspacio?.nombre ?? 'Aula Virtual', 0, 12.5, -32));

// Edificios decorativos
caja(14, 8, 10, 0x9db4d0, -35, 4, -20);
caja(14, 12, 10, 0xd0a89d, 35, 6, -15);
caja(10, 6, 10, 0xcdc39b, -30, 3, 20);

// ---------- Interior del aula (sala apartada en x=500) ----------
const pisoAula = new THREE.Mesh(
  new THREE.PlaneGeometry(24, 20),
  new THREE.MeshLambertMaterial({ color: 0x8d8578 })
);
pisoAula.rotation.x = -Math.PI / 2;
pisoAula.position.set(500, 0, 4);
escena.add(pisoAula);
caja(24, 6, 0.4, 0xefe8da, 500, 3, -6);   // pared frontal
caja(0.4, 6, 20, 0xefe8da, 488, 3, 4);    // pared izquierda
caja(0.4, 6, 20, 0xefe8da, 512, 3, 4);    // pared derecha
// Pizarra (RF-04: aquí se proyectará el material en la siguiente iteración)
caja(10, 4, 0.2, 0xf8fafc, 500, 3, -5.7);
// Bancos
for (let f = 0; f < 2; f++) {
  for (let c = -1; c <= 1; c++) {
    caja(3, 0.9, 1.4, 0x7a5c3e, 500 + c * 5, 0.45, 1 + f * 4);
  }
}
// Marca de salida (rectángulo verde en el piso)
const salida = new THREE.Mesh(
  new THREE.PlaneGeometry(4, 2),
  new THREE.MeshBasicMaterial({ color: 0x22c55e })
);
salida.rotation.x = -Math.PI / 2;
salida.position.set(500, 0.02, 13);
escena.add(salida);

// ---------- Avatar del jugador ----------
function hacerLetrero(texto, x, y, z) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(10,15,32,0.75)';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 44px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, 256, 64);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true })
  );
  sprite.scale.set(8, 2, 1);
  sprite.position.set(x, y, z);
  return sprite;
}

const jugador = new THREE.Group();
const colorAvatar = new THREE.Color(avatarInfo?.apariencia?.color ?? '#3b82f6');
const cuerpo = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.5, 1.1, 8, 16),
  new THREE.MeshLambertMaterial({ color: colorAvatar })
);
cuerpo.position.y = 1.05;
cuerpo.castShadow = true;
jugador.add(cuerpo);
const cabeza = new THREE.Mesh(
  new THREE.SphereGeometry(0.35, 16, 16),
  new THREE.MeshLambertMaterial({ color: 0xf1c27d })
);
cabeza.position.y = 2.25;
jugador.add(cabeza);
// RF-07 parcial: nombre visible sobre el avatar (RF-11 del catálogo amplio)
const letreroNombre = hacerLetrero(avatarInfo?.nombre_visible ?? usuario.nombre, 0, 3.1, 0);
letreroNombre.scale.set(4, 1, 1);
jugador.add(letreroNombre);
jugador.position.copy(SPAWN_CAMPUS);
escena.add(jugador);

// ---------- Controles ----------
const teclas = {};
addEventListener('keydown', (e) => (teclas[e.code] = true));
addEventListener('keyup', (e) => (teclas[e.code] = false));
addEventListener('resize', () => {
  camara.aspect = innerWidth / innerHeight;
  camara.updateProjectionMatrix();
  render.setSize(innerWidth, innerHeight);
});

document.getElementById('btn-salir').addEventListener('click', async () => {
  await fetch('api/logout.php', { method: 'POST' });
  location.href = 'index.html';
});

// ---------- Toast ----------
function toast(msg, esTarde = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.toggle('tarde', esTarde);
  t.classList.add('visible');
  setTimeout(() => t.classList.remove('visible'), 4000);
}

// ---------- Entrada / salida del aula ----------
async function entrarAlAula() {
  enAula = true;
  jugador.position.copy(AULA_INTERIOR);
  document.getElementById('hud-ubicacion').textContent = aulaEspacio?.nombre ?? 'Aula Virtual';
  if (asistenciaPedida || !aulaEspacio) return;
  asistenciaPedida = true;
  const r = await fetch('api/asistencia.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ espacio_id: aulaEspacio.id }),
  });
  const res = await r.json();
  if (res.registrada) {
    toast(
      res.estado === 'tarde'
        ? 'Asistencia registrada: llegaste TARDE'
        : 'Asistencia registrada: PRESENTE',
      res.estado === 'tarde'
    );
  } else if (res.motivo === 'no_estudiante') {
    toast('Bienvenido. La asistencia solo se registra para estudiantes.');
  } else {
    toast('No hay una clase en curso en este momento.', true);
  }
}

function salirDelAula() {
  enAula = false;
  jugador.position.copy(SPAWN_CAMPUS);
  document.getElementById('hud-ubicacion').textContent = 'Campus Central';
}

// ---------- Bucle principal ----------
const reloj = new THREE.Clock();
function animar() {
  requestAnimationFrame(animar);
  const dt = Math.min(reloj.getDelta(), 0.05);

  const dir = new THREE.Vector3(
    (teclas.KeyD || teclas.ArrowRight ? 1 : 0) - (teclas.KeyA || teclas.ArrowLeft ? 1 : 0),
    0,
    (teclas.KeyS || teclas.ArrowDown ? 1 : 0) - (teclas.KeyW || teclas.ArrowUp ? 1 : 0)
  );
  if (dir.lengthSq() > 0) {
    dir.normalize();
    jugador.position.addScaledVector(dir, VELOCIDAD * dt);
    cuerpo.rotation.y = Math.atan2(dir.x, dir.z);
  }

  // Límites del área actual
  if (!enAula) {
    jugador.position.x = THREE.MathUtils.clamp(jugador.position.x, -95, 95);
    jugador.position.z = THREE.MathUtils.clamp(jugador.position.z, -24.5, 95);
    if (jugador.position.distanceTo(PUERTA_AULA) < 3) entrarAlAula();
  } else {
    jugador.position.x = THREE.MathUtils.clamp(jugador.position.x, 489, 511);
    jugador.position.z = THREE.MathUtils.clamp(jugador.position.z, -5, 13.5);
    if (jugador.position.distanceTo(SALIDA_AULA) < 1.6) salirDelAula();
  }

  // Cámara en tercera persona
  const destino = jugador.position.clone().add(new THREE.Vector3(0, 6, 10));
  camara.position.lerp(destino, 0.08);
  camara.lookAt(jugador.position.clone().add(new THREE.Vector3(0, 1.5, 0)));

  render.render(escena, camara);
}
animar();
```

- [ ] **Step 3: Probar el mundo en el navegador**

Con el servidor corriendo, abrir `http://127.0.0.1:8080/index.html`, iniciar sesión con `luis.garcia@upds.edu.bo` / `upds2026` (Luis ya figura "tarde" en la sesión, sirve para probar idempotencia) y verificar:

1. `mundo.html` carga: se ve el campus (suelo verde, camino, edificio con puerta verde) y el avatar con su nombre encima.
2. Consola del navegador **sin errores** (advertencias de Three.js son aceptables).
3. Caminar con WASD hasta la puerta verde: teletransporta al interior del aula (pizarra blanca, bancos) y muestra el toast de asistencia. Para Luis: "llegaste TARDE" (su fila ya existía como tarde — idempotente).
4. Caminar a la marca verde del piso: vuelve al campus.
5. Botón "Salir": vuelve a `index.html` y `api/yo.php` responde 401.

Verificación en BD (la asistencia de Luis sigue única):
```bash
"C:/xampp/mysql/bin/mysql.exe" -u root -e "USE metaverso_upds; SELECT COUNT(*) AS filas FROM asistencias WHERE sesion_id=1 AND usuario_id=3;"
```
Expected: `filas | 1`.

- [ ] **Step 4: Commit**

```bash
git add mundo.html js/mundo.js
git commit -m "feat(3d): campus y aula en Three.js con asistencia automática (RF-02, RF-05, RF-07)"
```

---

### Task 7: README del proyecto

**Responsable:** Lucas Vargas (Documentación) · **Fecha:** 28/07/2026

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: todo lo anterior (documenta cómo ejecutarlo).

- [ ] **Step 1: `README.md`**

```markdown
# Metaverso Educativo UPDS — Ingeniería de Software I

Metaverso ligero por navegador para clases virtuales. Piloto: asignatura
**Ingeniería de Software** (ISW-501). Campus 3D + aula virtual con registro
automático de asistencia.

## Tecnologías

- **Frontend:** HTML/CSS/JavaScript + Three.js 0.160 (CDN, sin build)
- **Backend:** PHP 8 (XAMPP) — API JSON con sesiones
- **Base de datos:** MySQL/MariaDB (XAMPP) — base `metaverso_upds`

## Puesta en marcha

1. Instalar XAMPP y clonar/copiar este proyecto en `C:\xampp\htdocs\metaverso_ing_software_I`.
2. Iniciar **Apache** y **MySQL** desde el panel de XAMPP.
3. Crear la base de datos (solo la primera vez):
   ```
   C:\xampp\mysql\bin\mysql.exe -u root < database\schema_mysql.sql
   C:\xampp\php\php.exe database\actualizar_passwords_demo.php
   ```
4. Abrir `http://localhost/metaverso_ing_software_I/` en Chrome, Edge o Firefox.

## Usuarios de prueba (contraseña: `upds2026`)

| Rol | Correo |
|---|---|
| Administrador | admin@upds.edu.bo |
| Docente | docente.isw@upds.edu.bo |
| Estudiante | ana.rojas@upds.edu.bo |
| Estudiante | luis.garcia@upds.edu.bo |
| Estudiante | maria.flores@upds.edu.bo |

## Seguridad (RNF-05)

- RBAC: roles en catálogo (`roles`/`usuario_roles`), perfiles separados por rol
  y ficha personal en `datos_personales`.
- Contraseñas bcrypt; bloqueo temporal tras 5 intentos fallidos de login.
- Bitácora auditable de eventos (logins, fallos, registros).
- La app se conecta a MySQL como `metaverso_app` (privilegios mínimos), no root.

## Estructura

```
api/        Endpoints PHP (login, registro, espacios, asistencia, reporte)
css/, js/   Frontend (acceso y mundo 3D)
database/   Esquema SQL, consultas de ejemplo y script de contraseñas demo
docs/       Requerimientos y planes de implementación
index.html  Pantalla de acceso
mundo.html  Mundo 3D (campus + aula)
```

## Requerimientos cubiertos en esta versión

RF-01 (avatar básico con color/género), RF-02 (campus + aula privada),
RF-05 (asistencia automática con estado presente/tarde), RF-06 (login/registro
con roles), RF-07 (movimiento WASD), RF-08 (reporte de asistencia vía API),
RNF-03 (consentimiento de datos), RNF-05 (bcrypt), RNF-06 (sin instalación,
carga ligera).

## Pendiente para siguientes iteraciones

- Voz espacial WebRTC (RF-03) — requiere servidor Node/LiveKit
- Ver a otros usuarios en tiempo real (RF-07 completo) — requiere WebSockets
- Proyección de PDF/PPT y pizarra colaborativa (RF-04)
- Panel visual del docente para reportes (hoy es endpoint JSON)

> Nota de seguridad: el `root` de MySQL sin contraseña es aceptable solo en
> este entorno local de desarrollo.
```

- [ ] **Step 2: Commit final**

```bash
git add README.md
git commit -m "docs: README con puesta en marcha y alcance de la versión"
```

---

## Autorrevisión (hecha al escribir el plan)

1. **Cobertura del spec:** RF-01→Task 3/6 (avatar con color y nombre), RF-02→Tasks 4/6 (espacios con control de acceso + campus/aula 3D), RF-05→Tasks 4/6 (asistencia idempotente con tarde/presente), RF-06→Tasks 2/3/5, RF-07→Task 6 (movimiento; "ver a otros" queda documentado como pendiente en Task 7 porque exige WebSockets, fuera de este esqueleto), RF-08→Task 4 (reporte docente; programación de sesiones queda con la sesión semilla, panel visual pendiente). RF-03 (voz) y RF-04 (proyección real de PDF) explícitamente fuera del alcance, documentados en README.
2. **Placeholders:** ninguno; todo archivo tiene su código completo.
3. **Consistencia de tipos:** los helpers de `config.php` (`db`, `json_out`, `entrada_json`, `requiere_sesion`) se usan idénticos en Tasks 3-4; la forma de `avatar.apariencia.color` que produce la API (Tasks 2-3) es la que consume `mundo.js` (Task 6); `espacio_id` entero en `asistencia.php` coincide con `aulaEspacio.id` que envía el frontend.
