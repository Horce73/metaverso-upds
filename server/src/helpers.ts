import { pool } from './db.js';

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
      const existente = await pool.query(
        'SELECT hora_ingreso, estado FROM asistencias WHERE sesion_id = $1 AND usuario_id = $2',
        [clase.id, userId]
      );
      return { registrado: false, motivo: 'Ya registrado previamente', ...existente.rows[0] };
    }

    return { registrado: true, estado, hora_ingreso: result.rows[0].hora_ingreso };
  } catch (err) {
    console.error('Error al registrar asistencia:', err);
    return null;
  }
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
  } catch (err) {
    console.error('Error al registrar salida:', err);
  }
}
