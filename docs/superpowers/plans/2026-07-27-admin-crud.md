# Admin CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin role full control over the system — create, read, update, delete users, spaces, carreras, and asignaturas via real API endpoints and a fully integrated AdminPanel.

**Architecture:** Backend gets protected admin CRUD endpoints under `/api/admin/*` guarded by `requiereAdmin`. Frontend `AdminPanel.tsx` is fully rewritten to call these real endpoints instead of mock data, with proper tables, forms, edit modals, and delete confirmations.

**Tech Stack:** Express.js + pg (node-postgres) + JWT auth middleware | React 19 + TypeScript + Vite

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `server/src/index.ts` | Add 10+ admin CRUD endpoints |
| Rewrite | `src/components/AdminPanel.tsx` | Full rewrite: real API calls, CRUD UI |

---

## Task 1: Backend — Admin User Management Endpoints

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Add GET /api/admin/usuarios**

After the existing `GET /api/admin/bitacora` endpoint in `server/src/index.ts`, add:

```typescript
// ── Admin: Gestión de Usuarios ──────────────────────────────────────────────

// Listar todos los usuarios (con roles y perfil)
app.get('/api/admin/usuarios', authenticateJWT, requiereAdmin, async (req, res) => {
  try {
    const { rows: usuarios } = await pool.query(`
      SELECT u.id, u.email, u.nombre, u.apellido, u.activo, u.creado_en,
             COALESCE(
               ARRAY_AGG(r.nombre) FILTER (WHERE r.nombre IS NOT NULL),
               '{}'
             ) AS roles
      FROM usuarios u
      LEFT JOIN usuario_roles ur ON ur.usuario_id = u.id
      LEFT JOIN roles r ON r.id = ur.rol_id
      GROUP BY u.id
      ORDER BY u.id
    `);
    res.json(usuarios);
  } catch (err) {
    console.error('Error al listar usuarios:', err);
    res.status(500).json({ error: 'Error al listar usuarios' });
  }
});

// Obtener un usuario por ID
app.get('/api/admin/usuarios/:id', authenticateJWT, requiereAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(`
      SELECT u.id, u.email, u.nombre, u.apellido, u.activo, u.creado_en,
             COALESCE(
               ARRAY_AGG(r.nombre) FILTER (WHERE r.nombre IS NOT NULL),
               '{}'
             ) AS roles
      FROM usuarios u
      LEFT JOIN usuario_roles ur ON ur.usuario_id = u.id
      LEFT JOIN roles r ON r.id = ur.rol_id
      WHERE u.id = $1
      GROUP BY u.id
    `, [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error al obtener usuario:', err);
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
});

// Crear usuario (admin puede crear cualquier rol)
app.post('/api/admin/usuarios', authenticateJWT, requiereAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { email, password, nombre, apellido, rol } = req.body;
    if (!email || !password || !nombre || !apellido || !rol) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: email, password, nombre, apellido, rol' });
    }

    // Validar que el rol exista
    const { rows: rolesRows } = await pool.query('SELECT id, nombre FROM roles WHERE nombre = $1', [rol]);
    if (rolesRows.length === 0) {
      return res.status(400).json({ error: `Rol inválido: ${rol}` });
    }

    await client.query('BEGIN');

    const hash = await bcrypt.hash(password, 10);
    const { rows: [newUser] } = await client.query(
      `INSERT INTO usuarios (email, password_hash, nombre, apellido)
       VALUES ($1, $2, $3, $4) RETURNING id, email, nombre, apellido, activo, creado_en`,
      [email, hash, nombre, apellido]
    );

    await client.query(
      'INSERT INTO usuario_roles (usuario_id, rol_id, asignado_por) VALUES ($1, $2, $3)',
      [newUser.id, rolesRows[0].id, req.user!.userId]
    );

    // Crear perfil vacío según rol
    if (rol === 'estudiante') {
      await client.query('INSERT INTO perfiles_estudiante (usuario_id) VALUES ($1)', [newUser.id]);
    } else if (rol === 'docente') {
      await client.query('INSERT INTO perfiles_docente (usuario_id) VALUES ($1)', [newUser.id]);
    }

    await client.query('COMMIT');

    await bitacora(req.user!.userId, 'crear_usuario', `Creó usuario ${email} (${rol})`, req.ip || '');

    res.status(201).json({ ...newUser, roles: [rol] });
  } catch (err) {
    await client.query('ROLLBACK');
    if ((err as any).code === '23505') {
      return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
    }
    console.error('Error al crear usuario:', err);
    res.status(500).json({ error: 'Error al crear usuario' });
  } finally {
    client.release();
  }
});

// Actualizar usuario (email, nombre, apellido, activo, roles)
app.put('/api/admin/usuarios/:id', authenticateJWT, requiereAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { email, nombre, apellido, activo, roles } = req.body;

    await client.query('BEGIN');

    // Actualizar campos básicos
    const fields: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (email !== undefined) { fields.push(`email = $${paramIdx++}`); values.push(email); }
    if (nombre !== undefined) { fields.push(`nombre = $${paramIdx++}`); values.push(nombre); }
    if (apellido !== undefined) { fields.push(`apellido = $${paramIdx++}`); values.push(apellido); }
    if (activo !== undefined) { fields.push(`activo = $${paramIdx++}`); values.push(activo); }

    if (fields.length > 0) {
      values.push(id);
      await client.query(`UPDATE usuarios SET ${fields.join(', ')} WHERE id = $${paramIdx}`, values);
    }

    // Actualizar roles si se proveen
    if (Array.isArray(roles)) {
      await client.query('DELETE FROM usuario_roles WHERE usuario_id = $1', [id]);
      for (const roleName of roles) {
        const { rows } = await client.query('SELECT id FROM roles WHERE nombre = $1', [roleName]);
        if (rows.length > 0) {
          await client.query(
            'INSERT INTO usuario_roles (usuario_id, rol_id, asignado_por) VALUES ($1, $2, $3)',
            [id, rows[0].id, req.user!.userId]
          );
        }
      }
    }

    await client.query('COMMIT');

    await bitacora(req.user!.userId, 'editar_usuario', `Editó usuario ID ${id}`, req.ip || '');

    // Devolver usuario actualizado
    const { rows } = await pool.query(`
      SELECT u.id, u.email, u.nombre, u.apellido, u.activo, u.creado_en,
             COALESCE(ARRAY_AGG(r.nombre) FILTER (WHERE r.nombre IS NOT NULL), '{}') AS roles
      FROM usuarios u
      LEFT JOIN usuario_roles ur ON ur.usuario_id = u.id
      LEFT JOIN roles r ON r.id = ur.rol_id
      WHERE u.id = $1
      GROUP BY u.id
    `, [id]);
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al actualizar usuario:', err);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  } finally {
    client.release();
  }
});

// Resetear contraseña de usuario
app.put('/api/admin/usuarios/:id/password', authenticateJWT, requiereAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    const hash = await bcrypt.hash(password, 10);
    const { rowCount } = await pool.query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [hash, id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    await bitacora(req.user!.userId, 'reset_password', `Reseteó contraseña del usuario ID ${id}`, req.ip || '');
    res.json({ message: 'Contraseña actualizada' });
  } catch (err) {
    console.error('Error al resetear contraseña:', err);
    res.status(500).json({ error: 'Error al actualizar contraseña' });
  }
});

// Eliminar usuario
app.delete('/api/admin/usuarios/:id', authenticateJWT, requiereAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    // No permitir eliminar el propio usuario
    if (Number(id) === req.user!.userId) {
      return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
    }
    const { rowCount } = await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    await bitacora(req.user!.userId, 'eliminar_usuario', `Eliminó usuario ID ${id}`, req.ip || '');
    res.json({ message: 'Usuario eliminado' });
  } catch (err) {
    console.error('Error al eliminar usuario:', err);
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit` in the `server/` directory
Expected: No errors

---

## Task 2: Backend — Admin Espacios Management Endpoints

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Add CRUD endpoints for espacios**

After the user management endpoints, add:

```typescript
// ── Admin: Gestión de Espacios ──────────────────────────────────────────────

// Listar todos los espacios
app.get('/api/admin/espacios', authenticateJWT, requiereAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT e.id, e.nombre, e.tipo, e.asignatura_id, e.escena_url, e.capacidad_max, e.activo,
             a.nombre AS asignatura_nombre,
             c.nombre AS carrera_nombre
      FROM espacios e
      LEFT JOIN asignaturas a ON a.id = e.asignatura_id
      LEFT JOIN carreras c ON c.id = a.carrera_id
      ORDER BY e.id
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error al listar espacios:', err);
    res.status(500).json({ error: 'Error al listar espacios' });
  }
});

// Crear espacio
app.post('/api/admin/espacios', authenticateJWT, requiereAdmin, async (req, res) => {
  try {
    const { nombre, tipo, asignatura_id, escena_url, capacidad_max } = req.body;
    if (!nombre || !tipo) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: nombre, tipo' });
    }
    if (!['campus', 'aula'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo inválido. Debe ser: campus o aula' });
    }
    if (tipo === 'aula' && !asignatura_id) {
      return res.status(400).json({ error: 'Las aulas deben estar vinculadas a una asignatura' });
    }
    if (tipo === 'campus' && asignatura_id) {
      return res.status(400).json({ error: 'Los campus no deben tener asignatura' });
    }

    const url = escena_url || 'https://metaverso-upds.s3.amazonaws.com/scenes/campus-central.glb';
    const cap = capacidad_max || 40;

    const { rows } = await pool.query(
      `INSERT INTO espacios (nombre, tipo, asignatura_id, escena_url, capacidad_max)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [nombre, tipo, asignatura_id || null, url, cap]
    );

    await bitacora(req.user!.userId, 'crear_espacio', `Creó espacio "${nombre}" (${tipo})`, req.ip || '');
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error al crear espacio:', err);
    res.status(500).json({ error: 'Error al crear espacio' });
  }
});

// Actualizar espacio
app.put('/api/admin/espacios/:id', authenticateJWT, requiereAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, tipo, asignatura_id, capacidad_max, activo } = req.body;

    const fields: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (nombre !== undefined) { fields.push(`nombre = $${paramIdx++}`); values.push(nombre); }
    if (tipo !== undefined) { fields.push(`tipo = $${paramIdx++}`); values.push(tipo); }
    if (asignatura_id !== undefined) { fields.push(`asignatura_id = $${paramIdx++}`); values.push(asignatura_id || null); }
    if (capacidad_max !== undefined) { fields.push(`capacidad_max = $${paramIdx++}`); values.push(capacidad_max); }
    if (activo !== undefined) { fields.push(`activo = $${paramIdx++}`); values.push(activo); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    values.push(id);
    const { rowCount } = await pool.query(
      `UPDATE espacios SET ${fields.join(', ')} WHERE id = $${paramIdx}`,
      values
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Espacio no encontrado' });

    await bitacora(req.user!.userId, 'editar_espacio', `Editó espacio ID ${id}`, req.ip || '');

    const { rows } = await pool.query(`
      SELECT e.*, a.nombre AS asignatura_nombre, c.nombre AS carrera_nombre
      FROM espacios e
      LEFT JOIN asignaturas a ON a.id = e.asignatura_id
      LEFT JOIN carreras c ON c.id = a.carrera_id
      WHERE e.id = $1
    `, [id]);
    res.json(rows[0]);
  } catch (err) {
    console.error('Error al actualizar espacio:', err);
    res.status(500).json({ error: 'Error al actualizar espacio' });
  }
});

// Eliminar espacio
app.delete('/api/admin/espacios/:id', authenticateJWT, requiereAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query('DELETE FROM espacios WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Espacio no encontrado' });

    await bitacora(req.user!.userId, 'eliminar_espacio', `Eliminó espacio ID ${id}`, req.ip || '');
    res.json({ message: 'Espacio eliminado' });
  } catch (err) {
    console.error('Error al eliminar espacio:', err);
    res.status(500).json({ error: 'Error al eliminar espacio' });
  }
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit` in the `server/` directory
Expected: No errors

---

## Task 3: Backend — Admin Carreras & Asignaturas Management Endpoints

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Add CRUD for carreras**

```typescript
// ── Admin: Gestión de Carreras ──────────────────────────────────────────────

// Listar carreras (con conteo de materias)
app.get('/api/admin/carreras', authenticateJWT, requiereAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.*,
             COALESCE(m.count, 0) AS materias_count
      FROM carreras c
      LEFT JOIN (
        SELECT carrera_id, COUNT(*) AS count
        FROM asignaturas WHERE activa = TRUE
        GROUP BY carrera_id
      ) m ON m.carrera_id = c.id
      ORDER BY c.id
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error al listar carreras:', err);
    res.status(500).json({ error: 'Error al listar carreras' });
  }
});

// Crear carrera
app.post('/api/admin/carreras', authenticateJWT, requiereAdmin, async (req, res) => {
  try {
    const { sigla, nombre, titulo_academico, sistema_ensenanza, modelo_estudio } = req.body;
    if (!sigla || !nombre || !titulo_academico) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: sigla, nombre, titulo_academico' });
    }

    const { rows } = await pool.query(
      `INSERT INTO carreras (sigla, nombre, titulo_academico, sistema_ensenanza, modelo_estudio)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [sigla, nombre, titulo_academico, sistema_ensenanza || 'MODULAR', modelo_estudio || 'POR COMPETENCIAS']
    );

    await bitacora(req.user!.userId, 'crear_carrera', `Creó carrera "${nombre}"`, req.ip || '');
    res.status(201).json(rows[0]);
  } catch (err) {
    if ((err as any).code === '23505') {
      return res.status(409).json({ error: 'Ya existe una carrera con esa sigla o nombre' });
    }
    console.error('Error al crear carrera:', err);
    res.status(500).json({ error: 'Error al crear carrera' });
  }
});

// Actualizar carrera
app.put('/api/admin/carreras/:id', authenticateJWT, requiereAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { sigla, nombre, titulo_academico, sistema_ensenanza, modelo_estudio, activa } = req.body;

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (sigla !== undefined) { fields.push(`sigla = $${idx++}`); values.push(sigla); }
    if (nombre !== undefined) { fields.push(`nombre = $${idx++}`); values.push(nombre); }
    if (titulo_academico !== undefined) { fields.push(`titulo_academico = $${idx++}`); values.push(titulo_academico); }
    if (sistema_ensenanza !== undefined) { fields.push(`sistema_ensenanza = $${idx++}`); values.push(sistema_ensenanza); }
    if (modelo_estudio !== undefined) { fields.push(`modelo_estudio = $${idx++}`); values.push(modelo_estudio); }
    if (activa !== undefined) { fields.push(`activa = $${idx++}`); values.push(activa); }

    if (fields.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });

    values.push(id);
    const { rowCount } = await pool.query(`UPDATE carreras SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    if (rowCount === 0) return res.status(404).json({ error: 'Carrera no encontrada' });

    await bitacora(req.user!.userId, 'editar_carrera', `Editó carrera ID ${id}`, req.ip || '');
    const { rows } = await pool.query('SELECT * FROM carreras WHERE id = $1', [id]);
    res.json(rows[0]);
  } catch (err) {
    console.error('Error al actualizar carrera:', err);
    res.status(500).json({ error: 'Error al actualizar carrera' });
  }
});

// Eliminar carrera
app.delete('/api/admin/carreras/:id', authenticateJWT, requiereAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    // Verificar que no tenga materias activas
    const { rows } = await pool.query('SELECT COUNT(*) FROM asignaturas WHERE carrera_id = $1 AND activa = TRUE', [id]);
    if (Number(rows[0].count) > 0) {
      return res.status(400).json({ error: 'No se puede eliminar: la carrera tiene materias activas. Desactívela primero.' });
    }
    const { rowCount } = await pool.query('DELETE FROM carreras WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Carrera no encontrada' });

    await bitacora(req.user!.userId, 'eliminar_carrera', `Eliminó carrera ID ${id}`, req.ip || '');
    res.json({ message: 'Carrera eliminada' });
  } catch (err) {
    console.error('Error al eliminar carrera:', err);
    res.status(500).json({ error: 'Error al eliminar carrera' });
  }
});
```

- [ ] **Step 2: Add CRUD for asignaturas**

```typescript
// ── Admin: Gestión de Asignaturas ───────────────────────────────────────────

// Listar asignaturas (con info de carrera y docente)
app.get('/api/admin/asignaturas', authenticateJWT, requiereAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.*, c.nombre AS carrera_nombre, c.sigla AS carrera_sigla,
             u.nombre || ' ' || u.apellido AS docente_nombre
      FROM asignaturas a
      LEFT JOIN carreras c ON c.id = a.carrera_id
      LEFT JOIN perfiles_docente pd ON pd.usuario_id = a.docente_id
      LEFT JOIN usuarios u ON u.id = pd.usuario_id
      ORDER BY a.id
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error al listar asignaturas:', err);
    res.status(500).json({ error: 'Error al listar asignaturas' });
  }
});

// Crear asignatura
app.post('/api/admin/asignaturas', authenticateJWT, requiereAdmin, async (req, res) => {
  try {
    const { codigo, nombre, carrera_id, docente_id, gestion } = req.body;
    if (!codigo || !nombre || !carrera_id || !docente_id || !gestion) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: codigo, nombre, carrera_id, docente_id, gestion' });
    }

    // Verificar que el docente tenga perfil de docente
    const { rows: perfilDocente } = await pool.query('SELECT 1 FROM perfiles_docente WHERE usuario_id = $1', [docente_id]);
    if (perfilDocente.length === 0) {
      return res.status(400).json({ error: 'El docente seleccionado no tiene perfil de docente registrado' });
    }

    const { rows } = await pool.query(
      `INSERT INTO asignaturas (codigo, nombre, carrera_id, docente_id, gestion)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [codigo, nombre, carrera_id, docente_id, gestion]
    );

    await bitacora(req.user!.userId, 'crear_asignatura', `Creó asignatura "${nombre}"`, req.ip || '');
    res.status(201).json(rows[0]);
  } catch (err) {
    if ((err as any).code === '23505') {
      return res.status(409).json({ error: 'Ya existe una asignatura con ese código' });
    }
    console.error('Error al crear asignatura:', err);
    res.status(500).json({ error: 'Error al crear asignatura' });
  }
});

// Actualizar asignatura
app.put('/api/admin/asignaturas/:id', authenticateJWT, requiereAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { codigo, nombre, carrera_id, docente_id, gestion, activa } = req.body;

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (codigo !== undefined) { fields.push(`codigo = $${idx++}`); values.push(codigo); }
    if (nombre !== undefined) { fields.push(`nombre = $${idx++}`); values.push(nombre); }
    if (carrera_id !== undefined) { fields.push(`carrera_id = $${idx++}`); values.push(carrera_id); }
    if (docente_id !== undefined) { fields.push(`docente_id = $${idx++}`); values.push(docente_id); }
    if (gestion !== undefined) { fields.push(`gestion = $${idx++}`); values.push(gestion); }
    if (activa !== undefined) { fields.push(`activa = $${idx++}`); values.push(activa); }

    if (fields.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });

    values.push(id);
    const { rowCount } = await pool.query(`UPDATE asignaturas SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    if (rowCount === 0) return res.status(404).json({ error: 'Asignatura no encontrada' });

    await bitacora(req.user!.userId, 'editar_asignatura', `Editó asignatura ID ${id}`, req.ip || '');
    const { rows } = await pool.query('SELECT * FROM asignaturas WHERE id = $1', [id]);
    res.json(rows[0]);
  } catch (err) {
    console.error('Error al actualizar asignatura:', err);
    res.status(500).json({ error: 'Error al actualizar asignatura' });
  }
});

// Eliminar asignatura
app.delete('/api/admin/asignaturas/:id', authenticateJWT, requiereAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    // Verificar inscripciones activas
    const { rows } = await pool.query('SELECT COUNT(*) FROM inscripciones WHERE asignatura_id = $1', [id]);
    if (Number(rows[0].count) > 0) {
      return res.status(400).json({ error: 'No se puede eliminar: hay estudiantes inscritos en esta asignatura' });
    }
    const { rowCount } = await pool.query('DELETE FROM asignaturas WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Asignatura no encontrada' });

    await bitacora(req.user!.userId, 'eliminar_asignatura', `Eliminó asignatura ID ${id}`, req.ip || '');
    res.json({ message: 'Asignatura eliminada' });
  } catch (err) {
    console.error('Error al eliminar asignatura:', err);
    res.status(500).json({ error: 'Error al eliminar asignatura' });
  }
});

// Helper: listar docentes (para formularios de asignatura)
app.get('/api/admin/docentes', authenticateJWT, requiereAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.nombre, u.apellido, u.email,
             pd.codigo_docente, pd.especialidad
      FROM usuarios u
      INNER JOIN usuario_roles ur ON ur.usuario_id = u.id
      INNER JOIN roles r ON r.id = ur.rol_id
      LEFT JOIN perfiles_docente pd ON pd.usuario_id = u.id
      WHERE r.nombre = 'docente' AND u.activo = TRUE
      ORDER BY u.apellido, u.nombre
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error al listar docentes:', err);
    res.status(500).json({ error: 'Error al listar docentes' });
  }
});
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit` in the `server/` directory
Expected: No errors

- [ ] **Step 4: Commit backend**

```bash
git add server/src/index.ts
git commit -m "feat(admin): add full CRUD endpoints for users, spaces, carreras, asignaturas"
```

---

## Task 4: Frontend — Rewrite AdminPanel.tsx with Real API Calls

**Files:**
- Rewrite: `src/components/AdminPanel.tsx`

- [ ] **Step 1: Rewrite AdminPanel.tsx**

The full replacement file. Key changes:
- Remove ALL mock data
- Add `useEffect` to fetch data from real endpoints on tab change
- All CRUD operations call backend via `fetch()` with JWT token
- Tab: Usuarios — table with create/edit/delete/reset password
- Tab: Espacios — card grid with create/edit/delete
- Tab: Carreras — table with create/edit/delete
- Tab: Asignaturas — table with create/edit/delete
- Tab: Reportes — real bitacora endpoint
- Edit modal overlay for each entity
- Delete confirmation with `window.confirm()`
- Toast/notification on success/error
- Loading states

```tsx
import { useState, useEffect, useCallback } from 'react';

interface AdminPanelProps {
  token: string;
  onClose: () => void;
}

interface Usuario {
  id: number;
  email: string;
  nombre: string;
  apellido: string;
  activo: boolean;
  creado_en: string;
  roles: string[];
}

interface Espacio {
  id: number;
  nombre: string;
  tipo: 'campus' | 'aula';
  asignatura_id: number | null;
  asignatura_nombre: string | null;
  carrera_nombre: string | null;
  escena_url: string;
  capacidad_max: number;
  activo: boolean;
}

interface Carrera {
  id: number;
  sigla: string;
  nombre: string;
  titulo_academico: string;
  sistema_ensenanza: string;
  modelo_estudio: string;
  activa: boolean;
  materias_count: number;
}

interface Asignatura {
  id: number;
  codigo: string;
  nombre: string;
  carrera_id: number;
  docente_id: number;
  gestion: string;
  activa: boolean;
  carrera_nombre: string | null;
  carrera_sigla: string | null;
  docente_nombre: string | null;
}

interface Docente {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
}

interface BitacoraEntry {
  id: number;
  usuario_id: number;
  email: string | null;
  nombre_usuario: string | null;
  evento: string;
  detalle: string;
  ip: string;
  fecha: string;
}

type Tab = 'usuarios' | 'espacios' | 'carreras' | 'asignaturas' | 'reportes';

export default function AdminPanel({ token, onClose }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('usuarios');

  // Data states
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [espacios, setEspacios] = useState<Espacio[]>([]);
  const [carreras, setCarreras] = useState<Carrera[]>([]);
  const [asignaturas, setAsignaturas] = useState<Asignatura[]>([]);
  const [docentes, setDocentes] = useState<Docente[]>([]);
  const [bitacora, setBitacora] = useState<BitacoraEntry[]>([]);

  // Loading & notification
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Edit modal state
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editModal, setEditModal] = useState<string | null>(null);

  // Create form visibility
  const [showCreate, setShowCreate] = useState(false);

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const notify = (type: 'success' | 'error', msg: string) => {
    setNotification({ type, msg });
    setTimeout(() => setNotification(null), 4000);
  };

  // ─── Fetch Functions ─────────────────────────────────────────────────────

  const fetchUsuarios = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/usuarios', { headers });
      if (!res.ok) throw new Error('Error al cargar usuarios');
      setUsuarios(await res.json());
    } catch (err: any) { notify('error', err.message); }
  }, [token]);

  const fetchEspacios = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/espacios', { headers });
      if (!res.ok) throw new Error('Error al cargar espacios');
      setEspacios(await res.json());
    } catch (err: any) { notify('error', err.message); }
  }, [token]);

  const fetchCarreras = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/carreras', { headers });
      if (!res.ok) throw new Error('Error al cargar carreras');
      setCarreras(await res.json());
    } catch (err: any) { notify('error', err.message); }
  }, [token]);

  const fetchAsignaturas = useCallback(async () => {
    try {
      const [asigRes, carrRes, docRes] = await Promise.all([
        fetch('/api/admin/asignaturas', { headers }),
        fetch('/api/admin/carreras', { headers }),
        fetch('/api/admin/docentes', { headers }),
      ]);
      if (!asigRes.ok) throw new Error('Error al cargar asignaturas');
      setAsignaturas(await asigRes.json());
      if (carrRes.ok) setCarreras(await carrRes.json());
      if (docRes.ok) setDocentes(await docRes.json());
    } catch (err: any) { notify('error', err.message); }
  }, [token]);

  const fetchBitacora = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/bitacora?limit=100', { headers });
      if (!res.ok) throw new Error('Error al cargar bitácora');
      setBitacora(await res.json());
    } catch (err: any) { notify('error', err.message); }
  }, [token]);

  // ─── Load data on tab change ─────────────────────────────────────────────

  useEffect(() => {
    setLoading(true);
    const load = async () => {
      switch (activeTab) {
        case 'usuarios': await fetchUsuarios(); break;
        case 'espacios': await fetchEspacios(); break;
        case 'carreras': await fetchCarreras(); break;
        case 'asignaturas': await fetchAsignaturas(); break;
        case 'reportes': await fetchBitacora(); break;
      }
      setLoading(false);
    };
    load();
  }, [activeTab, fetchUsuarios, fetchEspacios, fetchCarreras, fetchAsignaturas, fetchBitacora]);

  // ─── CRUD Handlers ───────────────────────────────────────────────────────

  const handleDelete = async (entity: string, id: number, name: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar ${entity} "${name}"?`)) return;
    try {
      const res = await fetch(`/api/admin/${entity}/${id}`, { method: 'DELETE', headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      notify('success', `${entity} eliminado correctamente`);
      if (entity === 'usuarios') fetchUsuarios();
      else if (entity === 'espacios') fetchEspacios();
      else if (entity === 'carreras') fetchCarreras();
      else if (entity === 'asignaturas') fetchAsignaturas();
    } catch (err: any) { notify('error', err.message); }
  };

  const handleResetPassword = async (userId: number, userName: string) => {
    const newPass = prompt(`Nueva contraseña para ${userName} (mínimo 6 caracteres):`);
    if (!newPass) return;
    try {
      const res = await fetch(`/api/admin/usuarios/${userId}/password`, {
        method: 'PUT', headers,
        body: JSON.stringify({ password: newPass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      notify('success', 'Contraseña actualizada');
    } catch (err: any) { notify('error', err.message); }
  };

  // ─── Notification Toast ──────────────────────────────────────────────────

  const Toast = () => notification ? (
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 9999,
      padding: '12px 24px', borderRadius: 8, color: '#fff',
      background: notification.type === 'success' ? '#16a34a' : '#dc2626',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      fontFamily: 'Inter, sans-serif',
    }}>
      {notification.msg}
    </div>
  ) : null;

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <Toast />
      <div style={{
        background: '#111827', borderRadius: 16, width: '95vw', maxWidth: 1200,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        border: '1px solid #1e293b', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #1e293b',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <h2 style={{ margin: 0, color: '#f1f5f9', fontSize: 22 }}>Panel de Administración</h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#94a3b8', fontSize: 28, cursor: 'pointer',
          }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #1e293b', padding: '0 24px' }}>
          {(['usuarios', 'espacios', 'carreras', 'asignaturas', 'reportes'] as Tab[]).map(tab => (
            <button key={tab} onClick={() => { setActiveTab(tab); setShowCreate(false); setEditingItem(null); }} style={{
              padding: '12px 20px', cursor: 'pointer', border: 'none',
              borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
              background: 'none', color: activeTab === tab ? '#3b82f6' : '#64748b',
              fontWeight: activeTab === tab ? 600 : 400, textTransform: 'capitalize', fontSize: 14,
            }}>
              {tab === 'usuarios' ? 'Usuarios' : tab === 'espacios' ? 'Espacios' : tab === 'carreras' ? 'Carreras' : tab === 'asignaturas' ? 'Asignaturas' : 'Reportes'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {loading && <p style={{ color: '#94a3b8', textAlign: 'center' }}>Cargando...</p>}

          {/* ═══ USUARIOS TAB ═══ */}
          {activeTab === 'usuarios' && !loading && (
            <UsuariosTab
              usuarios={usuarios}
              showCreate={showCreate}
              setShowCreate={setShowCreate}
              token={token}
              onCreated={() => { fetchUsuarios(); setShowCreate(false); }}
              onEdit={(u) => { setEditingItem(u); setEditModal('usuario'); }}
              onDelete={(id, name) => handleDelete('usuarios', id, name)}
              onResetPassword={handleResetPassword}
            />
          )}

          {/* ═══ ESPACIOS TAB ═══ */}
          {activeTab === 'espacios' && !loading && (
            <EspaciosTab
              espacios={espacios}
              showCreate={showCreate}
              setShowCreate={setShowCreate}
              token={token}
              onCreated={() => { fetchEspacios(); setShowCreate(false); }}
              onEdit={(e) => { setEditingItem(e); setEditModal('espacio'); }}
              onDelete={(id, name) => handleDelete('espacios', id, name)}
            />
          )}

          {/* ═══ CARRERAS TAB ═══ */}
          {activeTab === 'carreras' && !loading && (
            <CarrerasTab
              carreras={carreras}
              showCreate={showCreate}
              setShowCreate={setShowCreate}
              token={token}
              onCreated={() => { fetchCarreras(); setShowCreate(false); }}
              onEdit={(c) => { setEditingItem(c); setEditModal('carrera'); }}
              onDelete={(id, name) => handleDelete('carreras', id, name)}
            />
          )}

          {/* ═══ ASIGNATURAS TAB ═══ */}
          {activeTab === 'asignaturas' && !loading && (
            <AsignaturasTab
              asignaturas={asignaturas}
              carreras={carreras}
              docentes={docentes}
              showCreate={showCreate}
              setShowCreate={setShowCreate}
              token={token}
              onCreated={() => { fetchAsignaturas(); setShowCreate(false); }}
              onEdit={(a) => { setEditingItem(a); setEditModal('asignatura'); }}
              onDelete={(id, name) => handleDelete('asignaturas', id, name)}
            />
          )}

          {/* ═══ REPORTES TAB ═══ */}
          {activeTab === 'reportes' && !loading && (
            <ReportesTab bitacora={bitacora} />
          )}
        </div>
      </div>

      {/* ═══ EDIT MODALS ═══ */}
      {editModal === 'usuario' && editingItem && (
        <EditUsuarioModal
          item={editingItem} token={token}
          onClose={() => setEditModal(null)}
          onSaved={() => { fetchUsuarios(); setEditModal(null); }}
        />
      )}
      {editModal === 'espacio' && editingItem && (
        <EditEspacioModal
          item={editingItem} token={token} carreras={carreras}
          onClose={() => setEditModal(null)}
          onSaved={() => { fetchEspacios(); setEditModal(null); }}
        />
      )}
      {editModal === 'carrera' && editingItem && (
        <EditCarreraModal
          item={editingItem} token={token}
          onClose={() => setEditModal(null)}
          onSaved={() => { fetchCarreras(); setEditModal(null); }}
        />
      )}
      {editModal === 'asignatura' && editingItem && (
        <EditAsignaturaModal
          item={editingItem} token={token} carreras={carreras} docentes={docentes}
          onClose={() => setEditModal(null)}
          onSaved={() => { fetchAsignaturas(); setEditModal(null); }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid #334155', background: '#1e293b', color: '#f1f5f9',
  fontSize: 14, boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: 4, color: '#94a3b8', fontSize: 13, fontWeight: 500,
};

const btnPrimary: React.CSSProperties = {
  padding: '10px 20px', borderRadius: 8, border: 'none',
  background: '#3b82f6', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14,
};

const btnDanger: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 6, border: 'none',
  background: '#dc2626', color: '#fff', fontWeight: 500, cursor: 'pointer', fontSize: 12,
};

const btnSmall: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 6, border: 'none',
  background: '#334155', color: '#f1f5f9', fontWeight: 500, cursor: 'pointer', fontSize: 12,
};

// ─── USUARIOS ───────────────────────────────────────────────────────────────

function UsuariosTab({ usuarios, showCreate, setShowCreate, token, onCreated, onEdit, onDelete, onResetPassword }: {
  usuarios: Usuario[];
  showCreate: boolean; setShowCreate: (v: boolean) => void;
  token: string; onCreated: () => void;
  onEdit: (u: Usuario) => void;
  onDelete: (id: number, name: string) => void;
  onResetPassword: (id: number, name: string) => void;
}) {
  const [form, setForm] = useState({ email: '', password: '', nombre: '', apellido: '', rol: 'estudiante' });
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/admin/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm({ email: '', password: '', nombre: '', apellido: '', rol: 'estudiante' });
      onCreated();
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  const roleColors: Record<string, string> = {
    administrador: '#f59e0b', docente: '#8b5cf6', estudiante: '#3b82f6', invitado: '#64748b',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <h3 style={{ color: '#f1f5f9', margin: 0 }}>Gestión de Usuarios ({usuarios.length})</h3>
        <button onClick={() => setShowCreate(!showCreate)} style={btnPrimary}>
          {showCreate ? 'Cancelar' : '+ Nuevo Usuario'}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} style={{
          background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 20,
          border: '1px solid #334155',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Nombre *</label>
              <input style={inputStyle} value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} required />
            </div>
            <div>
              <label style={labelStyle}>Apellido *</label>
              <input style={inputStyle} value={form.apellido} onChange={e => setForm({...form, apellido: e.target.value})} required />
            </div>
            <div>
              <label style={labelStyle}>Email *</label>
              <input style={inputStyle} type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required />
            </div>
            <div>
              <label style={labelStyle}>Contraseña *</label>
              <input style={inputStyle} type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required minLength={6} />
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'end', gap: 16 }}>
            <div>
              <label style={labelStyle}>Rol *</label>
              <select style={inputStyle} value={form.rol} onChange={e => setForm({...form, rol: e.target.value})}>
                <option value="estudiante">Estudiante</option>
                <option value="docente">Docente</option>
                <option value="administrador">Administrador</option>
              </select>
            </div>
            <button type="submit" disabled={saving} style={btnPrimary}>
              {saving ? 'Creando...' : 'Crear Usuario'}
            </button>
          </div>
        </form>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #1e293b' }}>
            {['ID', 'Nombre', 'Email', 'Rol', 'Estado', 'Creado', 'Acciones'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '12px 8px', color: '#64748b', fontSize: 13, fontWeight: 500 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {usuarios.map(u => (
            <tr key={u.id} style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={{ padding: '12px 8px', color: '#94a3b8', fontSize: 13 }}>{u.id}</td>
              <td style={{ padding: '12px 8px', color: '#f1f5f9', fontSize: 14 }}>{u.nombre} {u.apellido}</td>
              <td style={{ padding: '12px 8px', color: '#94a3b8', fontSize: 13 }}>{u.email}</td>
              <td style={{ padding: '12px 8px' }}>
                {u.roles.map(r => (
                  <span key={r} style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                    background: roleColors[r] || '#475569', color: '#fff', fontSize: 11, fontWeight: 600,
                    marginRight: 4,
                  }}>{r}</span>
                ))}
              </td>
              <td style={{ padding: '12px 8px' }}>
                <span style={{
                  display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                  background: u.activo ? '#16a34a' : '#dc2626', marginRight: 6,
                }} />
                <span style={{ color: '#94a3b8', fontSize: 13 }}>{u.activo ? 'Activo' : 'Inactivo'}</span>
              </td>
              <td style={{ padding: '12px 8px', color: '#94a3b8', fontSize: 13 }}>
                {new Date(u.creado_en).toLocaleDateString()}
              </td>
              <td style={{ padding: '12px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={() => onEdit(u)} style={btnSmall}>Editar</button>
                <button onClick={() => onResetPassword(u.id, `${u.nombre} ${u.apellido}`)} style={{...btnSmall, background: '#854d0e'}}>Reset Pass</button>
                <button onClick={() => onDelete(u.id, `${u.nombre} ${u.apellido}`)} style={btnDanger}>Eliminar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── ESPACIOS ───────────────────────────────────────────────────────────────

function EspaciosTab({ espacios, showCreate, setShowCreate, token, onCreated, onEdit, onDelete }: {
  espacios: Espacio[];
  showCreate: boolean; setShowCreate: (v: boolean) => void;
  token: string; onCreated: () => void;
  onEdit: (e: Espacio) => void;
  onDelete: (id: number, name: string) => void;
}) {
  const [form, setForm] = useState({ nombre: '', tipo: 'campus' as 'campus' | 'aula', capacidad_max: 50, escena_url: '' });
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/admin/espacios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm({ nombre: '', tipo: 'campus', capacidad_max: 50, escena_url: '' });
      onCreated();
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <h3 style={{ color: '#f1f5f9', margin: 0 }}>Gestión de Espacios ({espacios.length})</h3>
        <button onClick={() => setShowCreate(!showCreate)} style={btnPrimary}>
          {showCreate ? 'Cancelar' : '+ Nuevo Espacio'}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} style={{
          background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 20,
          border: '1px solid #334155',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Nombre *</label>
              <input style={inputStyle} value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} required />
            </div>
            <div>
              <label style={labelStyle}>Tipo</label>
              <select style={inputStyle} value={form.tipo} onChange={e => setForm({...form, tipo: e.target.value as any})}>
                <option value="campus">Campus</option>
                <option value="aula">Aula</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Capacidad</label>
              <input style={inputStyle} type="number" value={form.capacidad_max} onChange={e => setForm({...form, capacidad_max: Number(e.target.value)})} />
            </div>
          </div>
          <button type="submit" disabled={saving} style={{...btnPrimary, marginTop: 16}}>
            {saving ? 'Creando...' : 'Crear Espacio'}
          </button>
        </form>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {espacios.map(e => (
          <div key={e.id} style={{
            background: '#1e293b', borderRadius: 12, padding: 16,
            border: '1px solid #334155',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <h4 style={{ color: '#f1f5f9', margin: '0 0 8px 0', fontSize: 16 }}>{e.nombre}</h4>
                <span style={{
                  display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                  background: e.tipo === 'campus' ? '#065f46' : '#1e40af',
                  color: '#fff', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                }}>{e.tipo}</span>
                {e.asignatura_nombre && (
                  <p style={{ color: '#94a3b8', fontSize: 13, margin: '8px 0 0 0' }}>
                    {e.asignatura_nombre} ({e.carrera_nombre})
                  </p>
                )}
                <p style={{ color: '#64748b', fontSize: 12, margin: '4px 0 0 0' }}>Cap: {e.capacidad_max}</p>
              </div>
              <span style={{
                display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                background: e.activo ? '#16a34a' : '#dc2626',
              }} />
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button onClick={() => onEdit(e)} style={btnSmall}>Editar</button>
              <button onClick={() => onDelete(e.id, e.nombre)} style={btnDanger}>Eliminar</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CARRERAS ───────────────────────────────────────────────────────────────

function CarrerasTab({ carreras, showCreate, setShowCreate, token, onCreated, onEdit, onDelete }: {
  carreras: Carrera[];
  showCreate: boolean; setShowCreate: (v: boolean) => void;
  token: string; onCreated: () => void;
  onEdit: (c: Carrera) => void;
  onDelete: (id: number, name: string) => void;
}) {
  const [form, setForm] = useState({ sigla: '', nombre: '', titulo_academico: '', sistema_ensenanza: 'MODULAR', modelo_estudio: 'POR COMPETENCIAS' });
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/admin/carreras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm({ sigla: '', nombre: '', titulo_academico: '', sistema_ensenanza: 'MODULAR', modelo_estudio: 'POR COMPETENCIAS' });
      onCreated();
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <h3 style={{ color: '#f1f5f9', margin: 0 }}>Carreras ({carreras.length})</h3>
        <button onClick={() => setShowCreate(!showCreate)} style={btnPrimary}>
          {showCreate ? 'Cancelar' : '+ Nueva Carrera'}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} style={{
          background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 20,
          border: '1px solid #334155',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 2fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Sigla *</label>
              <input style={inputStyle} value={form.sigla} onChange={e => setForm({...form, sigla: e.target.value})} required />
            </div>
            <div>
              <label style={labelStyle}>Nombre *</label>
              <input style={inputStyle} value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} required />
            </div>
            <div>
              <label style={labelStyle}>Título Académico *</label>
              <input style={inputStyle} value={form.titulo_academico} onChange={e => setForm({...form, titulo_academico: e.target.value})} required />
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 16 }}>
            <div>
              <label style={labelStyle}>Sistema Enseñanza</label>
              <select style={inputStyle} value={form.sistema_ensenanza} onChange={e => setForm({...form, sistema_ensenanza: e.target.value})}>
                <option value="MODULAR">Modular</option>
                <option value="SEMESTRAL">Semestral</option>
                <option value="ANUAL">Anual</option>
              </select>
            </div>
            <button type="submit" disabled={saving} style={btnPrimary}>
              {saving ? 'Creando...' : 'Crear Carrera'}
            </button>
          </div>
        </form>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #1e293b' }}>
            {['ID', 'Sigla', 'Nombre', 'Título', 'Materias', 'Estado', 'Acciones'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '12px 8px', color: '#64748b', fontSize: 13, fontWeight: 500 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {carreras.map(c => (
            <tr key={c.id} style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={{ padding: '12px 8px', color: '#94a3b8', fontSize: 13 }}>{c.id}</td>
              <td style={{ padding: '12px 8px', color: '#f1f5f9', fontWeight: 600, fontSize: 14 }}>{c.sigla}</td>
              <td style={{ padding: '12px 8px', color: '#f1f5f9', fontSize: 14 }}>{c.nombre}</td>
              <td style={{ padding: '12px 8px', color: '#94a3b8', fontSize: 13 }}>{c.titulo_academico}</td>
              <td style={{ padding: '12px 8px', color: '#94a3b8', fontSize: 13 }}>{c.materias_count}</td>
              <td style={{ padding: '12px 8px' }}>
                <span style={{
                  display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                  background: c.activa ? '#16a34a' : '#dc2626', marginRight: 6,
                }} />
                <span style={{ color: '#94a3b8', fontSize: 13 }}>{c.activa ? 'Activa' : 'Inactiva'}</span>
              </td>
              <td style={{ padding: '12px 8px', display: 'flex', gap: 6 }}>
                <button onClick={() => onEdit(c)} style={btnSmall}>Editar</button>
                <button onClick={() => onDelete(c.id, c.nombre)} style={btnDanger}>Eliminar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── ASIGNATURAS ────────────────────────────────────────────────────────────

function AsignaturasTab({ asignaturas, carreras, docentes, showCreate, setShowCreate, token, onCreated, onEdit, onDelete }: {
  asignaturas: Asignatura[];
  carreras: Carrera[];
  docentes: Docente[];
  showCreate: boolean; setShowCreate: (v: boolean) => void;
  token: string; onCreated: () => void;
  onEdit: (a: Asignatura) => void;
  onDelete: (id: number, name: string) => void;
}) {
  const [form, setForm] = useState({ codigo: '', nombre: '', carrera_id: 0, docente_id: 0, gestion: new Date().getFullYear().toString() });
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/admin/asignaturas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm({ codigo: '', nombre: '', carrera_id: 0, docente_id: 0, gestion: new Date().getFullYear().toString() });
      onCreated();
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <h3 style={{ color: '#f1f5f9', margin: 0 }}>Asignaturas ({asignaturas.length})</h3>
        <button onClick={() => setShowCreate(!showCreate)} style={btnPrimary}>
          {showCreate ? 'Cancelar' : '+ Nueva Asignatura'}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} style={{
          background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 20,
          border: '1px solid #334155',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Código *</label>
              <input style={inputStyle} value={form.codigo} onChange={e => setForm({...form, codigo: e.target.value})} required />
            </div>
            <div>
              <label style={labelStyle}>Nombre *</label>
              <input style={inputStyle} value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} required />
            </div>
            <div>
              <label style={labelStyle}>Gestión *</label>
              <input style={inputStyle} value={form.gestion} onChange={e => setForm({...form, gestion: e.target.value})} required />
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '2fr 2fr auto', gap: 16, alignItems: 'end' }}>
            <div>
              <label style={labelStyle}>Carrera *</label>
              <select style={inputStyle} value={form.carrera_id} onChange={e => setForm({...form, carrera_id: Number(e.target.value)})} required>
                <option value={0}>Seleccionar carrera...</option>
                {carreras.filter(c => c.activa).map(c => (
                  <option key={c.id} value={c.id}>{c.sigla} - {c.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Docente *</label>
              <select style={inputStyle} value={form.docente_id} onChange={e => setForm({...form, docente_id: Number(e.target.value)})} required>
                <option value={0}>Seleccionar docente...</option>
                {docentes.map(d => (
                  <option key={d.id} value={d.id}>{d.apellido}, {d.nombre}</option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={saving} style={btnPrimary}>
              {saving ? 'Creando...' : 'Crear'}
            </button>
          </div>
        </form>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #1e293b' }}>
            {['ID', 'Código', 'Nombre', 'Carrera', 'Docente', 'Gestión', 'Estado', 'Acciones'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '12px 8px', color: '#64748b', fontSize: 13, fontWeight: 500 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {asignaturas.map(a => (
            <tr key={a.id} style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={{ padding: '12px 8px', color: '#94a3b8', fontSize: 13 }}>{a.id}</td>
              <td style={{ padding: '12px 8px', color: '#f1f5f9', fontWeight: 600, fontSize: 14 }}>{a.codigo}</td>
              <td style={{ padding: '12px 8px', color: '#f1f5f9', fontSize: 14 }}>{a.nombre}</td>
              <td style={{ padding: '12px 8px', color: '#94a3b8', fontSize: 13 }}>{a.carrera_sigla}</td>
              <td style={{ padding: '12px 8px', color: '#94a3b8', fontSize: 13 }}>{a.docente_nombre}</td>
              <td style={{ padding: '12px 8px', color: '#94a3b8', fontSize: 13 }}>{a.gestion}</td>
              <td style={{ padding: '12px 8px' }}>
                <span style={{
                  display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                  background: a.activa ? '#16a34a' : '#dc2626', marginRight: 6,
                }} />
                <span style={{ color: '#94a3b8', fontSize: 13 }}>{a.activa ? 'Activa' : 'Inactiva'}</span>
              </td>
              <td style={{ padding: '12px 8px', display: 'flex', gap: 6 }}>
                <button onClick={() => onEdit(a)} style={btnSmall}>Editar</button>
                <button onClick={() => onDelete(a.id, a.nombre)} style={btnDanger}>Eliminar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── REPORTES (Bitácora) ───────────────────────────────────────────────────

function ReportesTab({ bitacora }: { bitacora: BitacoraEntry[] }) {
  const eventoColors: Record<string, string> = {
    login: '#16a34a', logout: '#64748b', crear_usuario: '#3b82f6',
    editar_usuario: '#f59e0b', eliminar_usuario: '#dc2626', crear_espacio: '#065f46',
    crear_carrera: '#8b5cf6', crear_asignatura: '#0891b2',
  };

  return (
    <div>
      <h3 style={{ color: '#f1f5f9', margin: '0 0 20px 0' }}>Bitácora de Auditoría</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #1e293b' }}>
            {['Fecha', 'Evento', 'Detalle', 'Usuario', 'IP'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '12px 8px', color: '#64748b', fontSize: 13, fontWeight: 500 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bitacora.map(b => (
            <tr key={b.id} style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={{ padding: '12px 8px', color: '#94a3b8', fontSize: 13 }}>
                {new Date(b.fecha).toLocaleString()}
              </td>
              <td style={{ padding: '12px 8px' }}>
                <span style={{
                  display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                  background: eventoColors[b.evento] || '#475569', color: '#fff',
                  fontSize: 11, fontWeight: 600,
                }}>{b.evento}</span>
              </td>
              <td style={{ padding: '12px 8px', color: '#f1f5f9', fontSize: 13 }}>{b.detalle}</td>
              <td style={{ padding: '12px 8px', color: '#94a3b8', fontSize: 13 }}>{b.email || 'Sistema'}</td>
              <td style={{ padding: '12px 8px', color: '#64748b', fontSize: 13 }}>{b.ip || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EDIT MODALS
// ═══════════════════════════════════════════════════════════════════════════

const modalOverlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 2000,
  background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const modalBox: React.CSSProperties = {
  background: '#1e293b', borderRadius: 16, padding: 24, width: 500,
  border: '1px solid #334155', maxHeight: '80vh', overflow: 'auto',
};

function EditUsuarioModal({ item, token, onClose, onSaved }: {
  item: Usuario; token: string; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    email: item.email, nombre: item.nombre, apellido: item.apellido,
    activo: item.activo, roles: item.roles,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/usuarios/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSaved();
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  const toggleRole = (role: string) => {
    setForm(f => ({
      ...f,
      roles: f.roles.includes(role)
        ? f.roles.filter(r => r !== role)
        : [...f.roles, role],
    }));
  };

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBox} onClick={e => e.stopPropagation()}>
        <h3 style={{ color: '#f1f5f9', margin: '0 0 16px 0' }}>Editar Usuario #{item.id}</h3>
        <form onSubmit={handleSave}>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Email</label>
            <input style={inputStyle} value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Nombre</label>
            <input style={inputStyle} value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Apellido</label>
            <input style={inputStyle} value={form.apellido} onChange={e => setForm({...form, apellido: e.target.value})} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Roles</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['administrador', 'docente', 'estudiante'].map(r => (
                <button key={r} type="button" onClick={() => toggleRole(r)} style={{
                  padding: '6px 12px', borderRadius: 6, border: 'none',
                  background: form.roles.includes(r) ? '#3b82f6' : '#334155',
                  color: '#fff', fontWeight: 500, cursor: 'pointer', fontSize: 12,
                }}>{r}</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f1f5f9', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.activo} onChange={e => setForm({...form, activo: e.target.checked})} />
              Activo
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btnSmall}>Cancelar</button>
            <button type="submit" disabled={saving} style={btnPrimary}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditEspacioModal({ item, token, carreras, onClose, onSaved }: {
  item: Espacio; token: string; carreras: Carrera[]; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    nombre: item.nombre, tipo: item.tipo, capacidad_max: item.capacidad_max, activo: item.activo,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/espacios/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSaved();
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBox} onClick={e => e.stopPropagation()}>
        <h3 style={{ color: '#f1f5f9', margin: '0 0 16px 0' }}>Editar Espacio #{item.id}</h3>
        <form onSubmit={handleSave}>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Nombre</label>
            <input style={inputStyle} value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Tipo</label>
            <select style={inputStyle} value={form.tipo} onChange={e => setForm({...form, tipo: e.target.value as any})}>
              <option value="campus">Campus</option>
              <option value="aula">Aula</option>
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Capacidad</label>
            <input style={inputStyle} type="number" value={form.capacidad_max} onChange={e => setForm({...form, capacidad_max: Number(e.target.value)})} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f1f5f9', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.activo} onChange={e => setForm({...form, activo: e.target.checked})} />
              Activo
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btnSmall}>Cancelar</button>
            <button type="submit" disabled={saving} style={btnPrimary}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditCarreraModal({ item, token, onClose, onSaved }: {
  item: Carrera; token: string; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    sigla: item.sigla, nombre: item.nombre, titulo_academico: item.titulo_academico,
    sistema_ensenanza: item.sistema_ensenanza, modelo_estudio: item.modelo_estudio, activa: item.activa,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/carreras/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSaved();
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBox} onClick={e => e.stopPropagation()}>
        <h3 style={{ color: '#f1f5f9', margin: '0 0 16px 0' }}>Editar Carrera #{item.id}</h3>
        <form onSubmit={handleSave}>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Sigla</label>
            <input style={inputStyle} value={form.sigla} onChange={e => setForm({...form, sigla: e.target.value})} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Nombre</label>
            <input style={inputStyle} value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Título Académico</label>
            <input style={inputStyle} value={form.titulo_academico} onChange={e => setForm({...form, titulo_academico: e.target.value})} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Sistema Enseñanza</label>
            <select style={inputStyle} value={form.sistema_ensenanza} onChange={e => setForm({...form, sistema_ensenanza: e.target.value})}>
              <option value="MODULAR">Modular</option>
              <option value="SEMESTRAL">Semestral</option>
              <option value="ANUAL">Anual</option>
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f1f5f9', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.activa} onChange={e => setForm({...form, activa: e.target.checked})} />
              Activa
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btnSmall}>Cancelar</button>
            <button type="submit" disabled={saving} style={btnPrimary}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditAsignaturaModal({ item, token, carreras, docentes, onClose, onSaved }: {
  item: Asignatura; token: string; carreras: Carrera[]; docentes: Docente[];
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    codigo: item.codigo, nombre: item.nombre, carrera_id: item.carrera_id,
    docente_id: item.docente_id, gestion: item.gestion, activa: item.activa,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/asignaturas/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSaved();
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBox} onClick={e => e.stopPropagation()}>
        <h3 style={{ color: '#f1f5f9', margin: '0 0 16px 0' }}>Editar Asignatura #{item.id}</h3>
        <form onSubmit={handleSave}>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Código</label>
            <input style={inputStyle} value={form.codigo} onChange={e => setForm({...form, codigo: e.target.value})} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Nombre</label>
            <input style={inputStyle} value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Carrera</label>
            <select style={inputStyle} value={form.carrera_id} onChange={e => setForm({...form, carrera_id: Number(e.target.value)})}>
              {carreras.filter(c => c.activa).map(c => (
                <option key={c.id} value={c.id}>{c.sigla} - {c.nombre}</option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Docente</label>
            <select style={inputStyle} value={form.docente_id} onChange={e => setForm({...form, docente_id: Number(e.target.value)})}>
              {docentes.map(d => (
                <option key={d.id} value={d.id}>{d.apellido}, {d.nombre}</option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Gestión</label>
            <input style={inputStyle} value={form.gestion} onChange={e => setForm({...form, gestion: e.target.value})} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f1f5f9', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.activa} onChange={e => setForm({...form, activa: e.target.checked})} />
              Activa
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btnSmall}>Cancelar</button>
            <button type="submit" disabled={saving} style={btnPrimary}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit` in the root directory
Expected: No errors

- [ ] **Step 3: Commit frontend**

```bash
git add src/components/AdminPanel.tsx
git commit -m "feat(admin): rewrite AdminPanel with real API CRUD integration"
```

---

## Task 5: Verify & Test

- [ ] **Step 1: Test backend endpoints with curl**

Start the backend server and test:

```bash
# Login as admin to get token
curl -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@upds.edu.bo","password":"123456"}'

# Use the token from the response to test:
curl -H "Authorization: Bearer <TOKEN>" http://localhost:3001/api/admin/usuarios
curl -H "Authorization: Bearer <TOKEN>" http://localhost:3001/api/admin/espacios
curl -H "Authorization: Bearer <TOKEN>" http://localhost:3001/api/admin/carreras
curl -H "Authorization: Bearer <TOKEN>" http://localhost:3001/api/admin/asignaturas
curl -H "Authorization: Bearer <TOKEN>" http://localhost:3001/api/admin/docentes
curl -H "Authorization: Bearer <TOKEN>" http://localhost:3001/api/admin/bitacora
```

- [ ] **Step 2: Test frontend in browser**

1. Login as `admin@upds.edu.bo` / `123456`
2. Click "Panel Admin"
3. Verify all 5 tabs load with real data
4. Create a test user → verify it appears in list
5. Edit a user → verify changes save
6. Delete the test user → verify confirmation and removal
7. Repeat for espacios, carreras, asignaturas

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(admin): complete admin CRUD system with frontend integration"
```
