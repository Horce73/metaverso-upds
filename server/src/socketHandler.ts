import { Server, Socket } from 'socket.io';
import { pool } from './db.js';
import { registrarAsistencia, registrarSalida, actualizarUltimaPosicion } from './helpers.js';
import { verificarToken } from './middleware/auth.js';

// Identidad del socket (SEC-01). Se fija una sola vez en el handshake a partir
// del JWT y de la base; ningun evento posterior la toma del payload del cliente.
interface Identidad {
  userId: number;       // 0 para invitados (no tienen fila en usuarios)
  esInvitado: boolean;
  nombre: string;
  roles: string[];
}

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

// Estado en memoria del contenido actual del pizarrón por espacio, para que
// quien entra al aula DESPUÉS de que ya se dibujó algo (el caso más común en
// una clase real) reciba lo ya dibujado en vez de ver el pizarrón en blanco.
// Es un buffer efímero (se pierde al reiniciar el servidor); la persistencia
// real a largo plazo sigue siendo 'save_pizarra' -> tabla pizarra_snapshots.
const pizarronState = new Map<string, any[]>();
const MAX_TRAZOS_POR_ESPACIO = 4000;

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

// Borrar el pizarrón, persistir el snapshot oficial, iniciar/finalizar clase y
// resolver solicitudes de acceso son acciones de docente/admin.
function esDocenteOAdmin(roles: string[]): boolean {
  return roles.includes('docente') || roles.includes('administrador');
}

// Resuelve la identidad a partir del token. Para usuarios registrados los roles
// y el estado se leen de la base, no del token: un usuario desactivado o al que
// se le quito un rol deja de tenerlo en cuanto reconecta.
async function resolverIdentidad(token: unknown): Promise<Identidad | null> {
  if (typeof token !== 'string' || !token) return null;
  let payload: any;
  try {
    payload = await verificarToken(token);
  } catch {
    return null;
  }

  if (payload.isGuest) {
    return { userId: 0, esInvitado: true, nombre: String(payload.nombre || 'Invitado'), roles: ['invitado'] };
  }

  const userId = Number(payload.userId);
  if (!Number.isInteger(userId) || userId <= 0) return null;

  const { rows } = await pool.query(
    `SELECT u.nombre, a.nombre_visible
     FROM usuarios u LEFT JOIN avatares a ON a.usuario_id = u.id
     WHERE u.id = $1 AND u.activo = TRUE`,
    [userId]
  );
  if (rows.length === 0) return null;

  const roles = await obtenerRoles(userId);
  if (roles.length === 0) return null;

  return { userId, esInvitado: false, nombre: rows[0].nombre_visible || rows[0].nombre, roles };
}

export function setupSockets(io: Server) {
  // Handshake: sin un JWT valido en `auth.token` no hay conexion.
  io.use(async (socket, next) => {
    try {
      const identidad = await resolverIdentidad(socket.handshake.auth?.token);
      if (!identidad) return next(new Error('NO_AUTORIZADO'));
      socket.data.identidad = identidad;
      next();
    } catch (err) {
      console.error('Error autenticando socket:', err);
      next(new Error('NO_AUTORIZADO'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const identidad: Identidad = socket.data.identidad;
    console.log(`🔌 Cliente conectado: ${socket.id} (usuario ${identidad.userId || 'invitado'})`);

    socket.on('join_space', async (data: any) => {
      const numUserId = identidad.userId;
      const nombreVisible = identidad.nombre;
      const apariencia = data?.apariencia || data?.user?.apariencia || {};
      const peerId = String(data?.peerId || data?.user?.peerId || '');

      // El espacio y su tipo salen de la base, no del cliente.
      const nuevoEspacioId = Number(data?.espacioId);
      const espacioRes = Number.isInteger(nuevoEspacioId)
        ? await pool.query('SELECT tipo FROM espacios WHERE id = $1 AND activo = TRUE', [nuevoEspacioId])
        : { rows: [] as any[] };
      if (espacioRes.rows.length === 0) {
        socket.emit('join_rechazado', { motivo: 'El espacio no existe o no está activo.' });
        return;
      }
      const espacioTipo: 'campus' | 'aula' = espacioRes.rows[0].tipo;
      if (espacioTipo === 'aula' && identidad.esInvitado) {
        socket.emit('join_rechazado', { motivo: 'Los invitados solo pueden acceder al campus.' });
        return;
      }
      const espacioId = String(nuevoEspacioId);

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

      const roles = identidad.roles;

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

      console.log(`👤 ${nombreVisible} (${numUserId || 'invitado'}) se unió al espacio ${espacioId}`);

      if (numUserId > 0) {
        await registrarAsistencia(numUserId, nuevoEspacioId);
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

    // Los eventos de sala actuan siempre sobre el espacio al que el socket se
    // unio; el espacioId del payload se ignora para no escribir en aulas ajenas.
    socket.on('draw_stroke', (data: { stroke: any }) => {
      const user = activeUsers.get(socket.id);
      if (!user || !puedeDibujar(user.roles)) return;
      // Se difunde a TODA la sala (incluido el emisor) para que el pizarrón
      // 3D del aula quede sincronizado incluso para quien no tiene el panel
      // 2D abierto. El emisor se marca para que su propio panel 2D (que ya
      // dibujó el trazo localmente) no lo vuelva a dibujar por duplicado.
      const key = String(user.espacioId);
      const trazoConId = { ...data.stroke, senderSocketId: socket.id };
      const trazos = pizarronState.get(key) || [];
      trazos.push(trazoConId);
      if (trazos.length > MAX_TRAZOS_POR_ESPACIO) trazos.shift();
      pizarronState.set(key, trazos);
      io.to(key).emit('stroke_received', trazoConId);
    });

    socket.on('clear_board', () => {
      const user = activeUsers.get(socket.id);
      if (!user || !esDocenteOAdmin(user.roles)) return;
      pizarronState.set(String(user.espacioId), []);
      io.to(String(user.espacioId)).emit('board_cleared');
    });

    // Estado actual del pizarrón, para quien recién abre el panel 2D o entra
    // a la escena 3D del aula y necesita ver lo que ya se dibujó antes.
    socket.on('get_pizarra_state', () => {
      const user = activeUsers.get(socket.id);
      if (!user) return;
      socket.emit('pizarra_state', { trazos: pizarronState.get(String(user.espacioId)) || [] });
    });

    socket.on('save_pizarra', async (data: {
      sesionId: string;
      trazos: any[];
    }) => {
      const user = activeUsers.get(socket.id);
      if (!user || !esDocenteOAdmin(user.roles)) {
        socket.emit('pizarra_saved_status', { success: false, error: 'PERMISO_DENEGADO' });
        return;
      }

      const { sesionId, trazos } = data;
      try {
        // Solo se guarda sobre una sesion del aula en la que el socket esta.
        const sesion = await pool.query(
          'SELECT 1 FROM sesiones_clase WHERE id = $1 AND espacio_id = $2',
          [Number(sesionId), user.espacioId]
        );
        if (sesion.rows.length === 0) {
          socket.emit('pizarra_saved_status', { success: false, error: 'PERMISO_DENEGADO' });
          return;
        }
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
      temaClase?: string;
    }) => {
      if (identidad.esInvitado) return;
      // Quien solicita es el usuario del token, no el que diga el payload.
      const usuario = { id: identidad.userId, nombre: identidad.nombre };
      console.log(`📩 Solicitud de acceso recibida de ${usuario.nombre} para el espacio ${data.espacioId}`);
      // Emitir a todos los docentes EXCEPTO al propio remitente
      socket.broadcast.emit('nueva_solicitud_acceso', {
        estudianteSocketId: socket.id,
        usuario,
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
      if (!esDocenteOAdmin(identidad.roles)) return;
      console.log(`✉️ Docente respondió a solicitud de ${data.estudianteSocketId}: ${data.aprobado ? 'APROBADO' : 'RECHAZADO'}`);
      io.to(data.estudianteSocketId).emit('respuesta_solicitud_acceso', {
        espacioId: data.espacioId,
        aprobado: data.aprobado,
      });
    });

    socket.on('clase_iniciada', (sesion: any) => {
      if (!esDocenteOAdmin(identidad.roles)) return;
      console.log('🎓 Clase iniciada por el docente:', sesion);
      io.emit('clase_iniciada', sesion);
    });

    socket.on('clase_finalizada', (data: { espacioId: string }) => {
      if (!esDocenteOAdmin(identidad.roles)) return;
      console.log('🛑 Clase finalizada en espacio:', data.espacioId);
      io.emit('clase_finalizada', data);
    });

    const handleSendChat = (data: {
      message: { sender: string; text: string };
    }) => {
      const user = activeUsers.get(socket.id);
      if (!user) return;
      // El remitente lo pone el servidor: nadie puede escribir en nombre de otro.
      const message = { ...data?.message, sender: identidad.nombre };
      io.to(String(user.espacioId)).emit('chat_message', message);
      io.to(String(user.espacioId)).emit('chat_msg_received', message);
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
