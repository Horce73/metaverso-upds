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

    socket.on('join_space', async (data: any) => {
      const userId = data.userId ?? data.user?.id;
      const nombreVisible = data.nombreVisible || data.user?.nombreVisible || data.user?.nombre || 'Estudiante';
      const espacioId = data.espacioId;
      const apariencia = data.apariencia || data.user?.apariencia || {};
      const peerId = data.peerId || data.user?.peerId || '';

      const numUserId = Number(userId) || 0;

      // Limpiar registros o conexiones previas del mismo usuario (Enforzar 1 Sola Sesión Activa)
      activeUsers.forEach((user, sid) => {
        if (sid !== socket.id && (numUserId > 0 && user.userId === numUserId)) {
          console.log(`⚠️ Cerrando sesión previa de usuario ${numUserId} en socket ${sid}`);
          io.to(sid).emit('session_terminated', {
            reason: 'Se ha iniciado sesión desde otro dispositivo con esta cuenta.'
          });
          const oldSocket = io.sockets.sockets.get(sid);
          if (oldSocket) {
            oldSocket.leave(String(user.espacioId));
            oldSocket.disconnect(true);
          }
          activeUsers.delete(sid);
        }
      });

      const userState: UserState = {
        userId: numUserId,
        nombreVisible,
        espacioId: Number(espacioId) || 1,
        position: [0, 0.5, 0],
        rotation: [0, 0, 0],
        apariencia,
        peerId
      };

      activeUsers.set(socket.id, userState);
      socket.join(String(espacioId));

      const usersInSpace: { [socketId: string]: UserState } = {};
      activeUsers.forEach((user, sid) => {
        if (String(user.espacioId) === String(espacioId) && sid !== socket.id && (numUserId === 0 || user.userId !== numUserId)) {
          usersInSpace[sid] = user;
        }
      });
      socket.emit('space_users', usersInSpace);
      socket.emit('current_users', usersInSpace);

      socket.to(String(espacioId)).emit('user_joined', {
        socketId: socket.id,
        user: userState
      });

      console.log(`👤 ${nombreVisible} (${userId}) se unió al espacio ${espacioId}`);

      if (numUserId > 0) {
        await registrarAsistencia(numUserId, Number(espacioId));
      }
    });

    socket.on('move', (data: {
      position: [number, number, number];
      rotation: [number, number, number];
      estaSentado?: boolean;
    }) => {
      const user = activeUsers.get(socket.id);
      if (user) {
        user.position = data.position;
        user.rotation = data.rotation;
        (user as any).estaSentado = !!data.estaSentado;
        socket.to(String(user.espacioId)).emit('user_moved', {
          socketId: socket.id,
          position: user.position,
          rotation: user.rotation,
          estaSentado: (user as any).estaSentado
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

    // Solicitud de acceso a un aula por un estudiante
    socket.on('solicitar_acceso_aula', (data: {
      espacioId: string;
      usuario: { id: string; nombre: string };
      temaClase?: string;
    }) => {
      console.log(`📩 Solicitud de acceso recibida de ${data.usuario.nombre} para el espacio ${data.espacioId}`);
      // Emitir a todos los docentes EXCEPTO al propio remitente
      socket.broadcast.emit('nueva_solicitud_acceso', {
        estudianteSocketId: socket.id,
        usuario: data.usuario,
        espacioId: data.espacioId,
        temaClase: data.temaClase,
      });
    });

    // Respuesta del docente a la solicitud de acceso
    socket.on('responder_solicitud_acceso', (data: {
      estudianteSocketId: string;
      espacioId: string;
      aprobado: boolean;
    }) => {
      console.log(`✉️ Docente respondió a solicitud de ${data.estudianteSocketId}: ${data.aprobado ? 'APROBADO' : 'RECHAZADO'}`);
      io.to(data.estudianteSocketId).emit('respuesta_solicitud_acceso', {
        espacioId: data.espacioId,
        aprobado: data.aprobado,
      });
    });

    socket.on('clase_iniciada', (sesion: any) => {
      console.log('🎓 Clase iniciada por el docente:', sesion);
      io.emit('clase_iniciada', sesion);
    });

    socket.on('clase_finalizada', (data: { espacioId: string }) => {
      console.log('🛑 Clase finalizada en espacio:', data.espacioId);
      io.emit('clase_finalizada', data);
    });

    const handleSendChat = (data: {
      espacioId: string;
      message: { sender: string; text: string };
    }) => {
      io.to(String(data.espacioId)).emit('chat_message', data.message);
      io.to(String(data.espacioId)).emit('chat_msg_received', data.message);
    };

    socket.on('send_chat', handleSendChat);
    socket.on('chat_msg_send', handleSendChat);

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
