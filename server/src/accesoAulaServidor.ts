// Ruta del código de aula (SEC-08). Las reglas de acceso están en accesoAula.ts.
import type { Express } from 'express';
import { pool } from './db.js';
import { authenticateJWT } from './middleware/auth.js';
import { limiteCodigoAula } from './limites.js';
import { bitacora } from './helpers.js';
import { log } from './registro.js';
import { pases, codigoCoincide } from './accesoAula.js';

export function registrarRutasAccesoAula(app: Express) {
  // Con el código correcto, además del pase, el estudiante queda inscrito en
  // la asignatura: así figura en el tablero de asistencia y ve sus materiales.
  app.post('/api/espacios/:id/acceso', limiteCodigoAula, authenticateJWT, async (req: any, res) => {
    const { userId, isGuest } = req.user;
    const espacioId = Number(req.params.id);
    if (isGuest || !userId) return res.status(403).json({ error: 'Los invitados solo pueden acceder al campus.' });
    if (!Number.isInteger(espacioId)) return res.status(400).json({ error: 'Aula inválida' });
    try {
      const { rows } = await pool.query(
        `SELECT a.id AS asignatura_id, a.codigo
         FROM espacios e LEFT JOIN asignaturas a ON a.id = e.asignatura_id
         WHERE e.id = $1 AND e.tipo = 'aula' AND e.activo = TRUE`,
        [espacioId]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'El aula no existe o no está activa.' });
      const { asignatura_id, codigo } = rows[0];
      if (!codigo) {
        return res.status(409).json({ error: 'Esta aula todavía no tiene un curso. Pide acceso al docente.' });
      }
      if (!codigoCoincide(req.body?.codigo, codigo)) {
        await bitacora(userId, 'codigo_aula_incorrecto', `Aula ${espacioId}`, req.ip || '');
        return res.status(403).json({ error: 'Código incorrecto. Pídeselo a tu docente.' });
      }
      await pool.query(
        `INSERT INTO inscripciones (usuario_id, asignatura_id)
         SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM perfiles_estudiante WHERE usuario_id = $1)
         ON CONFLICT DO NOTHING`,
        [userId, asignatura_id]
      );
      pases.otorgar(userId, espacioId);
      res.json({ ok: true });
    } catch (err) {
      log.error('Error al validar el código del aula', err);
      res.status(500).json({ error: 'Error al validar el código' });
    }
  });
}
