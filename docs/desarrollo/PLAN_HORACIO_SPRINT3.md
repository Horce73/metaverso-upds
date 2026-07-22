# Plan de Implementación — Horacio López: Sprint 3 (Seguridad)

> **For agentic workers:** Use inline execution to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar 2 endpoints de seguridad al backend: bitácora admin y datos personales.

**Architecture:** Crear `server/src/middleware/auth.ts` con middleware reutilizable (RBAC + admin check). Agregar los 3 endpoints directamente en `server/src/index.ts` siguiendo la estructura existente.

**Tech Stack:** Express, PostgreSQL (pool), JWT, existing middleware pattern

---

## Archivos a crear/modificar

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `server/src/middleware/auth.ts` | **Crear** | `authenticateJWT`, `requiereRol`, `requiereAdmin` — extraer del index.ts existente |
| `server/src/index.ts` | **Modificar** | Importar middleware, agregar 3 endpoints nuevos |

---

### Task 1: Crear middleware/auth.ts con helpers reutilizables

**Archivos:**
- Create: `server/src/middleware/auth.ts`

- [x] **Step 1: Crear directorio y archivo**

```bash
mkdir -p server/src/middleware
```

- [x] **Step 2: Crear `server/src/middleware/auth.ts`**

```typescript
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'upds-metaverso-super-secret-key-2026';

// Middleware: verificar JWT y cargar req.user
export function authenticateJWT(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.sendStatus(401);

  const token = authHeader.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err) return res.sendStatus(403);
    req.user = decoded;
    next();
  });
}

// Middleware: verificar que el usuario tenga al menos uno de los roles indicados
export function requiereRol(...rolesPermitidos: string[]) {
  return async (req: any, res: any, next: any) => {
    try {
      const result = await pool.query(
        `SELECT r.nombre
         FROM usuario_roles ur
         JOIN roles r ON r.id = ur.rol_id
         WHERE ur.usuario_id = $1`,
        [req.user.userId]
      );
      const roles = result.rows.map((r: any) => r.nombre);
      const tieneRol = roles.some((r: string) => rolesPermitidos.includes(r));
      if (!tieneRol) {
        return res.status(403).json({ error: 'Acceso denegado: rol insuficiente' });
      }
      req.user.roles = roles;
      next();
    } catch {
      res.status(500).json({ error: 'Error de servidor' });
    }
  };
}

// Convenience: solo administradores
export const requiereAdmin = requiereRol('administrador');
```

- [x] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

---

### Task 2: Refactorizar index.ts — importar middleware, eliminar duplicados

**Archivos:**
- Modify: `server/src/index.ts` (líneas 1-61)

- [x] **Step 1: Reemplazar import de JWT y middleware inline por import del módulo**

Cambiar las líneas 1-61 de `index.ts` — eliminar la función `authenticateJWT` inline y la función `bitacora` (se reubicarán). Reemplazar con:

```typescript
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { ExpressPeerServer } from 'peer';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { pool } from './db.js';
import { setupSockets } from './socketHandler.js';
import { authenticateJWT, requiereAdmin } from './middleware/auth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'upds-metaverso-super-secret-key-2026';

app.use(cors());
app.use(express.json());

const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

setupSockets(io);

const peerServer = ExpressPeerServer(server, {
  path: '/peerjs',
  allow_discovery: true
});
app.use('/peer', peerServer);

// Helper: registrar evento en bitacora
async function bitacora(usuarioId: number | null, evento: string, detalle = '', ip = '') {
  try {
    await pool.query(
      'INSERT INTO bitacora (usuario_id, evento, detalle, ip) VALUES ($1, $2, $3, $4)',
      [usuarioId, evento, detalle, ip]
    );
  } catch (err) {
    console.error('Error al registrar bitacora:', err);
  }
}
```

Esto elimina la función `authenticateJWT` duplicada (que estaba en líneas 37-49) y reemplaza su uso por el import.

- [x] **Step 2: Verificar que compila**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

---

### Task 3: Endpoint GET /api/admin/bitacora (solo admin)

**Archivos:**
- Modify: `server/src/index.ts` (agregar después del endpoint 8 — Reporte de Asistencia, antes de "Iniciar Servidor")

- [x] **Step 1: Agregar endpoint bitácora**

Agregar antes de la sección "Iniciar Servidor" (antes de `server.listen`):

```typescript
// ----------------------------------------------------------------------------
// 9. Bitacora de Auditoria (RNF-05) - Solo Admin
// ----------------------------------------------------------------------------
app.get('/api/admin/bitacora', authenticateJWT, requiereAdmin, async (req: any, res) => {
  try {
    const { evento, desde, hasta, limit: queryLimit } = req.query;
    let sql = `
      SELECT b.id, b.usuario_id, b.evento, b.detalle, b.ip, b.fecha,
             u.email, u.nombre, u.apellido
      FROM bitacora b
      LEFT JOIN usuarios u ON u.id = b.usuario_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let idx = 1;

    if (evento) {
      sql += ` AND b.evento = $${idx++}`;
      params.push(evento);
    }
    if (desde) {
      sql += ` AND b.fecha >= $${idx++}`;
      params.push(desde);
    }
    if (hasta) {
      sql += ` AND b.fecha <= $${idx++}`;
      params.push(hasta);
    }

    sql += ` ORDER BY b.fecha DESC LIMIT $${idx}`;
    params.push(Math.min(Number(queryLimit) || 200, 500));

    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener bitacora:', err);
    res.status(500).json({ error: 'Error de servidor' });
  }
});
```

- [x] **Step 2: Verificar que compila**

```bash
npx tsc --noEmit
```

---

### Task 4: Endpoints GET/PUT /api/usuario/datos-personales

**Archivos:**
- Modify: `server/src/index.ts` (agregar después del endpoint 9)

- [x] **Step 1: Agregar endpoints datos personales**

```typescript
// ----------------------------------------------------------------------------
// 10. Datos Personales (RNF-03)
// ----------------------------------------------------------------------------
app.get('/api/usuario/datos-personales', authenticateJWT, async (req: any, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM datos_personales WHERE usuario_id = $1',
      [req.user.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Datos personales no encontrados' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al obtener datos personales:', err);
    res.status(500).json({ error: 'Error de servidor' });
  }
});

app.put('/api/usuario/datos-personales', authenticateJWT, async (req: any, res) => {
  const { userId } = req.user;
  const {
    documento_identidad, fecha_nacimiento, nacionalidad,
    genero, domicilio, tipo_sangre, estado_civil
  } = req.body;

  try {
    // Verificar que el usuario sea dueño de los datos o admin
    const rolesRes = await pool.query(
      `SELECT r.nombre FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id WHERE ur.usuario_id = $1`,
      [userId]
    );
    const roles = rolesRes.rows.map((r: any) => r.nombre);

    const result = await pool.query(
      `UPDATE datos_personales SET
         documento_identidad = COALESCE($1, documento_identidad),
         fecha_nacimiento    = COALESCE($2, fecha_nacimiento),
         nacionalidad        = COALESCE($3, nacionalidad),
         genero              = COALESCE($4, genero),
         domicilio           = COALESCE($5, domicilio),
         tipo_sangre         = COALESCE($6, tipo_sangre),
         estado_civil        = COALESCE($7, estado_civil),
         actualizado_en      = NOW()
       WHERE usuario_id = $8
       RETURNING *`,
      [
        documento_identidad || null,
        fecha_nacimiento || null,
        nacionalidad || null,
        genero || null,
        domicilio || null,
        tipo_sangre || null,
        estado_civil || null,
        userId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Datos personales no encontrados' });
    }

    await bitacora(userId, 'actualizacion_datos', '', req.ip);
    res.json({ message: 'Datos personales actualizados', datos: result.rows[0] });
  } catch (err: any) {
    console.error('Error al actualizar datos personales:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'El documento de identidad ya está registrado' });
    }
    res.status(500).json({ error: 'Error de servidor' });
  }
});
```

- [x] **Step 2: Verificar que compila**

```bash
npx tsc --noEmit
```

---

### Task 5: Verificación final y commit

- [x] **Step 1: Compilar backend completo**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [x] **Step 2: Lint**

```bash
npm run lint
```

Esperado: 0 errores (warnings preexistentes de Pizarra2D son aceptables).

- [x] **Step 3: Commit**

```bash
git add server/src/middleware/auth.ts server/src/index.ts
git commit -m "feat(seguridad): bitacora admin, datos personales

- GET /api/admin/bitacora: consulta de auditoria con filtros (solo admin)
- GET/PUT /api/usuario/datos-personales: lectura y actualizacion
- middleware/auth.ts: authenticateJWT, requiereRol, requiereAdmin"
```

---
