import { Server, Socket } from 'socket.io';
import { pool } from './db.js';
import { registrarAsistencia, registrarSalida, actualizarUltimaPosicion, bitacora } from './helpers.js';
import { guardarMensaje, historialDe, type MensajeChat } from './chatPersistencia.js';
import { validarEncuesta, MAX_OPCIONES } from './encuestas.js';
import { crearEncuesta, votar, cerrarEncuesta, encuestaVigente } from './encuestasServidor.js';
import { estadoGrabacion, iniciarGrabacion, detenerGrabacion, grabarSubtitulo, grabarCaptura } from './grabacionServidor.js';
import { verificarToken } from './middleware/auth.js';
import { CUPOS_SOCKET, limitador } from './limites.js';
import { sanearTextoChat } from './chat.js';
import {
  estadoPublico,
  levantarMano,
  bajarMano,
  cederPalabra,
  quienTienePalabra,
  quitarPalabra,
  salirDelAula,
} from './preguntas.js';
import { validarLote, agregarLote, cerrarTrazo, cerrarTrazosDe, trazosVisibles, deshacerTrazo, borrarTodo } from './pizarra.js';
import { estadoPantalla, iniciarPantalla, esCuadroValido, guardarCuadro, detenerPantalla, pantallaDe } from './pantalla.js';
import { debeRecibirMovimiento } from './relevanciaPosicion.js';
import { log } from './registro.js';
import { pases } from './accesoAula.js';

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
// Sockets que ya mandaron su posición real en el espacio actual: hasta el
// primer 'move' la de UserState es la provisoria del servidor (DATA-04).
const conPosicionReal = new Set<string>();

/** Dónde está cada persona conectada, para el mapa de calor. */
export function posicionesConocidas(): { espacioId: number; x: number; z: number }[] {
  const posiciones: { espacioId: number; x: number; z: number }[] = [];
  conPosicionReal.forEach((sid) => {
    const u = activeUsers.get(sid);
    if (u) posiciones.push({ espacioId: Number(u.espacioId), x: u.position[0], z: u.position[2] });
  });
  return posiciones;
}

// Aulas con el trabajo en grupos activo (AULA-07): la voz de cada mesa queda
// en la mesa. Lo activa y desactiva el docente; quien entra recibe el estado.
const aulasEnGrupos = new Set<number>();


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

/**
 * Al iniciar una clase, quienes ya estaban en el aula no vuelven a "entrar":
 * se les registra la asistencia en ese momento (DATA-01).
 */
const MAX_LARGO_SUBTITULO = 300;

export async function registrarPresentesEnAula(espacioId: number) {
  const usuarios = new Set<number>();
  activeUsers.forEach((u) => {
    if (Number(u.espacioId) === espacioId && u.userId > 0) usuarios.add(u.userId);
  });
  for (const userId of usuarios) await registrarAsistencia(userId, espacioId);
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
      log.error('Error autenticando socket', err);
      next(new Error('NO_AUTORIZADO'));
    }
  });

  // Cola de preguntas de un aula (AULA-03), para todos los que están en ella
  const emitirPreguntas = (espacioId: number) => io.to(String(espacioId)).emit('estado_preguntas', estadoPublico(espacioId));

  // Encuesta del aula (AULA-05) a cada uno de los que están: quien la dirige
  // (docente o administrador) ve el conteo en vivo; el resto, sólo cuántos
  // votaron hasta que se cierra, y su propio voto.
  const emitirEncuesta = async (espacioId: number, soloA?: string) => {
    const vigente = await encuestaVigente(espacioId);
    activeUsers.forEach((u, sid) => {
      if (Number(u.espacioId) !== espacioId || (soloA && sid !== soloA)) return;
      if (!vigente) return void io.to(sid).emit('encuesta_estado', null);
      const { estado, votosPorUsuario } = vigente;
      io.to(sid).emit('encuesta_estado', {
        ...estado,
        votos: estado.abierta && !esDocenteOAdmin(u.roles) ? null : estado.votos,
        miVoto: votosPorUsuario.get(u.userId) ?? null,
      });
    });
  };
  const dejarAula = (espacioId: number, socketId: string) => {
    if (salirDelAula(espacioId, socketId)) emitirPreguntas(espacioId);
    // Si estaba compartiendo pantalla (AULA-01), se apaga para todos
    if (detenerPantalla(espacioId, socketId)) io.to(String(espacioId)).emit('pantalla_estado', estadoPantalla(espacioId));
  };

  io.on('connection', (socket: Socket) => {
    const identidad: Identidad = socket.data.identidad;

    // Cupo por evento y por socket (SEC-04): lo que excede se descarta.
    const cupos = new Map(Object.entries(CUPOS_SOCKET).map(([ev, [max, ms]]) => [ev, limitador(max, ms)]));
    const on = (evento: string, cupo: string, handler: (...args: any[]) => void) => {
      const permitido = cupos.get(cupo)!;
      socket.on(evento, (...args: any[]) => {
        if (permitido()) handler(...args);
      });
    };
    log.info('socket conectado', { socketId: socket.id, usuarioId: identidad.userId || null });

    on('join_space', 'join_space', async (data: any) => {
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
      // SEC-08: al aula entra el docente o el admin, o quien tiene un pase
      // (código del curso o solicitud aprobada por el docente)
      if (espacioTipo === 'aula' && !esDocenteOAdmin(identidad.roles) && !pases.tiene(identidad.userId, nuevoEspacioId)) {
        socket.emit('join_rechazado', {
          motivo: 'Para entrar a esta aula necesitas el código del curso o que el docente apruebe tu solicitud.',
          sinAcceso: true,
        });
        return;
      }
      const espacioId = String(nuevoEspacioId);

      // Limpiar registros o conexiones previas del mismo usuario (Enforzar 1 Sola Sesión Activa)
      activeUsers.forEach((user, sid) => {
        if (sid !== socket.id && (numUserId > 0 && user.userId === numUserId)) {
          log.info('sesión previa cerrada', { usuarioId: numUserId, socketId: sid });
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
          conPosicionReal.delete(sid);
          dejarAula(user.espacioId, sid);
          registrarSalida(user.userId, user.espacioId);
        }
      });

      // Si este MISMO socket ya estaba en otro espacio (el cliente reutiliza el socket
      // al cambiar de espacio), hay que abandonar esa sala explícitamente: join() sin un
      // leave() previo deja al socket escuchando ambas salas a la vez.
      const prevUser = activeUsers.get(socket.id);
      if (prevUser && prevUser.espacioId !== nuevoEspacioId) {
        socket.leave(String(prevUser.espacioId));
        dejarAula(prevUser.espacioId, socket.id);
        await cerrarTrazosDe(socket.id).catch((err) => log.error('Error al cerrar trazos', err));
        socket.to(String(prevUser.espacioId)).emit('user_left', { socketId: socket.id, userId: prevUser.userId });
        // "Salir al Campus" reutiliza el socket: sin esto la asistencia seguía
        // contando minutos hasta el fin de la clase (DATA-01)
        await registrarSalida(prevUser.userId, prevUser.espacioId);
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
      conPosicionReal.delete(socket.id);
      socket.join(String(espacioId));

      const usersInSpace: { [socketId: string]: UserState } = {};
      activeUsers.forEach((user, sid) => {
        if (String(user.espacioId) === String(espacioId) && sid !== socket.id && (numUserId === 0 || user.userId !== numUserId)) {
          usersInSpace[sid] = user;
        }
      });
      // Los roles con los que los demás lo ven (salen de la base, no del token
      // guardado en el navegador): el cliente decide con ellos si difunde la
      // voz en el aula, igual que lo deciden los demás (VOZ-03).
      socket.emit('join_aceptado', { espacioId: nuevoEspacioId, espacioTipo, roles });
      historialDe(nuevoEspacioId)
        .then((mensajes) => socket.emit('chat_historial', { espacioId: nuevoEspacioId, mensajes }))
        .catch((err) => log.error('Error al leer el historial de chat', err));
      socket.emit('space_users', usersInSpace);
      socket.emit('current_users', usersInSpace);
      if (espacioTipo === 'aula') {
        socket.emit('estado_preguntas', estadoPublico(nuevoEspacioId));
        // Quien entra tarde ve la pantalla compartida desde la última imagen
        const pantalla = pantallaDe(nuevoEspacioId);
        socket.emit('pantalla_estado', estadoPantalla(nuevoEspacioId));
        socket.emit('modo_grupos', { activo: aulasEnGrupos.has(nuevoEspacioId) });
        emitirEncuesta(nuevoEspacioId, socket.id).catch((err) => console.error('Error al enviar la encuesta:', err));
        socket.emit('grabacion_estado', estadoGrabacion(nuevoEspacioId));
        if (pantalla?.ultimoCuadro) socket.emit('pantalla_cuadro', pantalla.ultimoCuadro);
      }

      socket.to(String(espacioId)).emit('user_joined', {
        socketId: socket.id,
        user: userState
      });

      log.info('unido al espacio', { socketId: socket.id, usuarioId: numUserId || null, espacioId: nuevoEspacioId, tipo: espacioTipo });

      if (numUserId > 0) {
        await registrarAsistencia(numUserId, nuevoEspacioId);
      }
    });

    on('move', 'move', (data: {
      position: [number, number, number];
      rotation: [number, number, number];
      estaSentado?: boolean;
      t?: number;
    }) => {
      const user = activeUsers.get(socket.id);
      if (!user) return;
      if (data.position) {
        user.position = data.position;
        conPosicionReal.add(socket.id);
      }
      if (data.rotation) user.rotation = data.rotation;
      user.estaSentado = !!data.estaSentado;

      const payload = {
        socketId: socket.id,
        position: user.position,
        rotation: user.rotation,
        estaSentado: user.estaSentado,
        // 3D-03: hora del emisor (su reloj, no el del servidor), para interpolar
        t: typeof data.t === 'number' && Number.isFinite(data.t) ? data.t : undefined
      };

      // 3D-04: en el aula se difunde a todos (es un solo salon compacto,
      // filtrar ahi no ahorra nada). En el campus solo a quien tiene este
      // movimiento cerca, para que 30 alumnos repartidos entre la plaza y la
      // isla de aulas no reciban la posicion de todo el mundo 25 veces por
      // segundo cuando ni siquiera se ven.
      for (const [otroSocketId, otro] of activeUsers) {
        if (otroSocketId === socket.id) continue;
        if (otro.espacioId !== user.espacioId) continue;
        if (!debeRecibirMovimiento(user.espacioTipo, user.position, otro.position)) continue;
        io.to(otroSocketId).emit('user_moved', payload);
      }
    });

    // Pizarra por operaciones (AULA-02). Los eventos actúan siempre sobre el
    // aula a la que el socket se unió; el espacioId del payload se ignora.
    // Los lotes se difunden a TODA la sala (incluido el emisor) para que su
    // propio pizarrón 3D quede al día; su panel 2D, que ya los dibujó, los
    // reconoce por autorSocketId y no los repite.
    on('pizarra_trazo', 'pizarra', async (data: unknown) => {
      const user = activeUsers.get(socket.id);
      if (!user || user.espacioTipo !== 'aula' || !puedeDibujar(user.roles)) return;
      const lote = validarLote(data);
      if (!lote) return;
      const reenviar = agregarLote(lote, user.espacioId, user.userId, socket.id);
      if (!reenviar) return;
      io.to(String(user.espacioId)).emit('pizarra_trazo', { ...reenviar, autorSocketId: socket.id });
      if (reenviar.fin) {
        await cerrarTrazo(reenviar.id).catch((err) => log.error('Error al guardar trazo', err));
      }
    });

    // Deshacer un trazo: el autor el suyo; docente o admin, cualquiera
    on('pizarra_deshacer', 'pizarra', async (data: { id?: unknown }) => {
      const user = activeUsers.get(socket.id);
      if (!user || user.espacioTipo !== 'aula') return;
      try {
        if (await deshacerTrazo(String(data?.id ?? ''), user.espacioId, user.userId, esDocenteOAdmin(user.roles))) {
          io.to(String(user.espacioId)).emit('pizarra_borrado', { ids: [String(data?.id)] });
        }
      } catch (err) {
        log.error('Error al deshacer trazo', err);
      }
    });

    on('clear_board', 'clear_board', async () => {
      const user = activeUsers.get(socket.id);
      if (!user || user.espacioTipo !== 'aula' || !esDocenteOAdmin(user.roles)) return;
      try {
        await borrarTodo(user.espacioId);
        io.to(String(user.espacioId)).emit('board_cleared');
      } catch (err) {
        log.error('Error al borrar la pizarra', err);
      }
    });

    // Estado actual de la pizarra, para quien abre el panel 2D o entra a la
    // escena 3D del aula: lo guardado más lo que se está dibujando.
    on('get_pizarra_state', 'get_pizarra_state', async () => {
      const user = activeUsers.get(socket.id);
      if (!user || user.espacioTipo !== 'aula') return;
      try {
        socket.emit('pizarra_state', { trazos: await trazosVisibles(user.espacioId) });
      } catch (err) {
        log.error('Error al leer la pizarra', err);
      }
    });

    on('save_pizarra', 'save_pizarra', async (data: {
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
        log.error('Error al guardar pizarra', err);
        socket.emit('pizarra_saved_status', { success: false, error: 'DB_ERROR' });
      }
    });

    // Solicitud de acceso a un aula por un estudiante
    on('solicitar_acceso_aula', 'solicitar_acceso_aula', (data: {
      espacioId: string;
      temaClase?: string;
    }) => {
      if (identidad.esInvitado) return;
      // Quien solicita es el usuario del token, no el que diga el payload.
      const usuario = { id: identidad.userId, nombre: identidad.nombre };
      log.info('solicitud de acceso al aula', { usuarioId: identidad.userId || null, espacioId: data.espacioId });
      // Emitir a todos los docentes EXCEPTO al propio remitente
      socket.broadcast.emit('nueva_solicitud_acceso', {
        estudianteSocketId: socket.id,
        usuario,
        espacioId: data.espacioId,
        temaClase: data.temaClase,
      });
    });

    // "Silenciar a todos" del docente (VOZ-04): pide a cada alumno del aula
    // que apague su micrófono. Cada uno puede volver a activarlo; no es un
    // bloqueo, es la forma de cortar el ruido de fondo al empezar la clase.
    on('silenciar_todos', 'silenciar_todos', () => {
      const user = activeUsers.get(socket.id);
      if (!user || user.espacioTipo !== 'aula' || !esDocenteOAdmin(identidad.roles)) return;
      activeUsers.forEach((otro, sid) => {
        if (sid !== socket.id && otro.espacioId === user.espacioId && !esDocenteOAdmin(otro.roles)) {
          io.to(sid).emit('silenciado_por_docente', { por: identidad.nombre });
        }
      });
    });

    // Levantar la mano y ceder la palabra (AULA-03). Los alumnos piden turno;
    // el docente (o admin) cede la palabra, y quien la tiene difunde su voz a
    // toda el aula hasta que la devuelve o el docente se la quita.
    on('levantar_mano', 'preguntas', () => {
      const user = activeUsers.get(socket.id);
      if (!user || user.espacioTipo !== 'aula' || esDocenteOAdmin(identidad.roles)) return;
      const nuevo = { socketId: socket.id, userId: user.userId, nombre: user.nombreVisible, desde: Date.now() };
      if (levantarMano(user.espacioId, nuevo)) emitirPreguntas(user.espacioId);
    });

    on('bajar_mano', 'preguntas', () => {
      const user = activeUsers.get(socket.id);
      if (user && bajarMano(user.espacioId, socket.id)) emitirPreguntas(user.espacioId);
    });

    on('ceder_palabra', 'preguntas', (data: { socketId?: unknown }) => {
      const user = activeUsers.get(socket.id);
      if (!user || user.espacioTipo !== 'aula' || !esDocenteOAdmin(identidad.roles)) return;
      const destinoId = String(data?.socketId ?? '');
      const destino = activeUsers.get(destinoId);
      if (!destino || destino.espacioId !== user.espacioId) return;
      cederPalabra(user.espacioId, {
        socketId: destinoId,
        userId: destino.userId,
        nombre: destino.nombreVisible,
        peerId: destino.peerId || '',
      });
      emitirPreguntas(user.espacioId);
    });

    // La devuelve quien la tiene, o se la quita el docente
    on('quitar_palabra', 'preguntas', () => {
      const user = activeUsers.get(socket.id);
      if (!user) return;
      const actual = quienTienePalabra(user.espacioId);
      if (!actual || (actual.socketId !== socket.id && !esDocenteOAdmin(identidad.roles))) return;
      if (quitarPalabra(user.espacioId)) emitirPreguntas(user.espacioId);
    });

    // Trabajo en grupos (AULA-07): sólo docente o admin, sólo en un aula
    on('encuesta_crear', 'encuestas', async (data: { pregunta?: unknown; opciones?: unknown }) => {
      const user = activeUsers.get(socket.id);
      if (!user || user.espacioTipo !== 'aula' || !esDocenteOAdmin(identidad.roles)) return;
      const valida = validarEncuesta(data ?? {});
      if (!valida.ok) return void socket.emit('encuesta_rechazada', { motivo: valida.motivo });
      try {
        await crearEncuesta(user.espacioId, identidad.userId || null, valida.pregunta, valida.opciones);
        await bitacora(identidad.userId || null, 'crear_encuesta', valida.pregunta.slice(0, 200));
        await emitirEncuesta(user.espacioId);
      } catch (err) {
        console.error('Error al crear encuesta:', err);
        socket.emit('encuesta_rechazada', { motivo: 'No se pudo crear la encuesta.' });
      }
    });

    on('encuesta_votar', 'encuestas', async (data: { encuestaId?: unknown; opcion?: unknown }) => {
      const user = activeUsers.get(socket.id);
      if (!user || user.espacioTipo !== 'aula' || !identidad.userId) return;
      const encuestaId = Number(data?.encuestaId);
      const opcion = Number(data?.opcion);
      if (!Number.isInteger(encuestaId) || !Number.isInteger(opcion) || opcion < 0 || opcion >= MAX_OPCIONES) return;
      try {
        if (await votar(user.espacioId, encuestaId, identidad.userId, opcion)) await emitirEncuesta(user.espacioId);
      } catch (err) {
        console.error('Error al votar:', err);
      }
    });

    on('encuesta_cerrar', 'encuestas', async () => {
      const user = activeUsers.get(socket.id);
      if (!user || user.espacioTipo !== 'aula' || !esDocenteOAdmin(identidad.roles)) return;
      try {
        if (await cerrarEncuesta(user.espacioId)) await emitirEncuesta(user.espacioId);
      } catch (err) {
        console.error('Error al cerrar encuesta:', err);
      }
    });

    // Grabación de la clase como acta (AULA-04): sólo con una clase en curso
    on('grabacion', 'grabacion', async (data: { activa?: unknown }) => {
      const user = activeUsers.get(socket.id);
      if (!user || user.espacioTipo !== 'aula' || !esDocenteOAdmin(identidad.roles)) return;
      try {
        if (data?.activa === true) {
          if (!(await iniciarGrabacion(user.espacioId, identidad.userId || null, identidad.nombre))) {
            return void socket.emit('grabacion_rechazada', { motivo: 'Inicia la clase antes de grabarla.' });
          }
        } else {
          await detenerGrabacion(user.espacioId);
        }
        io.to(String(user.espacioId)).emit('grabacion_estado', estadoGrabacion(user.espacioId));
      } catch (err) {
        console.error('Error al cambiar la grabación:', err);
      }
    });

    on('modo_grupos', 'preguntas', (data: { activo?: unknown }) => {
      const user = activeUsers.get(socket.id);
      if (!user || user.espacioTipo !== 'aula' || !esDocenteOAdmin(identidad.roles)) return;
      const activo = data?.activo === true;
      if (activo) aulasEnGrupos.add(user.espacioId);
      else aulasEnGrupos.delete(user.espacioId);
      io.to(String(user.espacioId)).emit('modo_grupos', { activo, por: user.nombreVisible });
    });

    // Compartir pantalla (AULA-01, decisión 0002): el docente sube una imagen
    // cuando su pantalla cambia y el servidor la reenvía al aula. volatile:
    // a quien tiene la conexión saturada se le saltan cuadros, no se acumulan.
    on('pantalla_iniciar', 'pantalla', () => {
      const user = activeUsers.get(socket.id);
      if (!user || user.espacioTipo !== 'aula' || !esDocenteOAdmin(identidad.roles)) return;
      if (!iniciarPantalla(user.espacioId, socket.id, user.nombreVisible)) {
        socket.emit('pantalla_rechazada', { motivo: 'Otra persona ya está compartiendo su pantalla en esta aula.' });
        return;
      }
      io.to(String(user.espacioId)).emit('pantalla_estado', estadoPantalla(user.espacioId));
    });

    on('pantalla_cuadro', 'pantalla_cuadro', (datos: unknown) => {
      const user = activeUsers.get(socket.id);
      if (!user || !esCuadroValido(datos)) return;
      if (guardarCuadro(user.espacioId, socket.id, datos)) {
        socket.to(String(user.espacioId)).volatile.emit('pantalla_cuadro', datos);
        grabarCaptura(user.espacioId, user.nombreVisible, datos).catch((err) => console.error('Error al grabar captura:', err));
      }
    });

    on('pantalla_detener', 'pantalla', () => {
      const user = activeUsers.get(socket.id);
      if (user && detenerPantalla(user.espacioId, socket.id)) {
        io.to(String(user.espacioId)).emit('pantalla_estado', estadoPantalla(user.espacioId));
      }
    });

    // Respuesta del docente a la solicitud de acceso
    on('responder_solicitud_acceso', 'responder_solicitud_acceso', (data: {
      estudianteSocketId: string;
      espacioId: string;
      aprobado: boolean;
    }) => {
      if (!esDocenteOAdmin(identidad.roles)) return;
      log.info('solicitud de acceso respondida', { socketId: data.estudianteSocketId, aprobado: !!data.aprobado });
      // El pase es para el usuario de ese socket según su token, no según el
      // payload: el docente aprueba a una persona, no a un número de socket
      const estudiante: Identidad | undefined = io.sockets.sockets.get(data.estudianteSocketId)?.data.identidad;
      const espacioId = Number(data.espacioId);
      if (data.aprobado === true && estudiante?.userId && Number.isInteger(espacioId)) {
        pases.otorgar(estudiante.userId, espacioId);
      }
      io.to(data.estudianteSocketId).emit('respuesta_solicitud_acceso', {
        espacioId: data.espacioId,
        aprobado: data.aprobado,
      });
    });

    on('clase_iniciada', 'clase_iniciada', (sesion: any) => {
      if (!esDocenteOAdmin(identidad.roles)) return;
      log.info('clase iniciada', { sesionId: sesion?.id, espacioId: sesion?.espacio_id });
      io.emit('clase_iniciada', sesion);
    });

    on('clase_finalizada', 'clase_finalizada', (data: { espacioId: string }) => {
      if (!esDocenteOAdmin(identidad.roles)) return;
      log.info('clase finalizada', { espacioId: data.espacioId });
      io.emit('clase_finalizada', data);
    });

    const handleSendChat = async (data: {
      message: { sender: string; text: string };
    }) => {
      const user = activeUsers.get(socket.id);
      if (!user) return;
      const saneado = sanearTextoChat(data?.message?.text);
      if (!saneado.ok) {
        socket.emit('chat_rechazado', { motivo: saneado.motivo });
        return;
      }
      // Campos cerrados: el remitente lo pone el servidor (nadie escribe en
      // nombre de otro) y ningun campo extra del cliente llega a los demas.
      // Se guarda antes de difundir (A11Y-02) para que el mensaje viaje con su
      // id: el cliente lo usa para no duplicarlo al recibir el historial.
      // Si la base falla, igual se difunde: el chat en vivo no depende de ella.
      const message: MensajeChat = await guardarMensaje(user.espacioId, identidad.userId || null, identidad.nombre, saneado.texto).catch((err) => {
        log.error('Error al guardar mensaje de chat', err);
        return { sender: identidad.nombre, text: saneado.texto, enviadoEn: new Date().toISOString() };
      });
      io.to(String(user.espacioId)).emit('chat_message', message);
      io.to(String(user.espacioId)).emit('chat_msg_received', message);
    };

    // Subtítulos en vivo (A11Y-01): quien habla manda su propia transcripción
    // y se difunde al resto del espacio con el nombre del token. No se guarda.
    on('subtitulo', 'subtitulo', (data: { texto?: unknown; final?: unknown }) => {
      const user = activeUsers.get(socket.id);
      if (!user) return;
      const saneado = sanearTextoChat(data?.texto);
      if (!saneado.ok) return;
      const texto = saneado.texto.slice(0, MAX_LARGO_SUBTITULO);
      socket.to(String(user.espacioId)).emit('subtitulo', {
        socketId: socket.id,
        nombre: identidad.nombre,
        texto,
        final: data?.final === true,
      });
      // Con la clase grabándose, las frases terminadas quedan en el acta (AULA-04)
      if (data?.final === true) {
        grabarSubtitulo(user.espacioId, identidad.nombre, texto).catch((err) => console.error('Error al grabar subtítulo:', err));
      }
    });

    on('send_chat', 'chat', handleSendChat);
    on('chat_msg_send', 'chat', handleSendChat);

    socket.on('disconnect', async () => {
      const user = activeUsers.get(socket.id);
      if (user) {
        log.info('socket desconectado', { socketId: socket.id, usuarioId: user.userId || null, espacioId: user.espacioId });
        socket.to(String(user.espacioId)).emit('user_left', { socketId: socket.id, userId: user.userId });
        activeUsers.delete(socket.id);
        conPosicionReal.delete(socket.id);
        dejarAula(user.espacioId, socket.id);
        // Un trazo a medias se guarda con lo que alcanzó a dibujar
        await cerrarTrazosDe(socket.id).catch((err) => log.error('Error al cerrar trazos', err));
        await registrarSalida(user.userId, user.espacioId);
        if (user.espacioTipo === 'campus') {
          await actualizarUltimaPosicion(user.userId, user.position, user.rotation);
        }
      }
    });
  });
}
