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

// ----------------------------------------------------------------------------
// 1. Registro de Usuarios (RF-06, RNF-05)
// ----------------------------------------------------------------------------
app.post('/api/auth/register', async (req, res) => {
  const { email, password, nombre, apellido, rol, acepta_terminos } = req.body;

  if (!email || !password || !nombre || !apellido) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const userRol = rol || 'estudiante';

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
    if (roles.includes('admin') || roles.includes('docente')) {
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
         LEFT JOIN sesiones_clase sc ON sc.espacio_id = e.id AND sc.estado IN ('en_curso', 'programada')
         WHERE e.activo = TRUE AND (e.tipo = 'campus' OR pd.usuario_id = $1)`,
        [userId]
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
         LEFT JOIN sesiones_clase sc ON sc.espacio_id = e.id AND sc.estado IN ('en_curso', 'programada')
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
    const result = await pool.query(
      `UPDATE datos_personales SET
         documento_identidad = $1,
         fecha_nacimiento    = $2,
         nacionalidad        = $3,
         genero              = $4,
         domicilio           = $5,
         tipo_sangre         = $6,
         estado_civil        = $7,
         actualizado_en      = NOW()
       WHERE usuario_id = $8
       RETURNING *`,
      [
        documento_identidad ?? null,
        fecha_nacimiento ?? null,
        nacionalidad ?? null,
        genero ?? null,
        domicilio ?? null,
        tipo_sangre ?? null,
        estado_civil ?? null,
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
      return res.status(409).json({ error: 'El documento de identidad ya esta registrado' });
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
    const { espacio_id, estado } = req.query;
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
    if (sesionRes.rows[0].docente_id !== userId) {
      return res.status(403).json({ error: 'Acceso denegado: no eres el docente de esta sesion' });
    }

    const sesion = sesionRes.rows[0];

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
