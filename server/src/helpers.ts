import { pool } from './db.js';

export async function registrarAsistencia(userId: number, espacioId: number) {
  try {
    const res = await pool.query(
      `SELECT id, COALESCE(inicio_real, inicio_programado) AS inicio, tolerancia_min
       FROM sesiones_clase
       WHERE espacio_id = $1 AND estado IN ('en_curso', 'programada')
       ORDER BY inicio_programado ASC LIMIT 1`,
      [espacioId]
    );

    if (res.rows.length === 0) return null;

    const clase = res.rows[0];
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
