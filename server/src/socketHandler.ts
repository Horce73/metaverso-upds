import { Server, Socket } from 'socket.io';
import { pool, mockDb, isUsingMock } from './db.js';

interface UserState {
  userId: string;
  nombreVisible: string;
  espacioId: string;
  position: [number, number, number];
  rotation: [number, number, number];
  apariencia: any;
  peerId?: string; // Para WebRTC VoIP
}

// Registro de usuarios conectados en memoria por socket.id
const activeUsers = new Map<string, UserState>();

export function setupSockets(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log(`🔌 Cliente conectado: ${socket.id}`);

    // Unirse a un espacio 3D (Campus Central o un Aula)
    socket.on('join_space', async (data: {
      userId: string;
      nombreVisible: string;
      espacioId: string;
      apariencia: any;
      peerId?: string;
    }) => {
      const { userId, nombreVisible, espacioId, apariencia, peerId } = data;

      // Abandonar espacio anterior si existía
      const prevUser = activeUsers.get(socket.id);
      if (prevUser) {
        socket.leave(prevUser.espacioId);
        socket.to(prevUser.espacioId).emit('user_left', { socketId: socket.id, userId: prevUser.userId });
      }

      // Configurar estado del usuario
      const userState: UserState = {
        userId,
        nombreVisible,
        espacioId,
        position: [0, 0.5, 0], // Posición inicial por defecto
        rotation: [0, 0, 0],
        apariencia,
        peerId
      };

      activeUsers.set(socket.id, userState);
      socket.join(espacioId);

      // 1. Enviar la lista de usuarios actuales al recién llegado
      const usersInSpace: { [socketId: string]: UserState } = {};
      activeUsers.forEach((user, sid) => {
        if (user.espacioId === espacioId && sid !== socket.id) {
          usersInSpace[sid] = user;
        }
      });
      socket.emit('space_users', usersInSpace);

      // 2. Notificar a los demás que este usuario se unió
      socket.to(espacioId).emit('user_joined', {
        socketId: socket.id,
        user: userState
      });

      console.log(`👤 ${nombreVisible} (${userId}) se unió al espacio ${espacioId}`);

      // 3. Registrar Asistencia Automática (RF-05) si es un aula
      await registrarAsistencia(userId, espacioId);
    });

    // Movimiento del avatar
    socket.on('move', (data: {
      position: [number, number, number];
      rotation: [number, number, number];
    }) => {
      const user = activeUsers.get(socket.id);
      if (user) {
        user.position = data.position;
        user.rotation = data.rotation;
        // Retransmitir a todos en el espacio excepto a mí mismo
        socket.to(user.espacioId).emit('user_moved', {
          socketId: socket.id,
          position: user.position,
          rotation: user.rotation
        });
      }
    });

    // Pizarra Digital: Compartir trazo (RF-04)
    socket.on('draw_stroke', (data: {
      espacioId: string;
      stroke: any;
    }) => {
      // Retransmitir trazo en tiempo real a los demás en la sala
      socket.to(data.espacioId).emit('stroke_received', data.stroke);
    });

    // Limpiar pizarra
    socket.on('clear_board', (data: { espacioId: string }) => {
      socket.to(data.espacioId).emit('board_cleared');
    });

    // Guardar snapshot de la pizarra en BD (para el profesor)
    socket.on('save_pizarra', async (data: {
      sesionId: string;
      trazos: any[];
    }) => {
      const { sesionId, trazos } = data;
      try {
        if (isUsingMock()) {
          const snapshot = {
            id: `snap-${Date.now()}`,
            sesion_id: sesionId,
            trazos,
            guardado_en: new Date()
          };
          mockDb.pizarra_snapshots.push(snapshot);
        } else {
          await pool.query(
            'INSERT INTO pizarra_snapshots (sesion_id, trazos) VALUES ($1, $2)',
            [sesionId, JSON.stringify(trazos)]
          );
        }
        socket.emit('pizarra_saved_status', { success: true });
      } catch (err) {
        console.error('Error al guardar pizarra:', err);
        socket.emit('pizarra_saved_status', { success: false, error: 'DB_ERROR' });
      }
    });

    // Desconexión
    socket.on('disconnect', async () => {
      const user = activeUsers.get(socket.id);
      if (user) {
        console.log(`🔌 Cliente desconectado: ${user.nombreVisible} (${socket.id})`);
        socket.to(user.espacioId).emit('user_left', { socketId: socket.id, userId: user.userId });
        activeUsers.delete(socket.id);

        // Registrar hora de salida para la asistencia
        await registrarSalida(user.userId, user.espacioId);
      }
    });
  });
}

// Helper: Registrar Asistencia automática
async function registrarAsistencia(userId: string, espacioId: string) {
  try {
    // Buscar si hay una sesión de clase activa en curso para este espacio
    let claseActiva: any = null;

    if (isUsingMock()) {
      // En modo mock buscamos una sesión programada o en curso para este espacio
      claseActiva = mockDb.sesiones_clase.find(
        (s: any) => s.espacio_id === espacioId && (s.estado === 'en_curso' || s.estado === 'programada')
      );
    } else {
      const res = await pool.query(
        `SELECT id, inicio_programado, tolerancia_min 
         FROM sesiones_clase 
         WHERE espacio_id = $1 AND estado IN ('en_curso', 'programada')
         ORDER BY inicio_programado ASC LIMIT 1`,
        [espacioId]
      );
      if (res.rows.length > 0) {
        claseActiva = res.rows[0];
      }
    }

    if (!claseActiva) {
      // No hay clase activa para este aula, no se registra asistencia
      return;
    }

    // Determinar el estado de asistencia (presente o tarde)
    const ahora = new Date();
    const inicio = new Date(claseActiva.inicio_programado || claseActiva.inicio_real || ahora);
    const limiteTarde = new Date(inicio.getTime() + (claseActiva.tolerancia_min || 10) * 60000);
    const estadoAsistencia = ahora > limiteTarde ? 'tarde' : 'presente';

    if (isUsingMock()) {
      // Verificar si ya existe asistencia
      const existe = mockDb.asistencias.find(
        (a: any) => a.sesion_id === claseActiva.id && a.usuario_id === userId
      );
      if (!existe) {
        mockDb.asistencias.push({
          id: `asist-${Date.now()}`,
          sesion_id: claseActiva.id,
          usuario_id: userId,
          hora_ingreso: ahora,
          hora_salida: null,
          estado: estadoAsistencia
        });
        console.log(`📝 [MOCK] Asistencia registrada para ${userId} como: ${estadoAsistencia}`);
      }
    } else {
      // En PostgreSQL, insertamos con ON CONFLICT DO NOTHING (para evitar duplicados por re-conexiones rápidas)
      await pool.query(
        `INSERT INTO asistencias (sesion_id, usuario_id, hora_ingreso, estado)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (sesion_id, usuario_id) DO NOTHING`,
        [claseActiva.id, userId, ahora, estadoAsistencia]
      );
      console.log(`📝 [POSTGRES] Asistencia registrada para ${userId} como: ${estadoAsistencia}`);
    }
  } catch (err) {
    console.error('Error al registrar asistencia:', err);
  }
}

// Helper: Registrar Hora de Salida
async function registrarSalida(userId: string, espacioId: string) {
  try {
    let claseActiva: any = null;

    if (isUsingMock()) {
      claseActiva = mockDb.sesiones_clase.find(
        (s: any) => s.espacio_id === espacioId && (s.estado === 'en_curso' || s.estado === 'programada')
      );
    } else {
      const res = await pool.query(
        `SELECT id FROM sesiones_clase 
         WHERE espacio_id = $1 AND estado IN ('en_curso', 'programada')
         ORDER BY inicio_programado ASC LIMIT 1`,
        [espacioId]
      );
      if (res.rows.length > 0) {
        claseActiva = res.rows[0];
      }
    }

    if (!claseActiva) return;

    const ahora = new Date();
    if (isUsingMock()) {
      const asistenciaIndex = mockDb.asistencias.findIndex(
        (a: any) => a.sesion_id === claseActiva.id && a.usuario_id === userId
      );
      if (asistenciaIndex !== -1) {
        mockDb.asistencias[asistenciaIndex].hora_salida = ahora;
        console.log(`📝 [MOCK] Hora de salida registrada para ${userId}`);
      }
    } else {
      await pool.query(
        `UPDATE asistencias 
         SET hora_salida = $1 
         WHERE sesion_id = $2 AND usuario_id = $3`,
        [ahora, claseActiva.id, userId]
      );
      console.log(`📝 [POSTGRES] Hora de salida registrada para ${userId}`);
    }
  } catch (err) {
    console.error('Error al registrar salida:', err);
  }
}
