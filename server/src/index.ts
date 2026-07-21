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

// ----------------------------------------------------------------------------
// MIDDLEWARE: JWT
// ----------------------------------------------------------------------------
const authenticateJWT = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
  } else {
    res.sendStatus(401);
  }
};

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
        [fallos >= 5 ? 0 : fallos, bloqueo, user.id]
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
// 5. Listar Espacios (RF-02)
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

    // Obtener roles del usuario registrado
    const rolesRes = await pool.query(
      `SELECT r.nombre FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id WHERE ur.usuario_id = $1`,
      [userId]
    );
    const roles = rolesRes.rows.map((r: any) => r.nombre);

    if (roles.includes('admin') || roles.includes('docente')) {
      const result = await pool.query(
        `SELECT e.id, e.nombre, e.tipo, e.escena_url, e.capacidad_max,
                a.nombre AS asignatura
         FROM espacios e
         LEFT JOIN asignaturas a ON a.id = e.asignatura_id
         LEFT JOIN perfiles_docente pd ON pd.usuario_id = a.docente_id
         WHERE e.activo = TRUE AND (e.tipo = 'campus' OR pd.usuario_id = $1)`,
        [userId]
      );
      res.json(result.rows);
    } else {
      const result = await pool.query(
        `SELECT DISTINCT e.id, e.nombre, e.tipo, e.escena_url, e.capacidad_max,
                a.nombre AS asignatura
         FROM espacios e
         LEFT JOIN asignaturas a ON a.id = e.asignatura_id
         LEFT JOIN inscripciones i ON i.asignatura_id = a.id AND i.usuario_id = $1
         WHERE e.activo = TRUE
           AND (e.tipo = 'campus' OR i.usuario_id IS NOT NULL)`,
        [userId]
      );
      res.json(result.rows);
    }
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
// 8. Reporte de Asistencia (RF-08) - Exclusivo Docente
// ----------------------------------------------------------------------------
app.get('/api/asistencias/reporte/:sesionId', authenticateJWT, async (req: any, res) => {
  const { userId } = req.user;
  const { sesionId } = req.params;

  try {
    // Verificar que sea docente de esta sesion
    const sesionRes = await pool.query(
      'SELECT docente_id FROM sesiones_clase WHERE id = $1',
      [sesionId]
    );
    if (sesionRes.rows.length === 0) {
      return res.status(404).json({ error: 'Sesión no encontrada' });
    }
    if (sesionRes.rows[0].docente_id !== userId) {
      return res.status(403).json({ error: 'Acceso denegado: no eres el docente de esta sesión' });
    }

    const result = await pool.query(
      `SELECT a.id, a.hora_ingreso, a.hora_salida, a.estado,
              pe.registro_upds, u.nombre, u.apellido
       FROM asistencias a
       JOIN usuarios u ON u.id = a.usuario_id
       LEFT JOIN perfiles_estudiante pe ON pe.usuario_id = u.id
       WHERE a.sesion_id = $1
       ORDER BY u.apellido ASC, u.nombre ASC`,
      [sesionId]
    );

    await bitacora(userId, 'consulta_reporte', `sesion=${sesionId}`, req.ip);

    res.json(result.rows);
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
