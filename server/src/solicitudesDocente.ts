// Solicitudes de rol docente (SEC-07). El registro público sólo crea
// estudiantes: si cualquiera pudiera registrarse como docente, cualquiera
// podría ocupar aulas, iniciar clases y ver reportes de asistencia. Quien se
// registra como docente deja acá su pedido y un administrador lo resuelve.
import type { Express } from 'express';
import { pool, enTransaccion } from './db.js';
import { authenticateJWT, requiereAdmin } from './middleware/auth.js';
import { bitacora } from './helpers.js';
import { log } from './registro.js';

export function registrarRutasSolicitudesDocente(app: Express) {
  app.get('/api/admin/solicitudes-docente', authenticateJWT, requiereAdmin, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT s.usuario_id, s.creada_en, u.email, u.nombre, u.apellido
         FROM solicitudes_docente s JOIN usuarios u ON u.id = s.usuario_id
         WHERE s.estado = 'pendiente'
         ORDER BY s.creada_en`
      );
      res.json(rows);
    } catch (err) {
      log.error('Error al listar solicitudes de docente', err);
      res.status(500).json({ error: 'Error al listar solicitudes de docente' });
    }
  });

  // Aprobar: el estudiante pasa a docente (con su perfil). Rechazar: sigue
  // como estudiante. En los dos casos la solicitud queda resuelta.
  app.post('/api/admin/solicitudes-docente/:usuarioId', authenticateJWT, requiereAdmin, async (req: any, res) => {
    const usuarioId = Number(req.params.usuarioId);
    const aprobar = req.body?.aprobar === true;
    if (!Number.isInteger(usuarioId)) return res.status(400).json({ error: 'Usuario inválido' });
    try {
      const resuelta = await enTransaccion(async (client) => {
        const { rowCount } = await client.query(
          `UPDATE solicitudes_docente SET estado = $2, resuelta_por = $3, resuelta_en = NOW()
           WHERE usuario_id = $1 AND estado = 'pendiente'`,
          [usuarioId, aprobar ? 'aprobada' : 'rechazada', req.user!.userId]
        );
        if (!rowCount) return false;
        if (aprobar) {
          await client.query(
            `DELETE FROM usuario_roles WHERE usuario_id = $1 AND rol_id = (SELECT id FROM roles WHERE nombre = 'estudiante')`,
            [usuarioId]
          );
          await client.query(
            `INSERT INTO usuario_roles (usuario_id, rol_id, asignado_por)
             SELECT $1, id, $2 FROM roles WHERE nombre = 'docente'
             ON CONFLICT DO NOTHING`,
            [usuarioId, req.user!.userId]
          );
          await client.query('INSERT INTO perfiles_docente (usuario_id) VALUES ($1) ON CONFLICT DO NOTHING', [usuarioId]);
        }
        return true;
      });
      if (!resuelta) return res.status(404).json({ error: 'No hay una solicitud pendiente de ese usuario' });
      await bitacora(
        req.user!.userId,
        aprobar ? 'aprobar_docente' : 'rechazar_docente',
        `${aprobar ? 'Aprobó' : 'Rechazó'} la solicitud de docente del usuario ID ${usuarioId}`,
        req.ip || ''
      );
      res.json({ ok: true, aprobada: aprobar });
    } catch (err) {
      log.error('Error al resolver solicitud de docente', err);
      res.status(500).json({ error: 'Error al resolver la solicitud' });
    }
  });
}
