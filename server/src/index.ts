import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { ExpressPeerServer } from 'peer';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { pool, mockDb, isUsingMock } from './db.js';
import { setupSockets } from './socketHandler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'upds-metaverso-super-secret-key-2026';

app.use(cors());
app.use(express.json());

// Servidor HTTP + Socket.io
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Configurar Sockets
setupSockets(io);

// Servidor PeerJS integrado para VoIP (RF-03 espacial)
const peerServer = ExpressPeerServer(server, {
  path: '/peerjs',
  allow_discovery: true
});
app.use('/peer', peerServer);

// ----------------------------------------------------------------------------
// API RUTAS
// ----------------------------------------------------------------------------

// 1. Registro de Usuarios (RF-06, RNF-05)
app.post('/api/auth/register', async (req, res) => {
  const { registro_upds, email, password, nombre, apellido, rol, acepta_terminos } = req.body;

  if (!email || !password || !nombre || !apellido || !rol) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    let newUser: any = null;

    if (isUsingMock()) {
      // Verificar si ya existe el correo
      const existeEmail = mockDb.usuarios.some(u => u.email === email);
      const existeRegistro = registro_upds && mockDb.usuarios.some(u => u.registro_upds === registro_upds);

      if (existeEmail || existeRegistro) {
        return res.status(400).json({ error: 'El email o registro UPDS ya está en uso' });
      }

      newUser = {
        id: `usr-${Date.now()}`,
        registro_upds,
        email,
        password_hash: passwordHash,
        nombre,
        apellido,
        rol,
        activo: true,
        acepta_terminos: !!acepta_terminos,
        creado_en: new Date()
      };

      mockDb.usuarios.push(newUser);

      // Crear avatar por defecto (RF-01)
      mockDb.avatares.push({
        id: `av-${Date.now()}`,
        usuario_id: newUser.id,
        nombre_visible: `${nombre} ${apellido.charAt(0)}.`,
        modelo_url: null,
        apariencia: { colorCabello: '#2a1a0a', colorCamisa: '#1a5ba8', colorPantalon: '#333333', escala: 1.0 },
        actualizado_en: new Date()
      });
    } else {
      // Usando PostgreSQL
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const userRes = await client.query(
          `INSERT INTO usuarios (registro_upds, email, password_hash, nombre, apellido, rol, acepta_terminos)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, registro_upds, email, nombre, apellido, rol, acepta_terminos`,
          [registro_upds, email, passwordHash, nombre, apellido, rol, !!acepta_terminos]
        );

        newUser = userRes.rows[0];

        // Crear avatar por defecto (RF-01)
        await client.query(
          `INSERT INTO avatares (usuario_id, nombre_visible, apariencia)
           VALUES ($1, $2, $3)`,
          [newUser.id, `${nombre} ${apellido.charAt(0)}.`, JSON.stringify({ colorCabello: '#2a1a0a', colorCamisa: '#1a5ba8', colorPantalon: '#333333', escala: 1.0 })]
        );

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      user: {
        id: newUser.id,
        email: newUser.email,
        nombre: newUser.nombre,
        apellido: newUser.apellido,
        rol: newUser.rol
      }
    });

  } catch (err: any) {
    console.error('Error al registrar:', err);
    res.status(500).json({ error: 'Error del servidor al registrar usuario' });
  }
});

// 2. Login (RF-06, RNF-05)
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos' });
  }

  try {
    let user: any = null;
    let avatar: any = null;

    if (isUsingMock()) {
      user = mockDb.usuarios.find(u => u.email === email && u.activo);
      if (user) {
        avatar = mockDb.avatares.find(a => a.usuario_id === user.id);
      }
    } else {
      const userRes = await pool.query(
        'SELECT * FROM usuarios WHERE email = $1 AND activo = true',
        [email]
      );
      if (userRes.rows.length > 0) {
        user = userRes.rows[0];
        const avatarRes = await pool.query(
          'SELECT * FROM avatares WHERE usuario_id = $1',
          [user.id]
        );
        avatar = avatarRes.rows.length > 0 ? avatarRes.rows[0] : null;
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const passwordValida = await bcrypt.compare(password, user.password_hash);
    if (!passwordValida) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Generar Token JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email, rol: user.rol, nombre: user.nombre },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Actualizar último acceso
    const ahora = new Date();
    if (isUsingMock()) {
      user.ultimo_acceso = ahora;
    } else {
      await pool.query('UPDATE usuarios SET ultimo_acceso = $1 WHERE id = $2', [ahora, user.id]);
    }

    res.json({
      token,
      user: {
        id: user.id,
        registro_upds: user.registro_upds,
        email: user.email,
        nombre: user.nombre,
        apellido: user.apellido,
        rol: user.rol,
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

// Middleware de autenticación JWT
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

// 3. Listar Espacios (RF-02)
app.get('/api/espacios', authenticateJWT, async (req: any, res) => {
  try {
    const { userId, rol } = req.user;

    if (isUsingMock()) {
      // El campus central es accesible para todos. 
      // Las aulas son accesibles si es docente de la materia o si el estudiante está inscrito.
      // Para simplificar el piloto mock, damos acceso a todos los espacios configurados
      res.json(mockDb.espacios);
    } else {
      if (rol === 'admin' || rol === 'docente') {
        const result = await pool.query(
          `SELECT e.* FROM espacios e 
           LEFT JOIN asignaturas a ON e.asignatura_id = a.id
           WHERE e.activo = true AND (e.tipo = 'campus' OR a.docente_id = $1)`,
          [userId]
        );
        res.json(result.rows);
      } else {
        // Estudiantes inscritos
        const result = await pool.query(
          `SELECT e.* FROM espacios e
           INNER JOIN asignaturas a ON e.asignatura_id = a.id
           INNER JOIN inscripciones i ON i.asignatura_id = a.id
           WHERE e.activo = true AND i.usuario_id = $1
           UNION
           SELECT * FROM espacios WHERE tipo = 'campus' AND activo = true`,
          [userId]
        );
        res.json(result.rows);
      }
    }
  } catch (err) {
    console.error('Error al listar espacios:', err);
    res.status(500).json({ error: 'Error de base de datos' });
  }
});

// 4. Personalizar Avatar (RF-01)
app.post('/api/avatar/custom', authenticateJWT, async (req: any, res) => {
  const { userId } = req.user;
  const { nombre_visible, modelo_url, apariencia } = req.body;

  try {
    if (isUsingMock()) {
      const avatarIdx = mockDb.avatares.findIndex(a => a.usuario_id === userId);
      const updatedAvatar = {
        id: avatarIdx !== -1 ? mockDb.avatares[avatarIdx].id : `av-${Date.now()}`,
        usuario_id: userId,
        nombre_visible: nombre_visible || 'Estudiante',
        modelo_url: modelo_url || null,
        apariencia: apariencia || {},
        actualizado_en: new Date()
      };

      if (avatarIdx !== -1) {
        mockDb.avatares[avatarIdx] = updatedAvatar;
      } else {
        mockDb.avatares.push(updatedAvatar);
      }
      res.json({ message: 'Avatar actualizado', avatar: updatedAvatar });
    } else {
      const result = await pool.query(
        `INSERT INTO avatares (usuario_id, nombre_visible, modelo_url, apariencia, actualizado_en)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (usuario_id) 
         DO UPDATE SET nombre_visible = $2, modelo_url = $3, apariencia = $4, actualizado_en = NOW()
         RETURNING *`,
        [userId, nombre_visible, modelo_url, JSON.stringify(apariencia)]
      );
      res.json({ message: 'Avatar actualizado', avatar: result.rows[0] });
    }
  } catch (err) {
    console.error('Error al personalizar avatar:', err);
    res.status(500).json({ error: 'Error de servidor' });
  }
});

// 5. Programar Clase y Sesiones (RF-08) - Exclusivo Docente
app.post('/api/sesiones', authenticateJWT, async (req: any, res) => {
  const { userId, rol } = req.user;
  const { espacio_id, tema, inicio_programado, fin_programado, tolerancia_min } = req.body;

  if (rol !== 'docente') {
    return res.status(403).json({ error: 'Acceso denegado: requiere rol docente' });
  }

  try {
    let nuevaSesion: any = null;

    if (isUsingMock()) {
      nuevaSesion = {
        id: `ses-${Date.now()}`,
        espacio_id,
        docente_id: userId,
        tema,
        inicio_programado: new Date(inicio_programado),
        fin_programado: new Date(fin_programado),
        inicio_real: new Date(),
        fin_real: null,
        estado: 'en_curso', // Empezamos de una vez
        tolerancia_min: tolerancia_min || 10
      };
      mockDb.sesiones_clase.push(nuevaSesion);
    } else {
      const resQuery = await pool.query(
        `INSERT INTO sesiones_clase (espacio_id, docente_id, tema, inicio_programado, fin_programado, inicio_real, estado, tolerancia_min)
         VALUES ($1, $2, $3, $4, $5, NOW(), 'en_curso', $6)
         RETURNING *`,
        [espacio_id, userId, tema, inicio_programado, fin_programado, tolerancia_min || 10]
      );
      nuevaSesion = resQuery.rows[0];
    }

    res.status(201).json({ message: 'Clase programada e iniciada', sesion: nuevaSesion });
  } catch (err) {
    console.error('Error al programar clase:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// 6. Consultar Reporte de Asistencia (RF-08, RF-05) - Exclusivo Docente
app.get('/api/asistencias/reporte/:sesionId', authenticateJWT, async (req: any, res) => {
  const { rol } = req.user;
  const { sesionId } = req.params;

  if (rol !== 'docente') {
    return res.status(403).json({ error: 'Acceso denegado: requiere rol docente' });
  }

  try {
    let reporte: any[] = [];

    if (isUsingMock()) {
      // Filtrar asistencias de la sesión
      const asistenciasSesion = mockDb.asistencias.filter(a => a.sesion_id === sesionId);

      // Mapear con datos de usuarios
      reporte = asistenciasSesion.map(a => {
        const u = mockDb.usuarios.find(usr => usr.id === a.usuario_id);
        return {
          id: a.id,
          hora_ingreso: a.hora_ingreso,
          hora_salida: a.hora_salida,
          estado: a.estado,
          registro_upds: u ? u.registro_upds : 'S/R',
          nombre: u ? u.nombre : 'Usuario',
          apellido: u ? u.apellido : 'Eliminado'
        };
      });
    } else {
      const queryStr = `
        SELECT 
          a.id, 
          a.hora_ingreso, 
          a.hora_salida, 
          a.estado,
          u.registro_upds,
          u.nombre,
          u.apellido
        FROM asistencias a
        INNER JOIN usuarios u ON a.usuario_id = u.id
        WHERE a.sesion_id = $1
        ORDER BY u.apellido ASC, u.nombre ASC`;
      const result = await pool.query(queryStr, [sesionId]);
      reporte = result.rows;
    }

    res.json(reporte);
  } catch (err) {
    console.error('Error al obtener reporte de asistencia:', err);
    res.status(500).json({ error: 'Error de servidor' });
  }
});

// Iniciar Servidor
server.listen(PORT, () => {
  console.log(`🚀 Metaverso UPDS Backend corriendo en http://localhost:${PORT}`);
  if (isUsingMock()) {
    console.log('⚠️ ADVERTENCIA: La base de datos está corriendo en modo en memoria (Mock).');
  }
});
