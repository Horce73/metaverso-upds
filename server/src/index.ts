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
import { registrarAsistencia } from './helpers.js';

dotenv.config();

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET no está definido en el entorno');
}

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;

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

// ----------------------------------------------------------------------------
// 1. Registro de Usuarios (RF-06, RNF-05)
// ----------------------------------------------------------------------------
app.post('/api/auth/register', async (req, res) => {
  const { email, password, nombre, apellido, rol, acepta_terminos } = req.body;

  if (!email || !password || !nombre || !apellido) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  const ROLES_AUTORREGISTRABLES = ['estudiante', 'docente'];
  const userRol = rol || 'estudiante';
  if (!ROLES_AUTORREGISTRABLES.includes(userRol)) {
    return res.status(400).json({ error: `Rol inválido para autorregistro. Valores permitidos: ${ROLES_AUTORREGISTRABLES.join(', ')}` });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userRes = await client.query(
        `INSERT INTO usuarios (email, password_hash, nombre, apellido)
         VALUES ($1, $2, $3, $4) RETURNING id, email, nombre, apellido`,
        [email, passwordHash, nombre, apellido]
      );
      const newUser = userRes.rows[0];

      // RBAC: asignar rol
      await client.query(
        `INSERT INTO usuario_roles (usuario_id, rol_id)
         SELECT $1, id FROM roles WHERE nombre = $2`,
        [newUser.id, userRol]
      );

      // Crear perfil segun rol
      if (userRol === 'estudiante') {
        await client.query('INSERT INTO perfiles_estudiante (usuario_id) VALUES ($1)', [newUser.id]);
      } else if (userRol === 'docente') {
        await client.query('INSERT INTO perfiles_docente (usuario_id) VALUES ($1)', [newUser.id]);
      }

      await client.query('INSERT INTO datos_personales (usuario_id) VALUES ($1)', [newUser.id]);

      // Crear avatar por defecto (RF-01)
      const apariencia = JSON.stringify({ color: '#3b82f6', genero: 'n' });
      await client.query(
        'INSERT INTO avatares (usuario_id, nombre_visible, apariencia) VALUES ($1, $2, $3)',
        [newUser.id, `${nombre} ${apellido.charAt(0)}.`, apariencia]
      );

      // Consentimiento (RNF-03)
      if (acepta_terminos) {
        await client.query(
          `INSERT INTO consentimientos (usuario_id, tipo, otorgado, version_politica)
           VALUES ($1, 'tratamiento_datos', TRUE, 'v1.0')`,
          [newUser.id]
        );
      }

      // Inscripcion automatica en asignaturas activas (piloto ISW)
      if (userRol === 'estudiante') {
        await client.query(
          `INSERT INTO inscripciones (usuario_id, asignatura_id)
           SELECT $1, id FROM asignaturas WHERE activa = TRUE`,
          [newUser.id]
        );
      }

      await client.query('COMMIT');

      const rolRes = await client.query(
        `SELECT r.nombre FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id WHERE ur.usuario_id = $1`,
        [newUser.id]
      );
      const roles = rolRes.rows.map((r: any) => r.nombre);

      await bitacora(newUser.id, 'registro', email, req.ip);

      res.status(201).json({
        message: 'Usuario registrado exitosamente',
        user: {
          id: newUser.id,
          email: newUser.email,
          nombre: newUser.nombre,
          apellido: newUser.apellido,
          rol: userRol,
          roles
        }
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Error al registrar:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ese correo ya está registrado' });
    }
    res.status(500).json({ error: 'Error del servidor al registrar usuario' });
  }
});

// ----------------------------------------------------------------------------
// 2. Login (RF-06, RNF-05) con RBAC + bloqueo
// ----------------------------------------------------------------------------
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos' });
  }

  try {
    const userRes = await pool.query(
      `SELECT id, email, password_hash, nombre, apellido, activo,
              intentos_fallidos, bloqueado_hasta
       FROM usuarios WHERE email = $1 AND activo = TRUE`,
      [email]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = userRes.rows[0];

    // Verificar bloqueo temporal
    if (user.bloqueado_hasta && new Date(user.bloqueado_hasta) > new Date()) {
      await bitacora(user.id, 'login_bloqueado', '', req.ip);
      return res.status(423).json({ error: 'Cuenta bloqueada temporalmente por intentos fallidos. Intenta en unos minutos.' });
    }

    const passwordValida = await bcrypt.compare(password, user.password_hash);
    if (!passwordValida) {
      const fallos = (user.intentos_fallidos || 0) + 1;
      const bloqueo = fallos >= 5 ? new Date(Date.now() + 15 * 60000).toISOString() : null;
      await pool.query(
        'UPDATE usuarios SET intentos_fallidos = $1, bloqueado_hasta = $2 WHERE id = $3',
        [fallos, bloqueo, user.id]
      );
      await bitacora(user.id, 'login_fallido', '', req.ip);
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Cargar roles
    const rolesRes = await pool.query(
      `SELECT r.nombre FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id WHERE ur.usuario_id = $1`,
      [user.id]
    );
    const roles = rolesRes.rows.map((r: any) => r.nombre);
    if (roles.length === 0) {
      return res.status(403).json({ error: 'El usuario no tiene roles asignados' });
    }

    // Resetear intentos y actualizar ultimo_acceso
    await pool.query(
      'UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = NOW() WHERE id = $1',
      [user.id]
    );

    // Cargar avatar
    const avatarRes = await pool.query('SELECT * FROM avatares WHERE usuario_id = $1', [user.id]);
    const avatar = avatarRes.rows.length > 0 ? avatarRes.rows[0] : null;

    // Generar JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email, rol: roles[0], nombre: user.nombre },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    await bitacora(user.id, 'login_ok', '', req.ip);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        apellido: user.apellido,
        rol: roles[0],
        roles
      },
      avatar: avatar ? {
        id: avatar.id,
        nombre_visible: avatar.nombre_visible,
        modelo_url: avatar.modelo_url,
        apariencia: avatar.apariencia
      } : null
    });
  } catch (err) {
    console.error('Error al iniciar sesión:', err);
    res.status(500).json({ error: 'Error del servidor al iniciar sesión' });
  }
});

// ----------------------------------------------------------------------------
// 2.5 Login Invitado (Guest) - Acceso solo a campus
// ----------------------------------------------------------------------------
app.post('/api/auth/guest', async (req, res) => {
  try {
    // Generar un identificador único para el invitado (temporal)
    const guestId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const guestName = `Invitado ${Math.floor(Math.random() * 10000)}`;

    // Generar JWT con rol de invitado (sin usuario en BD)
    const token = jwt.sign(
      { userId: guestId, email: 'guest@metaverso', rol: 'invitado', nombre: guestName, isGuest: true },
      JWT_SECRET,
      { expiresIn: '4h' }
    );

    // Avatar por defecto para invitados
    const defaultAvatar = {
      id: `avatar_${guestId}`,
      nombre_visible: guestName,
      modelo_url: null,
      apariencia: { color: '#6b7280', genero: 'n' }
    };

    await bitacora(null, 'guest_login', guestName, req.ip);

    res.json({
      token,
      user: {
        id: guestId,
        email: 'guest@metaverso',
        nombre: guestName,
        apellido: '',
        rol: 'invitado',
        roles: ['invitado'],
        isGuest: true
      },
      avatar: defaultAvatar
    });
  } catch (err) {
    console.error('Error en guest login:', err);
    res.status(500).json({ error: 'Error al ingresar como invitado' });
  }
});

// ----------------------------------------------------------------------------
// 3. Usuario actual
// ----------------------------------------------------------------------------
app.get('/api/auth/yo', authenticateJWT, async (req: any, res) => {
  try {
    const { userId } = req.user;
    const userRes = await pool.query(
      'SELECT id, email, nombre, apellido FROM usuarios WHERE id = $1',
      [userId]
    );
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    const rolesRes = await pool.query(
      `SELECT r.nombre FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id WHERE ur.usuario_id = $1`,
      [userId]
    );
    const roles = rolesRes.rows.map((r: any) => r.nombre);

    const avatarRes = await pool.query('SELECT * FROM avatares WHERE usuario_id = $1', [userId]);
    const avatar = avatarRes.rows.length > 0 ? avatarRes.rows[0] : null;

    res.json({
      user: { ...userRes.rows[0], rol: roles[0], roles },
      avatar: avatar ? {
        id: avatar.id,
        nombre_visible: avatar.nombre_visible,
        modelo_url: avatar.modelo_url,
        apariencia: avatar.apariencia
      } : null
    });
  } catch (err) {
    console.error('Error al obtener usuario:', err);
    res.status(500).json({ error: 'Error de servidor' });
  }
});

// ----------------------------------------------------------------------------
// 4. Logout
// ----------------------------------------------------------------------------
app.post('/api/auth/logout', authenticateJWT, async (req: any, res) => {
  await bitacora(req.user.userId, 'logout', '', req.ip);
  res.json({ ok: true });
});

// ----------------------------------------------------------------------------
// 5. Listar Espacios (RF-02) con sesion activa
// ----------------------------------------------------------------------------
app.get('/api/espacios', authenticateJWT, async (req: any, res) => {
  try {
    const { userId, rol, isGuest } = req.user;

    // Invitados solo ven el campus
    if (isGuest || rol === 'invitado') {
      const result = await pool.query(
        `SELECT e.id, e.nombre, e.tipo, e.escena_url, e.capacidad_max,
                a.nombre AS asignatura
         FROM espacios e
         LEFT JOIN asignaturas a ON a.id = e.asignatura_id
         WHERE e.activo = TRUE AND e.tipo = 'campus'`
      );
      return res.json(result.rows);
    }

    const rolesRes = await pool.query(
      `SELECT r.nombre FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id WHERE ur.usuario_id = $1`,
      [userId]
    );
    const roles = rolesRes.rows.map((r: any) => r.nombre);

    let espaciosRes;
    const esAdmin = roles.includes('administrador');
    if (esAdmin || roles.includes('docente')) {
      // El admin ve todas las aulas del sistema; el docente solo las suyas.
      espaciosRes = await pool.query(
        `SELECT e.id, e.nombre, e.tipo, e.escena_url, e.capacidad_max,
                a.nombre AS asignatura, a.codigo AS asignatura_codigo,
                sc.id AS sesion_id, sc.tema AS sesion_tema,
                sc.inicio_real AS sesion_inicio, sc.estado AS sesion_estado,
                u.nombre AS docente_nombre, u.apellido AS docente_apellido
         FROM espacios e
         LEFT JOIN asignaturas a ON a.id = e.asignatura_id
         LEFT JOIN perfiles_docente pd ON pd.usuario_id = a.docente_id
         LEFT JOIN usuarios u ON u.id = pd.usuario_id
         LEFT JOIN LATERAL (
           SELECT sc.id, sc.tema, sc.inicio_real, sc.estado
           FROM sesiones_clase sc
           WHERE sc.espacio_id = e.id AND sc.estado IN ('en_curso', 'programada')
           ORDER BY (sc.estado = 'en_curso') DESC,
                    COALESCE(sc.inicio_real, sc.inicio_programado) DESC
           LIMIT 1
         ) sc ON TRUE
         WHERE e.activo = TRUE AND (e.tipo = 'campus' OR $2 = TRUE OR pd.usuario_id = $1)`,
        [userId, esAdmin]
      );
    } else {
      espaciosRes = await pool.query(
        `SELECT DISTINCT e.id, e.nombre, e.tipo, e.escena_url, e.capacidad_max,
                a.nombre AS asignatura, a.codigo AS asignatura_codigo,
                sc.id AS sesion_id, sc.tema AS sesion_tema,
                sc.inicio_real AS sesion_inicio, sc.estado AS sesion_estado,
                u.nombre AS docente_nombre, u.apellido AS docente_apellido
         FROM espacios e
         LEFT JOIN asignaturas a ON a.id = e.asignatura_id
         LEFT JOIN inscripciones i ON i.asignatura_id = a.id AND i.usuario_id = $1
         LEFT JOIN LATERAL (
           SELECT sc.id, sc.tema, sc.inicio_real, sc.estado
           FROM sesiones_clase sc
           WHERE sc.espacio_id = e.id AND sc.estado IN ('en_curso', 'programada')
           ORDER BY (sc.estado = 'en_curso') DESC,
                    COALESCE(sc.inicio_real, sc.inicio_programado) DESC
           LIMIT 1
         ) sc ON TRUE
         LEFT JOIN perfiles_docente pd ON pd.usuario_id = a.docente_id
         LEFT JOIN usuarios u ON u.id = pd.usuario_id
         WHERE e.activo = TRUE
           AND (e.tipo = 'campus' OR i.usuario_id IS NOT NULL)`,
        [userId]
      );
    }

    const espacios = espaciosRes.rows.map((e: any) => ({
      id: e.id,
      nombre: e.nombre,
      tipo: e.tipo,
      escena_url: e.escena_url,
      capacidad_max: e.capacidad_max,
      asignatura: e.asignatura,
      asignatura_codigo: e.asignatura_codigo,
      sesion_activa: e.sesion_id ? {
        id: e.sesion_id,
        tema: e.sesion_tema,
        inicio: e.sesion_inicio,
        estado: e.sesion_estado,
        docente: e.docente_nombre ? `${e.docente_nombre} ${e.docente_apellido}` : null
      } : null
    }));

    res.json(espacios);
  } catch (err) {
    console.error('Error al listar espacios:', err);
    res.status(500).json({ error: 'Error de base de datos' });
  }
});

// ----------------------------------------------------------------------------
// 6. Personalizar Avatar (RF-01)
// ----------------------------------------------------------------------------
app.post('/api/avatar/custom', authenticateJWT, async (req: any, res) => {
  const { userId } = req.user;
  const { nombre_visible, modelo_url, apariencia } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO avatares (usuario_id, nombre_visible, modelo_url, apariencia)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (usuario_id)
       DO UPDATE SET nombre_visible = $2, modelo_url = $3, apariencia = $4, actualizado_en = NOW()
       RETURNING *`,
      [userId, nombre_visible, modelo_url || null, JSON.stringify(apariencia || {})]
    );
    res.json({ message: 'Avatar actualizado', avatar: result.rows[0] });
  } catch (err) {
    console.error('Error al personalizar avatar:', err);
    res.status(500).json({ error: 'Error de servidor' });
  }
});

// ----------------------------------------------------------------------------
// 7. Programar Clase (RF-08) - Exclusivo Docente
// ----------------------------------------------------------------------------
app.post('/api/sesiones', authenticateJWT, async (req: any, res) => {
  const { userId } = req.user;
  const { espacio_id, tema, inicio_programado, fin_programado, tolerancia_min } = req.body;

  // Verificar rol docente
  const rolRes = await pool.query(
    `SELECT r.nombre FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id WHERE ur.usuario_id = $1`,
    [userId]
  );
  const roles = rolRes.rows.map((r: any) => r.nombre);
  if (!roles.includes('docente')) {
    return res.status(403).json({ error: 'Acceso denegado: requiere rol docente' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO sesiones_clase (espacio_id, docente_id, tema, inicio_programado, fin_programado, inicio_real, estado, tolerancia_min)
       VALUES ($1, $2, $3, $4, $5, NOW(), 'en_curso', $6)
       RETURNING *`,
      [espacio_id, userId, tema, inicio_programado || new Date().toISOString(), fin_programado || new Date(Date.now() + 90 * 60000).toISOString(), tolerancia_min || 10]
    );

    await bitacora(userId, 'inicio_clase', tema || '', req.ip);

    res.status(201).json({ message: 'Clase programada e iniciada', sesion: result.rows[0] });
  } catch (err) {
    console.error('Error al programar clase:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ----------------------------------------------------------------------------
// 8. Finalizar Clase (RF-08) - Docente dueño o Administrador
// ----------------------------------------------------------------------------
app.put('/api/sesiones/:id/finalizar', authenticateJWT, async (req: any, res) => {
  const { userId } = req.user;
  const { id } = req.params;

  try {
    const sesionRes = await pool.query('SELECT * FROM sesiones_clase WHERE id = $1', [id]);
    if (sesionRes.rows.length === 0) {
      return res.status(404).json({ error: 'Sesion no encontrada' });
    }
    const sesion = sesionRes.rows[0];

    const rolesRes = await pool.query(
      `SELECT r.nombre FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id WHERE ur.usuario_id = $1`,
      [userId]
    );
    const esAdmin = rolesRes.rows.some((r: any) => r.nombre === 'administrador');
    if (!esAdmin && sesion.docente_id !== userId) {
      return res.status(403).json({ error: 'Acceso denegado: no eres el docente de esta sesion' });
    }
    if (sesion.estado !== 'en_curso') {
      return res.status(400).json({ error: 'La clase no está en curso' });
    }

    const result = await pool.query(
      `UPDATE sesiones_clase SET estado = 'finalizada', fin_real = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    await pool.query(
      `UPDATE asistencias SET hora_salida = NOW() WHERE sesion_id = $1 AND hora_salida IS NULL`,
      [id]
    );

    await bitacora(userId, 'fin_clase', sesion.tema || '', req.ip);
    res.json({ message: 'Clase finalizada', sesion: result.rows[0] });
  } catch (err) {
    console.error('Error al finalizar clase:', err);
    res.status(500).json({ error: 'Error de servidor' });
  }
});

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

// ── Admin: Dashboard (stats + alertas calculadas al vuelo) ──────────────────
app.get('/api/admin/dashboard', authenticateJWT, requiereAdmin, async (req, res) => {
  try {
    const { rows: [usuariosRow] } = await pool.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE activo)::int AS activos,
             COUNT(*) FILTER (WHERE creado_en >= NOW() - INTERVAL '7 days')::int AS nuevos_7d
      FROM usuarios
    `);

    const { rows: rolRows } = await pool.query(`
      SELECT r.nombre, COUNT(*)::int AS cantidad
      FROM usuario_roles ur
      JOIN roles r ON r.id = ur.rol_id
      JOIN usuarios u ON u.id = ur.usuario_id
      WHERE u.activo = TRUE
      GROUP BY r.nombre
    `);
    const por_rol: Record<string, number> = { administrador: 0, docente: 0, estudiante: 0 };
    for (const r of rolRows) {
      if (r.nombre in por_rol) por_rol[r.nombre] = r.cantidad;
    }

    const { rows: espacioRows } = await pool.query(`
      SELECT e.id, e.nombre, e.tipo, e.capacidad_max,
             COALESCE(oc.ocupacion, 0)::int AS ocupacion_actual
      FROM espacios e
      LEFT JOIN (
        SELECT sc.espacio_id, COUNT(*)::int AS ocupacion
        FROM sesiones_clase sc
        JOIN asistencias a ON a.sesion_id = sc.id AND a.hora_salida IS NULL
        WHERE sc.estado = 'en_curso'
        GROUP BY sc.espacio_id
      ) oc ON oc.espacio_id = e.id
      WHERE e.activo = TRUE
      ORDER BY e.id
    `);
    const espacios = {
      total_activos: espacioRows.length,
      campus: espacioRows.filter((e: any) => e.tipo === 'campus').length,
      aulas: espacioRows.filter((e: any) => e.tipo === 'aula').length,
      capacidad_total: espacioRows.reduce((sum: number, e: any) => sum + e.capacidad_max, 0),
      ocupacion_actual: espacioRows.reduce((sum: number, e: any) => sum + e.ocupacion_actual, 0),
      detalle: espacioRows.map((e: any) => ({
        id: e.id, nombre: e.nombre, tipo: e.tipo,
        capacidad_max: e.capacidad_max, ocupacion_actual: e.ocupacion_actual
      }))
    };

    const { rows: [carrerasRow] } = await pool.query(`SELECT COUNT(*) FILTER (WHERE activa)::int AS n FROM carreras`);
    const { rows: [asignaturasRow] } = await pool.query(`SELECT COUNT(*) FILTER (WHERE activa)::int AS n FROM asignaturas`);
    const { rows: [inscripcionesRow] } = await pool.query(`SELECT COUNT(*)::int AS n FROM inscripciones`);
    const { rows: [asistenciasRow] } = await pool.query(`
      SELECT COUNT(*) FILTER (WHERE estado IN ('presente','tarde'))::int AS buenas,
             COUNT(*)::int AS total
      FROM asistencias
    `);
    const asistencia_promedio_pct = asistenciasRow.total > 0
      ? Math.round((asistenciasRow.buenas / asistenciasRow.total) * 100)
      : 0;

    const academico = {
      carreras_activas: carrerasRow.n,
      asignaturas_activas: asignaturasRow.n,
      inscripciones_total: inscripcionesRow.n,
      asistencia_promedio_pct
    };

    const { rows: diaRows } = await pool.query(`
      SELECT TO_CHAR(fecha, 'YYYY-MM-DD') AS dia, COUNT(*)::int AS eventos
      FROM bitacora
      WHERE fecha >= NOW() - INTERVAL '7 days'
      GROUP BY dia
      ORDER BY dia
    `);
    const porDiaMap = new Map<string, number>(diaRows.map((r: any) => [r.dia, r.eventos]));
    const por_dia_7d: { fecha: string; eventos: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      por_dia_7d.push({ fecha: key, eventos: porDiaMap.get(key) || 0 });
    }

    const { rows: [eventos24hRow] } = await pool.query(`
      SELECT COUNT(*)::int AS n FROM bitacora WHERE fecha >= NOW() - INTERVAL '24 hours'
    `);

    const { rows: ultimosRows } = await pool.query(`
      SELECT b.id, b.usuario_id, b.evento, b.detalle, b.ip, b.fecha, u.email, u.nombre, u.apellido
      FROM bitacora b
      LEFT JOIN usuarios u ON u.id = b.usuario_id
      ORDER BY b.fecha DESC
      LIMIT 10
    `);

    const actividad = {
      por_dia_7d,
      eventos_24h: eventos24hRow.n,
      ultimos: ultimosRows
    };

    // ── Alertas (calculadas al vuelo, sin tabla nueva) ──────────────────────
    const alertas: Array<{ tipo: string; severidad: string; mensaje: string; entidad?: { tipo: string; id: number } }> = [];

    for (const e of espacioRows) {
      const ratio = e.capacidad_max > 0 ? e.ocupacion_actual / e.capacidad_max : 0;
      if (ratio >= 1) {
        alertas.push({
          tipo: 'capacidad', severidad: 'critical',
          mensaje: `"${e.nombre}" está a capacidad máxima (${e.ocupacion_actual}/${e.capacidad_max})`,
          entidad: { tipo: 'espacio', id: e.id }
        });
      } else if (ratio >= 0.9) {
        alertas.push({
          tipo: 'capacidad', severidad: 'warning',
          mensaje: `"${e.nombre}" cerca de su capacidad máxima (${e.ocupacion_actual}/${e.capacidad_max})`,
          entidad: { tipo: 'espacio', id: e.id }
        });
      }
    }

    const { rows: usuariosSinRol } = await pool.query(`
      SELECT u.id, u.nombre, u.apellido
      FROM usuarios u
      LEFT JOIN usuario_roles ur ON ur.usuario_id = u.id
      WHERE u.activo = TRUE AND ur.usuario_id IS NULL
    `);
    for (const u of usuariosSinRol) {
      alertas.push({
        tipo: 'integridad', severidad: 'warning',
        mensaje: `El usuario "${u.nombre} ${u.apellido}" está activo pero no tiene ningún rol asignado`,
        entidad: { tipo: 'usuario', id: u.id }
      });
    }

    const { rows: aulasInactivas } = await pool.query(`
      SELECT e.id, e.nombre
      FROM espacios e
      JOIN asignaturas a ON a.id = e.asignatura_id
      WHERE e.tipo = 'aula' AND e.activo = TRUE AND a.activa = FALSE
    `);
    for (const e of aulasInactivas) {
      alertas.push({
        tipo: 'integridad', severidad: 'warning',
        mensaje: `El aula "${e.nombre}" está activa pero su asignatura fue desactivada`,
        entidad: { tipo: 'espacio', id: e.id }
      });
    }

    const { rows: asignaturasSinEspacio } = await pool.query(`
      SELECT a.id, a.nombre
      FROM asignaturas a
      LEFT JOIN espacios e ON e.asignatura_id = a.id
      WHERE a.activa = TRUE
      GROUP BY a.id, a.nombre
      HAVING COUNT(e.id) = 0
    `);
    for (const a of asignaturasSinEspacio) {
      alertas.push({
        tipo: 'integridad', severidad: 'warning',
        mensaje: `La asignatura "${a.nombre}" está activa pero no tiene ningún aula creada`,
        entidad: { tipo: 'asignatura', id: a.id }
      });
    }

    const { rows: carrerasSinAsignaturas } = await pool.query(`
      SELECT c.id, c.nombre
      FROM carreras c
      LEFT JOIN asignaturas a ON a.carrera_id = c.id AND a.activa = TRUE
      WHERE c.activa = TRUE
      GROUP BY c.id, c.nombre
      HAVING COUNT(a.id) = 0
    `);
    for (const c of carrerasSinAsignaturas) {
      alertas.push({
        tipo: 'integridad', severidad: 'warning',
        mensaje: `La carrera "${c.nombre}" está activa pero no tiene ninguna asignatura activa`,
        entidad: { tipo: 'carrera', id: c.id }
      });
    }

    const { rows: [nuevos24hRow] } = await pool.query(`
      SELECT COUNT(*)::int AS n FROM usuarios WHERE creado_en >= NOW() - INTERVAL '24 hours'
    `);
    if (nuevos24hRow.n > 0) {
      alertas.push({ tipo: 'info', severidad: 'info', mensaje: `${nuevos24hRow.n} usuario(s) nuevo(s) en las últimas 24 horas` });
    }

    const { rows: [clasesHoyRow] } = await pool.query(`
      SELECT COUNT(*)::int AS n FROM sesiones_clase WHERE inicio_real >= CURRENT_DATE
    `);
    if (clasesHoyRow.n > 0) {
      alertas.push({ tipo: 'info', severidad: 'info', mensaje: `${clasesHoyRow.n} sesión(es) de clase iniciada(s) hoy` });
    }

    const orden: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    alertas.sort((a, b) => orden[a.severidad] - orden[b.severidad]);

    res.json({
      stats: {
        usuarios: { total: usuariosRow.total, activos: usuariosRow.activos, por_rol, nuevos_7d: usuariosRow.nuevos_7d },
        espacios,
        academico,
        actividad
      },
      alertas
    });
  } catch (err) {
    console.error('Error al obtener dashboard:', err);
    res.status(500).json({ error: 'Error al obtener el dashboard' });
  }
});

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
app.post('/api/admin/usuarios', authenticateJWT, requiereAdmin, async (req: any, res) => {
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
app.put('/api/admin/usuarios/:id', authenticateJWT, requiereAdmin, async (req: any, res) => {
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
app.put('/api/admin/usuarios/:id/password', authenticateJWT, requiereAdmin, async (req: any, res) => {
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
app.delete('/api/admin/usuarios/:id', authenticateJWT, requiereAdmin, async (req: any, res) => {
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
app.post('/api/admin/espacios', authenticateJWT, requiereAdmin, async (req: any, res) => {
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
app.put('/api/admin/espacios/:id', authenticateJWT, requiereAdmin, async (req: any, res) => {
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
app.delete('/api/admin/espacios/:id', authenticateJWT, requiereAdmin, async (req: any, res) => {
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
app.post('/api/admin/carreras', authenticateJWT, requiereAdmin, async (req: any, res) => {
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
app.put('/api/admin/carreras/:id', authenticateJWT, requiereAdmin, async (req: any, res) => {
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
app.delete('/api/admin/carreras/:id', authenticateJWT, requiereAdmin, async (req: any, res) => {
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
app.post('/api/admin/asignaturas', authenticateJWT, requiereAdmin, async (req: any, res) => {
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
app.put('/api/admin/asignaturas/:id', authenticateJWT, requiereAdmin, async (req: any, res) => {
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
app.delete('/api/admin/asignaturas/:id', authenticateJWT, requiereAdmin, async (req: any, res) => {
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

  // Validaciones del dominio de los campos (según restricciones CHECK en schema.sql)
  const GENEROS_VALIDOS = ['MASCULINO', 'FEMENINO', 'OTRO', 'NO_DECLARA'];
  const TIPOS_SANGRE_VALIDOS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  const ESTADOS_CIVIL_VALIDOS = ['SOLTERO(A)', 'CASADO(A)', 'DIVORCIADO(A)', 'VIUDO(A)', 'UNION LIBRE'];

  if (genero && !GENEROS_VALIDOS.includes(genero.toUpperCase())) {
    return res.status(400).json({ error: `Género inválido. Valores válidos: ${GENEROS_VALIDOS.join(', ')}` });
  }
  if (tipo_sangre && !TIPOS_SANGRE_VALIDOS.includes(tipo_sangre.toUpperCase())) {
    return res.status(400).json({ error: `Tipo de sangre inválido. Valores válidos: ${TIPOS_SANGRE_VALIDOS.join(', ')}` });
  }
  if (estado_civil && !ESTADOS_CIVIL_VALIDOS.includes(estado_civil.toUpperCase())) {
    return res.status(400).json({ error: `Estado civil inválido. Valores válidos: ${ESTADOS_CIVIL_VALIDOS.join(', ')}` });
  }

  try {
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
        documento_identidad !== undefined ? (documento_identidad || null) : null,
        fecha_nacimiento !== undefined ? (fecha_nacimiento || null) : null,
        nacionalidad !== undefined ? (nacionalidad || null) : null,
        genero !== undefined ? (genero.toUpperCase() || null) : null,
        domicilio !== undefined ? (domicilio || null) : null,
        tipo_sangre !== undefined ? (tipo_sangre.toUpperCase() || null) : null,
        estado_civil !== undefined ? (estado_civil.toUpperCase() || null) : null,
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

// ----------------------------------------------------------------------------
// 11. Consentimientos (RNF-03: GDPR/LOPD)
// ----------------------------------------------------------------------------
app.get('/api/usuario/consentimientos', authenticateJWT, async (req: any, res) => {
  try {
    const result = await pool.query(
      `SELECT id, tipo, otorgado, fecha, version_politica
       FROM consentimientos
       WHERE usuario_id = $1
       ORDER BY fecha DESC`,
      [req.user.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener consentimientos:', err);
    res.status(500).json({ error: 'Error de servidor' });
  }
});

app.post('/api/usuario/consentimientos', authenticateJWT, async (req: any, res) => {
  const { tipo, otorgado, version_politica } = req.body;

  if (!tipo || otorgado === undefined || !version_politica) {
    return res.status(400).json({ error: 'Faltan campos: tipo, otorgado, version_politica' });
  }

  const tiposValidos = ['tratamiento_datos', 'uso_voz', 'grabacion_clase'];
  if (!tiposValidos.includes(tipo)) {
    return res.status(400).json({ error: `Tipo invalido. Valores permitidos: ${tiposValidos.join(', ')}` });
  }

  try {
    const result = await pool.query(
      `INSERT INTO consentimientos (usuario_id, tipo, otorgado, version_politica)
       VALUES ($1, $2, $3, $4)
       RETURNING id, tipo, otorgado, fecha, version_politica`,
      [req.user.userId, tipo, otorgado, version_politica]
    );

    await bitacora(req.user.userId, 'consentimiento', `${tipo}=${otorgado}`, req.ip);
    res.status(201).json({ message: 'Consentimiento registrado', consentimiento: result.rows[0] });
  } catch (err) {
    console.error('Error al registrar consentimiento:', err);
    res.status(500).json({ error: 'Error de servidor' });
  }
});

// ----------------------------------------------------------------------------
// 12. Asistencia REST (RF-05) - Solo Estudiantes
// ----------------------------------------------------------------------------
app.post('/api/asistencia', authenticateJWT, async (req: any, res) => {
  const { userId } = req.user;
  const { espacio_id } = req.body;

  if (!espacio_id) {
    return res.status(400).json({ error: 'Falta campo: espacio_id' });
  }

  try {
    const rolesRes = await pool.query(
      `SELECT r.nombre FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id WHERE ur.usuario_id = $1`,
      [userId]
    );
    const roles = rolesRes.rows.map((r: any) => r.nombre);
    if (!roles.includes('estudiante')) {
      return res.status(403).json({ error: 'Solo los estudiantes pueden registrar asistencia' });
    }

    const resultado = await registrarAsistencia(userId, espacio_id);

    if (!resultado) {
      return res.status(404).json({ registrado: false, motivo: 'No hay una clase en curso en este espacio' });
    }

    if (!resultado.registrado) {
      return res.json(resultado);
    }

    await bitacora(userId, 'asistencia', `sesion=${espacio_id} estado=${resultado.estado}`, req.ip);
    res.json(resultado);
  } catch (err) {
    console.error('Error al registrar asistencia:', err);
    res.status(500).json({ error: 'Error de servidor' });
  }
});

// ----------------------------------------------------------------------------
// 13. Sesiones por Espacio
// ----------------------------------------------------------------------------
app.get('/api/sesiones', authenticateJWT, async (req: any, res) => {
  try {
    const { userId } = req.user;
    const { espacio_id, estado } = req.query;

    const rolesRes = await pool.query(
      `SELECT r.nombre FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id WHERE ur.usuario_id = $1`,
      [userId]
    );
    const roles = rolesRes.rows.map((r: any) => r.nombre);
    const esPrivilegiado = roles.includes('administrador') || roles.includes('docente');

    let sql = `
      SELECT sc.id, sc.tema, sc.inicio_programado, sc.fin_programado,
             sc.inicio_real, sc.fin_real, sc.estado, sc.tolerancia_min,
             sc.espacio_id, e.nombre AS espacio_nombre,
             u.nombre AS docente_nombre, u.apellido AS docente_apellido
      FROM sesiones_clase sc
      JOIN espacios e ON e.id = sc.espacio_id
      JOIN perfiles_docente pd ON pd.usuario_id = sc.docente_id
      JOIN usuarios u ON u.id = pd.usuario_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let idx = 1;

    // Los estudiantes solo ven sesiones de asignaturas en las que están inscritos
    if (!esPrivilegiado) {
      sql += ` AND EXISTS (
        SELECT 1 FROM inscripciones i
        WHERE i.asignatura_id = e.asignatura_id AND i.usuario_id = $${idx++}
      )`;
      params.push(userId);
    }

    if (espacio_id) {
      sql += ` AND sc.espacio_id = $${idx++}`;
      params.push(espacio_id);
    }
    if (estado) {
      sql += ` AND sc.estado = $${idx++}`;
      params.push(estado);
    }

    sql += ` ORDER BY sc.inicio_programado DESC LIMIT $${idx}`;
    params.push(50);

    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener sesiones:', err);
    res.status(500).json({ error: 'Error de servidor' });
  }
});

// ----------------------------------------------------------------------------
// 14. Reporte de Asistencia Mejorado (RF-08) - Exclusivo Docente
// ----------------------------------------------------------------------------
app.get('/api/asistencias/reporte/:sesionId', authenticateJWT, async (req: any, res) => {
  const { userId } = req.user;
  const { sesionId } = req.params;

  try {
    const sesionRes = await pool.query(
      `SELECT sc.*, e.nombre AS espacio_nombre, e.tipo AS espacio_tipo
       FROM sesiones_clase sc
       JOIN espacios e ON e.id = sc.espacio_id
       WHERE sc.id = $1`,
      [sesionId]
    );
    if (sesionRes.rows.length === 0) {
      return res.status(404).json({ error: 'Sesion no encontrada' });
    }
    const sesion = sesionRes.rows[0];

    const rolesRes = await pool.query(
      `SELECT r.nombre FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id WHERE ur.usuario_id = $1`,
      [userId]
    );
    const esAdmin = rolesRes.rows.some((r: any) => r.nombre === 'administrador');
    if (!esAdmin && sesion.docente_id !== userId) {
      return res.status(403).json({ error: 'Acceso denegado: no eres el docente de esta sesion' });
    }

    const asistenciasRes = await pool.query(
      `SELECT a.id, a.hora_ingreso, a.hora_salida, a.estado,
              pe.registro_upds, u.nombre, u.apellido, u.email
       FROM asistencias a
       JOIN usuarios u ON u.id = a.usuario_id
       LEFT JOIN perfiles_estudiante pe ON pe.usuario_id = u.id
       WHERE a.sesion_id = $1
       ORDER BY u.apellido ASC, u.nombre ASC`,
      [sesionId]
    );

    // Calcular resumen — buscar asignatura del espacio
    const asistencias = asistenciasRes.rows;
    const asignaturaRes = await pool.query(
      'SELECT asignatura_id FROM espacios WHERE id = $1',
      [sesion.espacio_id]
    );
    const asignaturaId = asignaturaRes.rows[0]?.asignatura_id;
    const totalEstudiantesRes = await pool.query(
      'SELECT COUNT(*) AS total FROM inscripciones WHERE asignatura_id = $1',
      [asignaturaId]
    );
    const totalInscritos = parseInt(totalEstudiantesRes.rows[0]?.total || '0');
    const presentes = asistencias.filter((a: any) => a.estado === 'presente').length;
    const tardes = asistencias.filter((a: any) => a.estado === 'tarde').length;
    const ausentes = totalInscritos - asistencias.length;

    await bitacora(userId, 'consulta_reporte', `sesion=${sesionId}`, req.ip);

    res.json({
      sesion: {
        id: sesion.id,
        tema: sesion.tema,
        espacio: sesion.espacio_nombre,
        tipo_espacio: sesion.espacio_tipo,
        inicio: sesion.inicio_real || sesion.inicio_programado,
        fin: sesion.fin_real || sesion.fin_programado,
        estado: sesion.estado
      },
      resumen: {
        total_inscritos: totalInscritos,
        presentes,
        tardes,
        ausentes,
        total_registrados: asistencias.length
      },
      asistencias
    });
  } catch (err) {
    console.error('Error al obtener reporte de asistencia:', err);
    res.status(500).json({ error: 'Error de servidor' });
  }
});

// ----------------------------------------------------------------------------
// Iniciar Servidor
// ----------------------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`🚀 Metaverso UPDS Backend corriendo en http://localhost:${PORT}`);
});
