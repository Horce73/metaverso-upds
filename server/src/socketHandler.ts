import { Server, Socket } from 'socket.io';
import { pool } from './db.js';
import { registrarAsistencia, registrarSalida } from './helpers.js';

interface UserState {
  userId: number;
  nombreVisible: string;
  espacioId: number;
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
      userId: number;
      nombreVisible: string;
      espacioId: number;
      apariencia: any;
      peerId?: string;
    }) => {
      const { userId, nombreVisible, espacioId, apariencia, peerId } = data;

      const prevUser = activeUsers.get(socket.id);
      if (prevUser) {
        socket.leave(String(prevUser.espacioId));
        socket.to(String(prevUser.espacioId)).emit('user_left', { socketId: socket.id, userId: prevUser.userId });
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
      socket.join(String(espacioId));

      const usersInSpace: { [socketId: string]: UserState } = {};
      activeUsers.forEach((user, sid) => {
        if (user.espacioId === espacioId && sid !== socket.id) {
          usersInSpace[sid] = user;
        }
      });
      socket.emit('space_users', usersInSpace);

      socket.to(String(espacioId)).emit('user_joined', {
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
        socket.to(String(user.espacioId)).emit('user_moved', {
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
        socket.to(String(user.espacioId)).emit('user_left', { socketId: socket.id, userId: user.userId });
        activeUsers.delete(socket.id);
        await registrarSalida(user.userId, user.espacioId);
      }
    });
  });
}
