import { Server, Socket } from 'socket.io';
import { pool } from './db.js';

interface UserState {
  userId: string;
  nombreVisible: string;
  espacioId: string;
  position: [number, number, number];
  rotation: [number, number, number];
  apariencia: any;
  peerId?: string;
}

const activeUsers = new Map<string, UserState>();

export function setupSockets(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log(`🔌 Cliente conectado: ${socket.id}`);

    socket.on('join_space', async (data: {
      userId: string;
      nombreVisible: string;
      espacioId: string;
      apariencia: any;
      peerId?: string;
    }) => {
      const { userId, nombreVisible, espacioId, apariencia, peerId } = data;

      const prevUser = activeUsers.get(socket.id);
      if (prevUser) {
        socket.leave(prevUser.espacioId);
        socket.to(prevUser.espacioId).emit('user_left', { socketId: socket.id, userId: prevUser.userId });
      }

      const userState: UserState = {
        userId,
        nombreVisible,
        espacioId,
        position: [0, 0.5, 0],
        rotation: [0, 0, 0],
        apariencia,
        peerId
      };

      activeUsers.set(socket.id, userState);
      socket.join(espacioId);

      const usersInSpace: { [socketId: string]: UserState } = {};
      activeUsers.forEach((user, sid) => {
        if (user.espacioId === espacioId && sid !== socket.id) {
          usersInSpace[sid] = user;
        }
      });
      socket.emit('space_users', usersInSpace);

      socket.to(espacioId).emit('user_joined', {
        socketId: socket.id,
        user: userState
      });

      console.log(`👤 ${nombreVisible} (${userId}) se unió al espacio ${espacioId}`);

      await registrarAsistencia(userId, espacioId);
    });

    socket.on('move', (data: {
      position: [number, number, number];
      rotation: [number, number, number];
    }) => {
      const user = activeUsers.get(socket.id);
      if (user) {
        user.position = data.position;
        user.rotation = data.rotation;
        socket.to(user.espacioId).emit('user_moved', {
          socketId: socket.id,
          position: user.position,
          rotation: user.rotation
        });
      }
    });

    socket.on('draw_stroke', (data: {
      espacioId: string;
      stroke: any;
    }) => {
      socket.to(data.espacioId).emit('stroke_received', data.stroke);
    });

    socket.on('clear_board', (data: { espacioId: string }) => {
      socket.to(data.espacioId).emit('board_cleared');
    });

    socket.on('save_pizarra', async (data: {
      sesionId: string;
      trazos: any[];
    }) => {
      const { sesionId, trazos } = data;
      try {
        await pool.query(
          'INSERT INTO pizarra_snapshots (sesion_id, trazos) VALUES ($1, $2)',
          [sesionId, JSON.stringify(trazos)]
        );
        socket.emit('pizarra_saved_status', { success: true });
      } catch (err) {
        console.error('Error al guardar pizarra:', err);
        socket.emit('pizarra_saved_status', { success: false, error: 'DB_ERROR' });
      }
    });

    socket.on('chat_msg_send', (data: {
      espacioId: string;
      message: { sender: string; text: string };
    }) => {
      socket.to(data.espacioId).emit('chat_msg_received', data.message);
    });

    socket.on('disconnect', async () => {
      const user = activeUsers.get(socket.id);
      if (user) {
        console.log(`🔌 Cliente desconectado: ${user.nombreVisible} (${socket.id})`);
        socket.to(user.espacioId).emit('user_left', { socketId: socket.id, userId: user.userId });
        activeUsers.delete(socket.id);
        await registrarSalida(user.userId, user.espacioId);
      }
    });
  });
}

async function registrarAsistencia(userId: string, espacioId: string) {
  try {
    const res = await pool.query(
      `SELECT id, COALESCE(inicio_real, inicio_programado) AS inicio, tolerancia_min
       FROM sesiones_clase
       WHERE espacio_id = $1 AND estado IN ('en_curso', 'programada')
       ORDER BY inicio_programado ASC LIMIT 1`,
      [espacioId]
    );

    if (res.rows.length === 0) return;

    const clase = res.rows[0];
    const ahora = new Date();
    const inicio = new Date(clase.inicio);
    const limiteTarde = new Date(inicio.getTime() + (clase.tolerancia_min || 10) * 60000);
    const estado = ahora > limiteTarde ? 'tarde' : 'presente';

    await pool.query(
      `INSERT INTO asistencias (sesion_id, usuario_id, hora_ingreso, estado)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (sesion_id, usuario_id) DO NOTHING`,
      [clase.id, userId, ahora, estado]
    );
    console.log(`📝 Asistencia registrada para ${userId} como: ${estado}`);
  } catch (err) {
    console.error('Error al registrar asistencia:', err);
  }
}

async function registrarSalida(userId: string, espacioId: string) {
  try {
    const res = await pool.query(
      `SELECT id FROM sesiones_clase
       WHERE espacio_id = $1 AND estado IN ('en_curso', 'programada')
       ORDER BY inicio_programado ASC LIMIT 1`,
      [espacioId]
    );

    if (res.rows.length === 0) return;

    await pool.query(
      `UPDATE asistencias SET hora_salida = NOW()
       WHERE sesion_id = $1 AND usuario_id = $2`,
      [res.rows[0].id, userId]
    );
  } catch (err) {
    console.error('Error al registrar salida:', err);
  }
}
