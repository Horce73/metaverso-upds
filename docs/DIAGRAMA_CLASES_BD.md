# Diagrama de Clases - Base de Datos Metaverso UPDS

**Versión:** 2.3 (Normalizado 3FN - RBAC)  
**Última actualización:** 2026-07-27  
**Estado:** Activo en Producción Local

---

## 1. Requerimientos de la Base de Datos

### 1.1 Requisitos Funcionales (RF)

| RF | Descripción | Entidades Involucradas |
|----|-------------|------------------------|
| **RF-01** | Crear y gestionar avatares con color y género | `usuarios`, `avatares` |
| **RF-02** | Espacios (campus/aula) con control de acceso por rol | `espacios`, `asignaturas`, `inscripciones`, `usuario_roles` |
| **RF-03** | Voz espacial WebRTC (pendiente para v3.0) | `sesiones_clase` |
| **RF-04** | Proyección de PDFs/PPT en pizarra (pendiente para v3.0) | `sesiones_clase`, `materiales` |
| **RF-05** | Asistencia automática idempotente (presente/tarde) | `asistencias`, `sesiones_clase`, `usuarios` |
| **RF-06** | Autenticación con login/registro y RBAC | `usuarios`, `usuario_roles`, `roles` |
| **RF-07** | Movimiento en campus y ver a otros en tiempo real | `usuarios`, `avatares`, `espacios` |
| **RF-08** | Reporte de asistencia por docente | `asistencias`, `sesiones_clase`, `usuarios` |

### 1.2 Requisitos No-Funcionales (RNF)

| RNF | Descripción | Implementación |
|-----|-------------|-----------------|
| **RNF-02** | Sin instalación local de dependencias | Usa Three.js CDN, PHP nativo, sin npm |
| **RNF-03** | Consentimiento de tratamiento de datos | Tabla `consentimientos` con versión de política |
| **RNF-05** | Seguridad en autenticación | bcrypt, bloqueo temporal (5 intentos), bitácora, RBAC |
| **RNF-06** | Carga ligera y rápida | HTML/CSS/JS sin build, API JSON simple |

---

## 2. Entidades Principales y Atributos

### 2.1 Gestión de Usuarios y Autenticación

#### `usuarios` (PK: id)
```
id              INT PRIMARY KEY AUTO_INCREMENT
email           VARCHAR(255) UNIQUE NOT NULL
password_hash   VARCHAR(255) NOT NULL (bcrypt)
nombre          VARCHAR(100) NOT NULL
apellido        VARCHAR(100) NOT NULL
activo          TINYINT DEFAULT 1
intentos_fallidos  INT DEFAULT 0
bloqueado_hasta DATETIME NULL
ultimo_acceso   DATETIME
creado_en       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

**Notas:**
- UNIQUE en `email` para garantizar que cada usuario es único
- `password_hash` nunca contiene contraseña en texto plano (bcrypt)
- `bloqueado_hasta` se usa para bloqueo temporal tras 5 intentos fallidos

---

#### `roles` (PK: id)
```
id       INT PRIMARY KEY AUTO_INCREMENT
nombre   VARCHAR(50) UNIQUE NOT NULL (admin, docente, estudiante)
descripcion VARCHAR(255)
```

**Notas:**
- Catálogo fijo con 3 roles principales
- Un usuario puede tener múltiples roles (ver `usuario_roles`)

---

#### `usuario_roles` (PK: id; FK: usuario_id, rol_id)
```
id        INT PRIMARY KEY AUTO_INCREMENT
usuario_id  INT NOT NULL FOREIGN KEY → usuarios.id
rol_id      INT NOT NULL FOREIGN KEY → roles.id
asignado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP

UNIQUE(usuario_id, rol_id)  -- Un usuario no puede tener el mismo rol dos veces
```

**Notas:**
- Tabla puente (M:N) que implementa RBAC
- Permite usuarios multi-rol (ej: docente + administrador)
- Orden de roles (primer rol es el rol principal)

---

### 2.2 Perfiles de Usuario (Separados por Rol)

#### `datos_personales` (PK: id; FK: usuario_id)
```
id          INT PRIMARY KEY AUTO_INCREMENT
usuario_id  INT NOT NULL UNIQUE FOREIGN KEY → usuarios.id
celular     VARCHAR(20)
pais        VARCHAR(100)
ciudad      VARCHAR(100)
direccion   TEXT
telefono    VARCHAR(20)
actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE
```

**Notas:**
- Datos opcionales (apellidos + nombre viven en `usuarios`)
- Se crea automáticamente al registrarse

---

#### `perfiles_estudiante` (PK: id; FK: usuario_id)
```
id          INT PRIMARY KEY AUTO_INCREMENT
usuario_id  INT NOT NULL UNIQUE FOREIGN KEY → usuarios.id
registro_upds  VARCHAR(20) UNIQUE  -- Matrícula de la U
carrera_id  INT FOREIGN KEY → carreras.id (NULL al registrarse, se completa después)
semestre    INT
promedio    DECIMAL(3,2)
estado      ENUM('activo', 'inactivo', 'graduado') DEFAULT 'activo'
```

**Notas:**
- Datos académicos específicos de estudiantes
- `carrera_id` se completa después de validación de la U
- Relación con `inscripciones` (M:N con asignaturas)

---

#### `perfiles_docente` (PK: id; FK: usuario_id)
```
id            INT PRIMARY KEY AUTO_INCREMENT
usuario_id    INT NOT NULL UNIQUE FOREIGN KEY → usuarios.id
numero_legajo VARCHAR(20) UNIQUE
especialidad  VARCHAR(100)
departamento  VARCHAR(100)
es_responsable_carrera  TINYINT DEFAULT 0
```

**Notas:**
- Datos profesionales específicos de docentes
- Docente puede ser responsable de una carrera

---

### 2.3 Estructura Académica

#### `carreras` (PK: id)
```
id          INT PRIMARY KEY AUTO_INCREMENT
nombre      VARCHAR(100) UNIQUE NOT NULL (Ing. Software, etc.)
descripcion TEXT
coordinador_id  INT FOREIGN KEY → perfiles_docente.usuario_id
activa      TINYINT DEFAULT 1
```

---

#### `asignaturas` (PK: id)
```
id        INT PRIMARY KEY AUTO_INCREMENT
nombre    VARCHAR(100) NOT NULL (Ingeniería de Software, etc.)
codigo    VARCHAR(20) UNIQUE NOT NULL (ISW-501)
carrera_id  INT NOT NULL FOREIGN KEY → carreras.id
docente_id  INT NOT NULL FOREIGN KEY → perfiles_docente.usuario_id
creditos  INT
semestre  INT
activa    TINYINT DEFAULT 1
creada_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

**Notas:**
- Una asignatura pertenece a una carrera y tiene un docente responsable
- `codigo` es alfanumérico único (ej: ISW-501)

---

#### `inscripciones` (PK: id; FK: usuario_id, asignatura_id)
```
id            INT PRIMARY KEY AUTO_INCREMENT
usuario_id    INT NOT NULL FOREIGN KEY → perfiles_estudiante.usuario_id
asignatura_id INT NOT NULL FOREIGN KEY → asignaturas.id
calificacion  DECIMAL(3,1) NULL
estado        ENUM('inscrito', 'aprobado', 'reprobado') DEFAULT 'inscrito'
fecha_inscripcion TIMESTAMP DEFAULT CURRENT_TIMESTAMP

UNIQUE(usuario_id, asignatura_id)  -- Un estudiante no se puede inscribir dos veces
```

**Notas:**
- M:N: relación estudiante-asignatura
- Estudiantes se inscriben automáticamente al registrarse (en asignaturas activas)

---

### 2.4 Espacios y Sesiones de Clase

#### `espacios` (PK: id)
```
id            INT PRIMARY KEY AUTO_INCREMENT
nombre        VARCHAR(100) NOT NULL (Campus Central UPDS, Aula Ingeniería de Software)
tipo          ENUM('campus', 'aula') NOT NULL
escena_url    VARCHAR(255)  -- URL a escena 3D (futura)
capacidad_max INT DEFAULT 50
asignatura_id INT FOREIGN KEY → asignaturas.id (NULL si es campus)
activo        TINYINT DEFAULT 1
creado_en     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

**Notas:**
- `campus` es público; `aula` requiere inscripción en asignatura o ser docente
- Una aula está asociada a máximo una asignatura

---

#### `sesiones_clase` (PK: id; FK: espacio_id, docente_id)
```
id                INT PRIMARY KEY AUTO_INCREMENT
espacio_id        INT NOT NULL FOREIGN KEY → espacios.id
docente_id        INT NOT NULL FOREIGN KEY → perfiles_docente.usuario_id
tema              VARCHAR(255)
descripcion       TEXT
inicio_programado DATETIME NOT NULL
fin_programado    DATETIME NOT NULL
inicio_real       DATETIME  -- Se completa cuando inicia
fin_real          DATETIME
estado            ENUM('programada', 'en_curso', 'finalizada') DEFAULT 'programada'
tolerancia_min    INT DEFAULT 15  -- Minutos de tolerancia antes de marcar TARDE
capacidad_virtual INT DEFAULT 50
creada_en         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

**Notas:**
- `estado` controla si la asistencia se registra (solo `en_curso`)
- `tolerancia_min` define cuándo cambiar de PRESENTE a TARDE
- `inicio_real` marca cuándo realmente comenzó la clase

---

### 2.5 Asistencia y Seguimiento

#### `asistencias` (PK: id; FK: sesion_id, usuario_id)
```
id            INT PRIMARY KEY AUTO_INCREMENT
sesion_id     INT NOT NULL FOREIGN KEY → sesiones_clase.id
usuario_id    INT NOT NULL FOREIGN KEY → perfiles_estudiante.usuario_id
estado        ENUM('presente', 'tarde', 'ausente') DEFAULT 'presente'
hora_ingreso  DATETIME DEFAULT CURRENT_TIMESTAMP
hora_salida   DATETIME
justificacion VARCHAR(255)
archivo_justificacion  VARCHAR(255)  -- Ruta a documento de justificación

UNIQUE(sesion_id, usuario_id)  -- Idempotencia: un estudiante registra una sola asistencia por sesión
```

**Notas:**
- **IDEMPOTENCIA:** `INSERT IGNORE` + UNIQUE key previene duplicados
- Registra hora exacta de entrada y salida
- Permite justificación para faltas

---

#### `bitacora` (PK: id)
```
id        INT PRIMARY KEY AUTO_INCREMENT
usuario_id  INT FOREIGN KEY → usuarios.id (NULL para eventos sin usuario)
evento    VARCHAR(50) NOT NULL (login_ok, login_fallido, login_bloqueado, registro, logout)
detalle   TEXT
ip        VARCHAR(45)  -- IPv4 o IPv6
creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP

INDEX(usuario_id, creado_en)  -- Para auditoría rápida
```

**Notas:**
- Registro no-repudiable de eventos de seguridad y actividad
- Permite identificar intentos de ataque

---

### 2.6 Avatar y Consentimiento

#### `avatares` (PK: id; FK: usuario_id)
```
id              INT PRIMARY KEY AUTO_INCREMENT
usuario_id      INT NOT NULL UNIQUE FOREIGN KEY → usuarios.id
nombre_visible  VARCHAR(40) NOT NULL  -- Nombre que ven otros jugadores
apariencia      JSON  -- {genero: 'n'|'f'|'m', color: '#3b82f6', ...}
creado_en       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
actualizado_en  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE
```

**Notas:**
- `apariencia` es JSON flexible para futuras propiedades (pelo, ropa, accesorios, etc.)
- `nombre_visible` puede diferir del nombre real (RF-07)

---

#### `consentimientos` (PK: id; FK: usuario_id)
```
id              INT PRIMARY KEY AUTO_INCREMENT
usuario_id      INT NOT NULL FOREIGN KEY → usuarios.id
tipo            VARCHAR(50) NOT NULL (tratamiento_datos, marketing, voz, etc.)
otorgado        TINYINT NOT NULL (0 = rechazado, 1 = aceptado)
version_politica  VARCHAR(20)  -- v1.0, v1.1, etc.
fecha_aceptacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
fecha_rechazo    DATETIME

UNIQUE(usuario_id, tipo)  -- Un usuario no puede consentir dos veces el mismo tipo
```

**Notas:**
- Cumple RNF-03 (consentimiento de datos)
- Versioning permite rastrear cambios de política
- Tabla de auditoría para RGPD/regulaciones locales

---

### 2.7 Materiales (Futura, para RF-04)

#### `sesion_materiales` (PK: id; FK: sesion_id)
```
id        INT PRIMARY KEY AUTO_INCREMENT
sesion_id INT NOT NULL FOREIGN KEY → sesiones_clase.id
nombre    VARCHAR(100)
tipo      ENUM('pdf', 'ppt', 'imagen', 'video', 'otro') DEFAULT 'pdf'
url       VARCHAR(255)  -- Ruta al archivo
orden     INT  -- Para ordenar materiales en la secuencia de clase
subido_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

**Notas:**
- Pendiente para v3.0 (proyección en pizarra)

---

## 3. Diagrama de Clases (Mermaid)

```mermaid
erDiagram
    USUARIOS ||--o{ USUARIO_ROLES : tiene
    USUARIOS ||--o{ DATOS_PERSONALES : contiene
    USUARIOS ||--o{ AVATARES : crea
    USUARIOS ||--o{ CONSENTIMIENTOS : autoriza
    USUARIOS ||--o{ BITACORA : registra_evento
    
    ROLES ||--o{ USUARIO_ROLES : asigna
    
    CARRERAS ||--o{ PERFILES_ESTUDIANTE : agrupa
    CARRERAS ||--o{ PERFILES_DOCENTE : coordina
    CARRERAS ||--o{ ASIGNATURAS : contiene
    
    PERFILES_ESTUDIANTE ||--o{ INSCRIPCIONES : se_inscribe
    PERFILES_DOCENTE ||--o{ ASIGNATURAS : imparte
    PERFILES_DOCENTE ||--o{ SESIONES_CLASE : dicta
    
    ASIGNATURAS ||--o{ INSCRIPCIONES : tiene_inscritos
    ASIGNATURAS ||--o{ ESPACIOS : usa
    
    ESPACIOS ||--o{ SESIONES_CLASE : alberga
    
    SESIONES_CLASE ||--o{ ASISTENCIAS : registra
    SESIONES_CLASE ||--o{ SESION_MATERIALES : contiene
    
    PERFILES_ESTUDIANTE ||--o{ ASISTENCIAS : marca_asistencia
    
    USUARIOS {
        int id PK
        string email UK
        string password_hash
        string nombre
        string apellido
        int activo
        int intentos_fallidos
        datetime bloqueado_hasta
        datetime ultimo_acceso
        timestamp creado_en
    }
    
    ROLES {
        int id PK
        string nombre UK
        string descripcion
    }
    
    USUARIO_ROLES {
        int id PK
        int usuario_id FK
        int rol_id FK
        timestamp asignado_en
    }
    
    DATOS_PERSONALES {
        int id PK
        int usuario_id FK UK
        string celular
        string pais
        string ciudad
        string direccion
        string telefono
        timestamp actualizado_en
    }
    
    AVATARES {
        int id PK
        int usuario_id FK UK
        string nombre_visible
        json apariencia
        timestamp creado_en
        timestamp actualizado_en
    }
    
    CONSENTIMIENTOS {
        int id PK
        int usuario_id FK
        string tipo
        int otorgado
        string version_politica
        timestamp fecha_aceptacion
        datetime fecha_rechazo
    }
    
    BITACORA {
        int id PK
        int usuario_id FK
        string evento
        string detalle
        string ip
        timestamp creado_en
    }
    
    CARRERAS {
        int id PK
        string nombre UK
        string descripcion
        int coordinador_id FK
        int activa
    }
    
    PERFILES_ESTUDIANTE {
        int id PK
        int usuario_id FK UK
        string registro_upds UK
        int carrera_id FK
        int semestre
        decimal promedio
        string estado
    }
    
    PERFILES_DOCENTE {
        int id PK
        int usuario_id FK UK
        string numero_legajo UK
        string especialidad
        string departamento
        int es_responsable_carrera
    }
    
    ASIGNATURAS {
        int id PK
        string nombre
        string codigo UK
        int carrera_id FK
        int docente_id FK
        int creditos
        int semestre
        int activa
        timestamp creada_en
    }
    
    INSCRIPCIONES {
        int id PK
        int usuario_id FK
        int asignatura_id FK
        decimal calificacion
        string estado
        timestamp fecha_inscripcion
    }
    
    ESPACIOS {
        int id PK
        string nombre
        string tipo
        string escena_url
        int capacidad_max
        int asignatura_id FK
        int activo
        timestamp creado_en
    }
    
    SESIONES_CLASE {
        int id PK
        int espacio_id FK
        int docente_id FK
        string tema
        string descripcion
        datetime inicio_programado
        datetime fin_programado
        datetime inicio_real
        datetime fin_real
        string estado
        int tolerancia_min
        int capacidad_virtual
        timestamp creada_en
    }
    
    ASISTENCIAS {
        int id PK
        int sesion_id FK
        int usuario_id FK
        string estado
        datetime hora_ingreso
        datetime hora_salida
        string justificacion
        string archivo_justificacion
    }
    
    SESION_MATERIALES {
        int id PK
        int sesion_id FK
        string nombre
        string tipo
        string url
        int orden
        timestamp subido_en
    }
```

---

## 4. Constraints y Claves Primarias/Foráneas

### 4.1 Relaciones M:N (Tablas Puente)
| Tabla | Relación | Constraint |
|-------|----------|------------|
| `usuario_roles` | Usuario ↔ Rol | UNIQUE(usuario_id, rol_id) — evita duplicados |
| `inscripciones` | Estudiante ↔ Asignatura | UNIQUE(usuario_id, asignatura_id) — un estudiante una asignatura |
| `asistencias` | Sesión ↔ Estudiante | UNIQUE(sesion_id, usuario_id) — **IDEMPOTENCIA** |

### 4.2 Claves UNIQUE Adicionales
| Tabla | Campo | Razón |
|-------|-------|-------|
| `usuarios` | `email` | Único por usuario; base para login |
| `roles` | `nombre` | Catálogo fijo: admin, docente, estudiante |
| `asignaturas` | `codigo` | Código único de materia (ISW-501) |
| `perfiles_estudiante` | `registro_upds` | Matrícula única por estudiante |
| `perfiles_docente` | `numero_legajo` | Legajo único por docente |
| `avatares` | `usuario_id` | Un avatar por usuario |
| `consentimientos` | (usuario_id, tipo) | Un consentimiento por tipo y usuario |

### 4.3 Índices Recomendados
```sql
-- Auditoría rápida
INDEX idx_bitacora_usuario_fecha ON bitacora(usuario_id, creado_en);

-- Búsqueda de asistencias por sesión
INDEX idx_asistencias_sesion ON asistencias(sesion_id);

-- Búsqueda de sesiones por espacio y docente
INDEX idx_sesiones_espacio ON sesiones_clase(espacio_id);
INDEX idx_sesiones_docente ON sesiones_clase(docente_id);

-- Búsqueda de inscripciones por estudiante
INDEX idx_inscripciones_usuario ON inscripciones(usuario_id);
```

---

## 5. Flujos de Datos Principales

### 5.1 Flujo de Login (RF-06)
```
Usuario → email/password
    ↓
usuarios (buscar por email)
    ↓
password_verify(password, password_hash) ✓
    ↓
usuario_roles JOIN roles (obtener roles)
    ↓
avatares (obtener apariencia)
    ↓
Respuesta JSON: {usuario, avatar}
    ↓
bitacora (evento: login_ok)
```

### 5.2 Flujo de Registro (RF-06 + RF-01)
```
email, password, nombre, apellido, color, genero, acepta_datos
    ↓
[INICIO TRANSACCIÓN]
    ↓
INSERT usuarios (bcrypt password)
    ↓
INSERT usuario_roles (rol = estudiante)
    ↓
INSERT perfiles_estudiante (perfil vacío)
    ↓
INSERT datos_personales
    ↓
INSERT avatares (nombre_visible, apariencia JSON)
    ↓
INSERT consentimientos (otorgado = 1)
    ↓
INSERT inscripciones (seleccionar asignaturas activas)
    ↓
[COMMIT]
    ↓
Respuesta JSON + redirigir a mundo.html
    ↓
bitacora (evento: registro)
```

### 5.3 Flujo de Asistencia (RF-05)
```
Estudiante entra al aula virtual
    ↓
POST /api/asistencia.php {espacio_id}
    ↓
sesiones_clase (buscar sesión en_curso del espacio)
    ↓
Calcular: ¿hora_actual > inicio + tolerancia_min? → TARDE : PRESENTE
    ↓
INSERT IGNORE asistencias (sesion_id, usuario_id, estado)
    ↓
SELECT asistencias (obtener fila creada o existente)
    ↓
Respuesta: {registrada: true, estado, hora_ingreso}
    ↓
Frontend muestra toast con estado
```

**NOTA IMPORTANTE:** El `INSERT IGNORE` + `UNIQUE(sesion_id, usuario_id)` garantiza idempotencia: entrar 2 veces no duplica.

### 5.4 Flujo de Reporte (RF-08)
```
Docente solicita reporte de sesión
    ↓
GET /api/reporte.php?sesion_id=N
    ↓
sesiones_clase (validar que docente_id = usuario_actual)
    ↓
asistencias JOIN usuarios JOIN perfiles_estudiante
    ↓
Respuesta JSON: {sesion, asistencias: [{registro_upds, nombre, apellido, estado, hora_ingreso}...]}
    ↓
Frontend consume datos (panel docente o export a CSV en v2.1)
```

---

## 6. Normalization y 3FN

Todas las tablas cumplen **3FN (Tercera Forma Normal)**:

✅ **1FN:** Todos los valores son atómicos (sin multi-valores, sin repetición de grupos)  
✅ **2FN:** Dependencia completa de la clave primaria (no hay dependencias parciales)  
✅ **3FN:** Sin dependencias transitivas entre atributos no-clave

**Ejemplo:** Datos de estudiante no se duplican en `asistencias`; se mantienen en `perfiles_estudiante` y se unen con FK.

---

## 7. Consideraciones de Seguridad

### 7.1 Contraseñas (RNF-05)
- **Almacenamiento:** `password_hash()` con algoritmo **bcrypt** (PHP)
- **Verificación:** `password_verify(entrada, hash)` — no inversible
- **Bloqueo temporal:** Tras 5 intentos fallidos, `bloqueado_hasta = NOW() + 15 MIN`

### 7.2 RBAC (Role-Based Access Control)
- Rol **NO** es columna de `usuarios` → evita escalada accidental
- Rol se obtiene con JOIN a `usuario_roles`/`roles` → flexible y auditable
- `requiere_rol('docente')` valida en PHP antes de ejecutar lógica

### 7.3 Auditoría (Bitácora)
- Evento `login_ok`, `login_fallido`, `login_bloqueado`, `registro`, `logout`
- IP registrada para forensia
- Índice rápido por usuario + fecha

### 7.4 Integridad Referencial
- Estudiantes solo en `perfiles_estudiante` (FK explícita)
- Docentes solo en `perfiles_docente` (FK explícita)
- MariaDB en modo `STRICT_TRANS_TABLES` → rechaza violaciones

---

## 8. Tabla de Uso en Endpoints API

| Endpoint | Método | Tablas Usadas | Propósito |
|----------|--------|---------------|-----------|
| `login.php` | POST | usuarios, usuario_roles, roles, avatares, bitacora | Autenticación |
| `registro.php` | POST | usuarios, usuario_roles, perfiles_estudiante, datos_personales, avatares, consentimientos, inscripciones | Crear cuenta |
| `yo.php` | GET | usuarios, avatares | Sesión actual |
| `logout.php` | POST | bitacora | Cerrar sesión |
| `espacios.php` | GET | espacios, asignaturas, inscripciones | Listar accesibles |
| `asistencia.php` | POST | sesiones_clase, asistencias, bitacora | Registrar entrada |
| `reporte.php` | GET | sesiones_clase, asistencias, usuarios, perfiles_estudiante | Ver asistencias |

---

## 9. Próximas Iteraciones (v3.0+)

### Pendiente: Voz Espacial (RF-03)
- Tabla: `sesion_participantes` (sesion ↔ usuario en tiempo real)
- Integración LiveKit o Agora para WebRTC
- No se almacena audio (RNF-03)

### Pendiente: Proyección en Pizarra (RF-04)
- Tabla: `sesion_materiales` (ya diseñada)
- Integración PDF.js para visualización
- Canvas compartido para anotaciones

### Pendiente: Múltiples Avatares (RF-07 completo)
- Extender `avatares` a 1:N (múltiples por usuario)
- Tabla: `avatares_en_uso` (usuario ↔ avatar_id actual)

### Pendiente: WebSockets en Tiempo Real (RF-07)
- Ver otros usuarios moviéndose en campus
- Tabla: `sesion_usuarios` (usuario ↔ espacio ↔ posición)
- Servidor Node.js con Socket.io

---

## 10. Exportar a Draw.io

Para usar este diagrama en Draw.io:

1. **Copiar bloque Mermaid** (sección 3)
2. Ir a [draw.io](https://draw.io)
3. `File → New → mermaid` (o pegar en editor existente)
4. Pegar el código Mermaid
5. Ajustar layout si es necesario
6. Exportar como `.drawio` o imagen PNG/SVG

---

## 11. Script de Validación (SQL)

```sql
-- Verificar integridad referencial
USE metaverso_upds;

-- Contar registros por tabla
SELECT 
    'usuarios' AS tabla, COUNT(*) AS total FROM usuarios
UNION ALL SELECT 'usuario_roles', COUNT(*) FROM usuario_roles
UNION ALL SELECT 'roles', COUNT(*) FROM roles
UNION ALL SELECT 'datos_personales', COUNT(*) FROM datos_personales
UNION ALL SELECT 'perfiles_estudiante', COUNT(*) FROM perfiles_estudiante
UNION ALL SELECT 'perfiles_docente', COUNT(*) FROM perfiles_docente
UNION ALL SELECT 'avatares', COUNT(*) FROM avatares
UNION ALL SELECT 'consentimientos', COUNT(*) FROM consentimientos
UNION ALL SELECT 'carreras', COUNT(*) FROM carreras
UNION ALL SELECT 'asignaturas', COUNT(*) FROM asignaturas
UNION ALL SELECT 'inscripciones', COUNT(*) FROM inscripciones
UNION ALL SELECT 'espacios', COUNT(*) FROM espacios
UNION ALL SELECT 'sesiones_clase', COUNT(*) FROM sesiones_clase
UNION ALL SELECT 'asistencias', COUNT(*) FROM asistencias
UNION ALL SELECT 'bitacora', COUNT(*) FROM bitacora;

-- Verificar usuarios demo
SELECT email, nombre, apellido, 
       (SELECT GROUP_CONCAT(r.nombre) FROM usuario_roles ur 
        JOIN roles r ON r.id=ur.rol_id WHERE ur.usuario_id=u.id) AS roles
FROM usuarios u;

-- Verificar inscripciones automáticas
SELECT u.email, COUNT(i.id) AS inscripciones
FROM usuarios u LEFT JOIN inscripciones i ON i.usuario_id=u.id
WHERE u.activo=1 GROUP BY u.id;
```

---

**Versión:** 2.3 | **Normalización:** 3FN | **Estado:** ✅ Validado
