import { Server, Socket } from 'socket.io';
import { pool } from './db.js';
import { registrarAsistencia, registrarSalida, actualizarUltimaPosicion } from './helpers.js';

interface UserState {
  userId: number;
  nombreVisible: string;
  espacioId: number;
  espacioTipo: 'campus' | 'aula';
  position: [number, number, number];
  rotation: [number, number, number];
  estaSentado: boolean;
  apariencia: any;
  peerId?: string;
  roles: string[];
}

const activeUsers = new Map<string, UserState>();

async function obtenerRoles(userId: number): Promise<string[]> {
  if (!userId) return [];
  try {
    const { rows } = await pool.query(
      `SELECT r.nombre FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id WHERE ur.usuario_id = $1`,
      [userId]
    );
    return rows.map((r: any) => r.nombre);
  } catch {
    return [];
  }
}

// La pizarra es colaborativa: docentes, estudiantes y administradores pueden escribir.
function puedeDibujar(roles: string[]): boolean {
  return roles.includes('docente') || roles.includes('estudiante') || roles.includes('administrador');
}

// Borrar el pizarrón y persistir el snapshot oficial son acciones de docente/admin.
function puedeAdministrarPizarra(roles: string[]): boolean {
  return roles.includes('docente') || roles.includes('administrador');
}

export function setupSockets(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log(`🔌 Cliente conectado: ${socket.id}`);

    socket.on('join_space', async (data: any) => {
      const userId = data.userId ?? data.user?.id;
      const nombreVisible = data.nombreVisible || data.user?.nombreVisible || data.user?.nombre || 'Estudiante';
      const espacioId = data.espacioId;
      // El cliente indica el tipo de espacio; ante duda/valor faltante asumimos 'aula'
      // (fail-closed) para nunca persistir por error una posición como si fuera del campus.
      const espacioTipoRaw = data.espacioTipo ?? data.user?.espacioTipo;
      const espacioTipo: 'campus' | 'aula' = espacioTipoRaw === 'campus' ? 'campus' : 'aula';
      const apariencia = data.apariencia || data.user?.apariencia || {};
      const peerId = data.peerId || data.user?.peerId || '';

      const numUserId = Number(userId) || 0;
      const nuevoEspacioId = Number(espacioId) || 1;

      // Limpiar registros o conexiones previas del mismo usuario (Enforzar 1 Sola Sesión Activa)
      activeUsers.forEach((user, sid) => {
        if (sid !== socket.id && (numUserId > 0 && user.userId === numUserId)) {
          console.log(`⚠️ Cerrando sesión previa de usuario ${numUserId} en socket ${sid}`);
          io.to(sid).emit('session_terminated', {
            reason: 'Se ha iniciado sesión desde otro dispositivo con esta cuenta.'
          });
          // El socket viejo nunca llegará a disparar su propio 'disconnect' con datos
          // válidos (lo borramos de activeUsers acá mismo), así que avisamos user_left
          // y persistimos su última posición de campus ahora, no en el handler de abajo.
          socket.to(String(user.espacioId)).emit('user_left', { socketId: sid, userId: user.userId });
          if (user.espacioTipo === 'campus') {
            actualizarUltimaPosicion(user.userId, user.position, user.rotation);
          }
          const oldSocket = io.sockets.sockets.get(sid);
          if (oldSocket) {
            oldSocket.leave(String(user.espacioId));
            oldSocket.disconnect(true);
          }
          activeUsers.delete(sid);
        }
      });

      // Si este MISMO socket ya estaba en otro espacio (el cliente reutiliza el socket
      // al cambiar de espacio), hay que abandonar esa sala explícitamente: join() sin un
      // leave() previo deja al socket escuchando ambas salas a la vez.
      const prevUser = activeUsers.get(socket.id);
      if (prevUser && prevUser.espacioId !== nuevoEspacioId) {
        socket.leave(String(prevUser.espacioId));
        socket.to(String(prevUser.espacioId)).emit('user_left', { socketId: socket.id, userId: prevUser.userId });
        if (prevUser.espacioTipo === 'campus') {
          await actualizarUltimaPosicion(prevUser.userId, prevUser.position, prevUser.rotation);
        }
      }

      const roles = await obtenerRoles(numUserId);

      const userState: UserState = {
        userId: numUserId,
        nombreVisible,
        espacioId: nuevoEspacioId,
        espacioTipo,
        position: [0, 0.5, 0],
        rotation: [0, 0, 0],
        estaSentado: false,
        apariencia,
        peerId,
        roles
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
        if (data.position) user.position = data.position;
        if (data.rotation) user.rotation = data.rotation;
        user.estaSentado = !!data.estaSentado;
        socket.to(String(user.espacioId)).emit('user_moved', {
          socketId: socket.id,
          position: user.position,
          rotation: user.rotation,
          estaSentado: user.estaSentado
        });
      }
    });

    socket.on('draw_stroke', (data: {
      espacioId: string;
      stroke: any;
    }) => {
      const user = activeUsers.get(socket.id);
      if (!user || !puedeDibujar(user.roles)) return;
      socket.to(data.espacioId).emit('stroke_received', data.stroke);
    });

    socket.on('clear_board', (data: { espacioId: string }) => {
      const user = activeUsers.get(socket.id);
      if (!user || !puedeAdministrarPizarra(user.roles)) return;
      socket.to(data.espacioId).emit('board_cleared');
    });

    socket.on('save_pizarra', async (data: {
      sesionId: string;
      trazos: any[];
    }) => {
      const user = activeUsers.get(socket.id);
      if (!user || !puedeAdministrarPizarra(user.roles)) {
        socket.emit('pizarra_saved_status', { success: false, error: 'PERMISO_DENEGADO' });
        return;
      }

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
        if (user.espacioTipo === 'campus') {
          await actualizarUltimaPosicion(user.userId, user.position, user.rotation);
        }
      }
    });
  });
}
