import { pool } from './db.js';
import { log } from './registro.js';

// Registrar evento en la bitácora. Nunca hace fallar la petición que lo llama.
export async function bitacora(usuarioId: number | null, evento: string, detalle = '', ip = '') {
  try {
    await pool.query(
      'INSERT INTO bitacora (usuario_id, evento, detalle, ip) VALUES ($1, $2, $3, $4)',
      [usuarioId, evento, detalle, ip]
    );
  } catch (err) {
    log.error('Error al registrar bitacora', err);
  }
}

export async function registrarAsistencia(userId: number, espacioId: number) {
  try {
    const res = await pool.query(
      `SELECT sc.id, COALESCE(sc.inicio_real, sc.inicio_programado) AS inicio,
              sc.tolerancia_min, e.asignatura_id
       FROM sesiones_clase sc
       JOIN espacios e ON e.id = sc.espacio_id
       WHERE sc.espacio_id = $1 AND sc.estado IN ('en_curso', 'programada')
       ORDER BY (sc.estado = 'en_curso') DESC,
                COALESCE(sc.inicio_real, sc.inicio_programado) DESC
       LIMIT 1`,
      [espacioId]
    );

    if (res.rows.length === 0) return null;

    const clase = res.rows[0];

    // Solo estudiantes inscritos en la asignatura del aula pueden registrar asistencia.
    // Evita registros espurios de docentes/administradores que entran al aula
    // (que violarían la FK a perfiles_estudiante) y de estudiantes ajenos a la materia.
    const inscritoRes = await pool.query(
      'SELECT 1 FROM inscripciones WHERE asignatura_id = $1 AND usuario_id = $2',
      [clase.asignatura_id, userId]
    );
    if (inscritoRes.rows.length === 0) {
      return { registrado: false, motivo: 'No estás inscrito en esta asignatura' };
    }

    const ahora = new Date();
    const inicio = new Date(clase.inicio);
    const limiteTarde = new Date(inicio.getTime() + (clase.tolerancia_min || 10) * 60000);
    const estado = ahora > limiteTarde ? 'tarde' : 'presente';

    const result = await pool.query(
      `INSERT INTO asistencias (sesion_id, usuario_id, hora_ingreso, estado)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (sesion_id, usuario_id) DO NOTHING
       RETURNING id, hora_ingreso, estado`,
      [clase.id, userId, ahora, estado]
    );

    if (result.rows.length === 0) {
      // Vuelve a entrar a la misma clase: el estado (presente/tarde) es el de
      // la primera vez, pero abre un tramo nuevo y deja de figurar como salido.
      const existente = await pool.query(
        `UPDATE asistencias SET hora_salida = NULL
         WHERE sesion_id = $1 AND usuario_id = $2
         RETURNING id, hora_ingreso, estado`,
        [clase.id, userId]
      );
      const { id, ...datos } = existente.rows[0];
      await abrirTramo(id);
      return { registrado: false, motivo: 'Ya registrado previamente', ...datos };
    }

    await abrirTramo(result.rows[0].id);
    return { registrado: true, estado, hora_ingreso: result.rows[0].hora_ingreso };
  } catch (err) {
    log.error('Error al registrar asistencia', err);
    return null;
  }
}

// DATA-01: cada entrada al aula es un tramo; la salida lo cierra. Si ya hay
// uno abierto (dos pestañas, reconexión antes del disconnect) no se duplica.
async function abrirTramo(asistenciaId: number) {
  await pool.query(
    `INSERT INTO asistencia_tramos (asistencia_id)
     VALUES ($1)
     ON CONFLICT (asistencia_id) WHERE salida IS NULL DO NOTHING`,
    [asistenciaId]
  );
}

/** Cierra los tramos abiertos de toda una sesión (al finalizar la clase). */
export async function cerrarTramosDeSesion(sesionId: number, db: { query: typeof pool.query } = pool) {
  await db.query(
    `UPDATE asistencia_tramos t SET salida = NOW()
     FROM asistencias a
     WHERE t.asistencia_id = a.id AND a.sesion_id = $1 AND t.salida IS NULL`,
    [sesionId]
  );
}

export async function registrarSalida(userId: number, espacioId: number) {
  try {
    const res = await pool.query(
      `SELECT id FROM sesiones_clase
       WHERE espacio_id = $1 AND estado IN ('en_curso', 'programada')
       ORDER BY (estado = 'en_curso') DESC,
                COALESCE(inicio_real, inicio_programado) DESC
       LIMIT 1`,
      [espacioId]
    );

    if (res.rows.length === 0) return;

    await pool.query(
      `UPDATE asistencias SET hora_salida = NOW()
       WHERE sesion_id = $1 AND usuario_id = $2 AND hora_salida IS NULL`,
      [res.rows[0].id, userId]
    );
    await pool.query(
      `UPDATE asistencia_tramos t SET salida = NOW()
       FROM asistencias a
       WHERE t.asistencia_id = a.id AND a.sesion_id = $1 AND a.usuario_id = $2 AND t.salida IS NULL`,
      [res.rows[0].id, userId]
    );
  } catch (err) {
    log.error('Error al registrar salida', err);
  }
}

export async function actualizarUltimaPosicion(
  userId: number,
  position: [number, number, number],
  rotation: [number, number, number]
) {
  if (!userId) return; // excluye invitados (sin fila en avatares)
  try {
    await pool.query(
      'UPDATE avatares SET ultima_posicion = $2 WHERE usuario_id = $1',
      [userId, JSON.stringify({ position, rotation })]
    );
  } catch (err) {
    log.error('Error al guardar última posición', err);
  }
}
