// Tablero de asistencia y exportación (DATA-01/02). La asistencia se
// registra sola al entrar al aula (helpers.registrarAsistencia); acá se
// consulta por asignatura (todas las clases del semestre) o por sesión, en
// JSON para el panel del docente o en CSV con ?formato=csv.
import type { Express } from 'express';
import { pool } from './db.js';
import { authenticateJWT } from './middleware/auth.js';
import { bitacora } from './helpers.js';
import { armarTablero, fechaHora } from './asistencia.js';
import { aCsv, nombreArchivo, type Celda } from './csv.js';

const ZONA_HORARIA = process.env.ZONA_HORARIA || 'America/La_Paz';

// Las sesiones guardan su asignatura desde DATA-01; las anteriores la toman
// del aula. Sólo cuentan las clases que efectivamente se dictaron.
const SQL_SESIONES = `
  SELECT sc.id, sc.tema, COALESCE(sc.inicio_real, sc.inicio_programado) AS inicio,
         CASE WHEN sc.estado = 'finalizada' THEN COALESCE(sc.fin_real, sc.fin_programado) END AS fin,
         sc.estado
  FROM sesiones_clase sc
  JOIN espacios e ON e.id = sc.espacio_id
  WHERE COALESCE(sc.asignatura_id, e.asignatura_id) = $1
    AND sc.estado IN ('en_curso', 'finalizada')`;

async function esAdmin(userId: number): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id
     WHERE ur.usuario_id = $1 AND r.nombre = 'administrador'`,
    [userId]
  );
  return rows.length > 0;
}

/** El titular de la asignatura, quien dictó alguna de sus clases, o un administrador. */
export async function puedeVerAsignatura(userId: number, asignaturaId: number): Promise<boolean> {
  if (await esAdmin(userId)) return true;
  const { rows } = await pool.query(
    `SELECT 1 FROM asignaturas WHERE id = $1 AND docente_id = $2
     UNION ALL
     SELECT 1 FROM sesiones_clase sc JOIN espacios e ON e.id = sc.espacio_id
     WHERE COALESCE(sc.asignatura_id, e.asignatura_id) = $1 AND sc.docente_id = $2
     LIMIT 1`,
    [asignaturaId, userId]
  );
  return rows.length > 0;
}

async function datosTablero(asignaturaId: number, soloSesion?: number) {
  const sesiones = (
    await pool.query(`${SQL_SESIONES} ${soloSesion ? 'AND sc.id = $2' : ''} ORDER BY inicio ASC`, soloSesion ? [asignaturaId, soloSesion] : [asignaturaId])
  ).rows;
  const estudiantes = (
    await pool.query(
      `SELECT u.id, pe.registro_upds, u.nombre, u.apellido
       FROM inscripciones i
       JOIN usuarios u ON u.id = i.usuario_id
       LEFT JOIN perfiles_estudiante pe ON pe.usuario_id = u.id
       WHERE i.asignatura_id = $1
       ORDER BY u.apellido ASC, u.nombre ASC`,
      [asignaturaId]
    )
  ).rows;
  const idsSesiones = sesiones.map((s) => s.id);
  const asistencias = (
    await pool.query('SELECT id, sesion_id, usuario_id, estado FROM asistencias WHERE sesion_id = ANY($1::int[])', [idsSesiones])
  ).rows;
  const tramos = (
    await pool.query(
      `SELECT t.asistencia_id, t.entrada, t.salida
       FROM asistencia_tramos t JOIN asistencias a ON a.id = t.asistencia_id
       WHERE a.sesion_id = ANY($1::int[])`,
      [idsSesiones]
    )
  ).rows;
  return armarTablero(sesiones, estudiantes, asistencias, tramos, new Date());
}

const SIGLA: Record<string, string> = { presente: 'P', tarde: 'T', ausente: 'A' };

function enviarCsv(res: any, nombre: string, encabezados: string[], filas: Celda[][]) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo(nombre)}"`);
  res.send(aCsv(encabezados, filas));
}

export function registrarRutasAsistencia(app: Express) {
  // Asignaturas cuya asistencia puede ver quien consulta
  app.get('/api/asistencia/asignaturas', authenticateJWT, async (req: any, res) => {
    const { userId } = req.user;
    try {
      const admin = await esAdmin(userId);
      const { rows } = await pool.query(
        `SELECT a.id, a.codigo, a.nombre, a.gestion,
                (SELECT COUNT(*)::int FROM inscripciones i WHERE i.asignatura_id = a.id) AS inscritos,
                (SELECT COUNT(*)::int FROM sesiones_clase sc JOIN espacios e ON e.id = sc.espacio_id
                 WHERE COALESCE(sc.asignatura_id, e.asignatura_id) = a.id
                   AND sc.estado IN ('en_curso', 'finalizada')) AS sesiones
         FROM asignaturas a
         WHERE $1::boolean OR a.docente_id = $2 OR EXISTS (
           SELECT 1 FROM sesiones_clase sc JOIN espacios e ON e.id = sc.espacio_id
           WHERE COALESCE(sc.asignatura_id, e.asignatura_id) = a.id AND sc.docente_id = $2)
         ORDER BY a.gestion DESC, a.nombre ASC`,
        [admin, userId]
      );
      res.json(rows);
    } catch (err) {
      console.error('Error al listar asignaturas con asistencia:', err);
      res.status(500).json({ error: 'Error de servidor' });
    }
  });

  // Semestre completo: estudiantes × clases dictadas
  app.get('/api/asistencia/asignaturas/:id', authenticateJWT, async (req: any, res) => {
    const { userId } = req.user;
    const asignaturaId = Number(req.params.id);
    if (!Number.isInteger(asignaturaId)) return res.status(400).json({ error: 'Asignatura inválida' });
    try {
      const asignatura = (await pool.query('SELECT id, codigo, nombre, gestion FROM asignaturas WHERE id = $1', [asignaturaId])).rows[0];
      if (!asignatura) return res.status(404).json({ error: 'Asignatura no encontrada' });
      if (!(await puedeVerAsignatura(userId, asignaturaId))) {
        return res.status(403).json({ error: 'Sólo el docente de la asignatura o un administrador' });
      }
      const tablero = await datosTablero(asignaturaId);

      if (req.query.formato === 'csv') {
        await bitacora(userId, 'exportar_asistencia', `asignatura=${asignaturaId}`, req.ip);
        const encabezados = ['Registro', 'Apellido', 'Nombre', 'Presentes', 'Tardes', 'Ausencias', '% Asistencia', 'Minutos totales'];
        for (const s of tablero.sesiones) {
          // Con fecha y hora: dos clases el mismo día con el mismo tema no
          // deben dar dos columnas iguales
          const cuando = fechaHora(s.inicio, ZONA_HORARIA);
          encabezados.push(`${cuando} ${s.tema ?? ''}`.trim(), `${cuando} minutos`);
        }
        const filas = tablero.estudiantes.map((e) => [
          e.registro_upds,
          e.apellido,
          e.nombre,
          e.presentes,
          e.tardes,
          e.ausencias,
          e.porcentaje_asistencia,
          e.minutos_total,
          ...tablero.sesiones.flatMap((s) => {
            const c = tablero.celdas[e.id][s.id];
            return [SIGLA[c.estado], c.minutos];
          }),
        ]);
        return enviarCsv(res, `asistencia_${asignatura.codigo}_${asignatura.gestion}`, encabezados, filas);
      }

      await bitacora(userId, 'consulta_asistencia', `asignatura=${asignaturaId}`, req.ip);
      res.json({ asignatura, ...tablero });
    } catch (err) {
      console.error('Error al armar el tablero de asistencia:', err);
      res.status(500).json({ error: 'Error de servidor' });
    }
  });

  // Una clase: quién vino, a qué hora y cuántos minutos estuvo
  app.get('/api/asistencia/sesiones/:id', authenticateJWT, async (req: any, res) => {
    const { userId } = req.user;
    const sesionId = Number(req.params.id);
    if (!Number.isInteger(sesionId)) return res.status(400).json({ error: 'Sesión inválida' });
    try {
      const sesion = (
        await pool.query(
          `SELECT sc.id, COALESCE(sc.asignatura_id, e.asignatura_id) AS asignatura_id
           FROM sesiones_clase sc JOIN espacios e ON e.id = sc.espacio_id WHERE sc.id = $1`,
          [sesionId]
        )
      ).rows[0];
      if (!sesion?.asignatura_id) return res.status(404).json({ error: 'Sesión no encontrada' });
      if (!(await puedeVerAsignatura(userId, sesion.asignatura_id))) {
        return res.status(403).json({ error: 'Sólo el docente de la asignatura o un administrador' });
      }
      const tablero = await datosTablero(sesion.asignatura_id, sesionId);
      const resumen = tablero.sesiones[0];
      if (!resumen) return res.status(404).json({ error: 'La clase todavía no se dictó' });

      // Primera entrada y última salida de cada uno, para el detalle
      const horarios = new Map<number, { entrada: Date; salida: Date | null }>(
        (
          await pool.query(
            `SELECT a.usuario_id, MIN(t.entrada) AS entrada,
                    CASE WHEN BOOL_OR(t.salida IS NULL) THEN NULL ELSE MAX(t.salida) END AS salida
             FROM asistencias a JOIN asistencia_tramos t ON t.asistencia_id = a.id
             WHERE a.sesion_id = $1 GROUP BY a.usuario_id`,
            [sesionId]
          )
        ).rows.map((r) => [r.usuario_id, { entrada: r.entrada, salida: r.salida }])
      );
      const filas = tablero.estudiantes.map((e) => ({
        id: e.id,
        registro_upds: e.registro_upds,
        nombre: e.nombre,
        apellido: e.apellido,
        ...tablero.celdas[e.id][sesionId],
        entrada: horarios.get(e.id)?.entrada ?? null,
        salida: horarios.get(e.id)?.salida ?? null,
      }));

      if (req.query.formato === 'csv') {
        await bitacora(userId, 'exportar_asistencia', `sesion=${sesionId}`, req.ip);
        return enviarCsv(
          res,
          `asistencia_sesion_${sesionId}_${fechaHora(resumen.inicio, ZONA_HORARIA).slice(0, 10)}`,
          ['Registro', 'Apellido', 'Nombre', 'Estado', 'Entrada', 'Salida', 'Minutos efectivos'],
          filas.map((f) => [
            f.registro_upds,
            f.apellido,
            f.nombre,
            f.estado,
            fechaHora(f.entrada, ZONA_HORARIA),
            fechaHora(f.salida, ZONA_HORARIA),
            f.minutos,
          ])
        );
      }

      res.json({ sesion: resumen, estudiantes: filas });
    } catch (err) {
      console.error('Error al armar la asistencia de la sesión:', err);
      res.status(500).json({ error: 'Error de servidor' });
    }
  });
}
