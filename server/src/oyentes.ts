import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Express } from 'express';
import type { Server } from 'socket.io';
import { pool } from './db.js';
import { authenticateJWT, firmarToken } from './middleware/auth.js';
import { limiteCanjeOyente } from './limites.js';
import { bitacora } from './helpers.js';
import { log } from './registro.js';

const DURACION_ACCESO_MS = 4 * 60 * 60_000;
const MAX_OYENTES = 100;
const NOMBRE_OYENTE = /^[^\p{Cc}]{2,80}$/u;

interface AccesoOyente {
  id: number;
  sesion_id: number;
  espacio_id: number;
  max_oyentes: number;
  nombre_visible?: string;
}

function hashCredencial(credencial: string): string {
  return createHash('sha256').update(credencial).digest('hex');
}

export async function accesoOyenteVigente(accesoId: number, sesionId: number): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1
     FROM accesos_oyente ao
     JOIN sesiones_clase sc ON sc.id = ao.sesion_id
     WHERE ao.id = $1 AND sc.id = $2
       AND ao.revocado_en IS NULL AND ao.vence_en > NOW()
       AND sc.estado = 'en_curso'`,
    [accesoId, sesionId]
  );
  return rows.length > 0;
}

export async function reservarConexionOyente(
  accesoId: number,
  sesionId: number,
  socketId: string,
  nombreVisible: string
): Promise<{ ok: true; espacioId: number } | { ok: false; motivo: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const acceso = await client.query(
      `SELECT ao.id, ao.sesion_id, ao.max_oyentes, sc.espacio_id
       FROM accesos_oyente ao
       JOIN sesiones_clase sc ON sc.id = ao.sesion_id
       WHERE ao.id = $1 AND sc.id = $2
         AND ao.revocado_en IS NULL AND ao.vence_en > NOW()
         AND sc.estado = 'en_curso'
       FOR UPDATE OF ao`,
      [accesoId, sesionId]
    );
    if (acceso.rows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, motivo: 'El acceso de oyente venció o fue cerrado.' };
    }

    const datos = acceso.rows[0] as AccesoOyente;
    const existente = await client.query(
      'SELECT 1 FROM conexiones_oyente WHERE socket_id = $1 AND desconectado_en IS NULL',
      [socketId]
    );
    if (existente.rows.length === 0) {
      const { rows } = await client.query(
        'SELECT COUNT(*)::int AS cantidad FROM conexiones_oyente WHERE acceso_id = $1 AND desconectado_en IS NULL',
        [accesoId]
      );
      if (rows[0].cantidad >= datos.max_oyentes) {
        await client.query('ROLLBACK');
        return { ok: false, motivo: 'La clase alcanzó el límite de oyentes.' };
      }
    }

    await client.query(
      `INSERT INTO conexiones_oyente (socket_id, acceso_id, nombre_visible)
       VALUES ($1, $2, $3)
       ON CONFLICT (socket_id) DO UPDATE
       SET acceso_id = EXCLUDED.acceso_id,
           nombre_visible = EXCLUDED.nombre_visible,
           conectado_en = NOW(),
           desconectado_en = NULL`,
      [socketId, accesoId, nombreVisible]
    );
    await client.query('COMMIT');
    return { ok: true, espacioId: datos.espacio_id };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function liberarConexionOyente(socketId: string): Promise<void> {
  await pool.query(
    'UPDATE conexiones_oyente SET desconectado_en = NOW() WHERE socket_id = $1 AND desconectado_en IS NULL',
    [socketId]
  );
}

async function revocarAcceso(accesoId: number, io: Server): Promise<void> {
  const { rows } = await pool.query(
    `UPDATE accesos_oyente
     SET revocado_en = COALESCE(revocado_en, NOW())
     WHERE id = $1
     RETURNING id`,
    [accesoId]
  );
  if (rows.length === 0) return;
  const conexiones = await pool.query(
    `UPDATE conexiones_oyente
     SET desconectado_en = COALESCE(desconectado_en, NOW())
     WHERE acceso_id = $1 AND desconectado_en IS NULL
     RETURNING socket_id`,
    [accesoId]
  );
  for (const { socket_id } of conexiones.rows) {
    const socket = io.sockets.sockets.get(socket_id);
    if (socket) {
      socket.emit('oyente_expulsado', { motivo: 'El acceso de oyentes fue cerrado por el docente.' });
      socket.disconnect(true);
    }
  }
}

export async function cerrarAccesosOyenteSesion(sesionId: number, io: Server): Promise<void> {
  const { rows } = await pool.query(
    `SELECT id FROM accesos_oyente
     WHERE sesion_id = $1 AND revocado_en IS NULL`,
    [sesionId]
  );
  for (const acceso of rows) await revocarAcceso(Number(acceso.id), io);
}

async function puedeGestionarSesion(userId: number, sesionId: number) {
  const { rows } = await pool.query(
    `SELECT sc.id, sc.docente_id, sc.estado
     FROM sesiones_clase sc
     WHERE sc.id = $1`,
    [sesionId]
  );
  if (rows.length === 0) return { existe: false, autorizado: false, estado: '' };
  const roles = await pool.query(
    `SELECT r.nombre
     FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id
     WHERE ur.usuario_id = $1`,
    [userId]
  );
  const esAdmin = roles.rows.some((r: { nombre: string }) => r.nombre === 'administrador');
  return {
    existe: true,
    autorizado: esAdmin || Number(rows[0].docente_id) === userId,
    estado: String(rows[0].estado),
  };
}

export function registrarRutasOyentes(app: Express, io: Server) {
  app.get('/api/sesiones/:id/oyentes', authenticateJWT, async (req: any, res) => {
    const sesionId = Number(req.params.id);
    if (!Number.isInteger(sesionId) || sesionId <= 0) return res.status(400).json({ error: 'Sesión inválida.' });
    try {
      const permiso = await puedeGestionarSesion(Number(req.user.userId), sesionId);
      if (!permiso.existe) return res.status(404).json({ error: 'Sesión no encontrada.' });
      if (!permiso.autorizado) return res.status(403).json({ error: 'No puedes gestionar oyentes de esta sesión.' });
      const { rows } = await pool.query(
        `SELECT ao.id, ao.max_oyentes, ao.vence_en,
                (SELECT COUNT(*)::int FROM conexiones_oyente co
                 WHERE co.acceso_id = ao.id AND co.desconectado_en IS NULL) AS conectados
         FROM accesos_oyente ao
         WHERE ao.sesion_id = $1 AND ao.revocado_en IS NULL AND ao.vence_en > NOW()
         ORDER BY ao.creado_en DESC LIMIT 1`,
        [sesionId]
      );
      const acceso = rows[0];
      res.json({
        habilitado: !!acceso && permiso.estado === 'en_curso',
        maxOyentes: acceso ? Number(acceso.max_oyentes) : 20,
        conectados: acceso ? Number(acceso.conectados) : 0,
        venceEn: acceso?.vence_en ?? null,
      });
    } catch (err) {
      log.error('Error al consultar acceso de oyentes', err);
      res.status(500).json({ error: 'No se pudo consultar el acceso de oyentes.' });
    }
  });

  app.post('/api/sesiones/:id/oyentes', authenticateJWT, async (req: any, res) => {
    const sesionId = Number(req.params.id);
    const maxOyentes = req.body?.maxOyentes === undefined ? 20 : Number(req.body.maxOyentes);
    if (!Number.isInteger(sesionId) || sesionId <= 0) return res.status(400).json({ error: 'Sesión inválida.' });
    if (!Number.isInteger(maxOyentes) || maxOyentes < 1 || maxOyentes > MAX_OYENTES) {
      return res.status(400).json({ error: `El cupo debe ser un número entre 1 y ${MAX_OYENTES}.` });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sesion = await client.query(
        'SELECT docente_id, estado FROM sesiones_clase WHERE id = $1 FOR UPDATE',
        [sesionId]
      );
      if (sesion.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Sesión no encontrada.' });
      }
      const roles = await client.query(
        `SELECT r.nombre FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id WHERE ur.usuario_id = $1`,
        [req.user.userId]
      );
      const esAdmin = roles.rows.some((r: { nombre: string }) => r.nombre === 'administrador');
      if (!esAdmin && Number(sesion.rows[0].docente_id) !== Number(req.user.userId)) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'No puedes gestionar oyentes de esta sesión.' });
      }
      if (sesion.rows[0].estado !== 'en_curso') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Solo se puede habilitar el acceso en una clase en curso.' });
      }
      const anteriores = await client.query(
        `SELECT id FROM accesos_oyente
         WHERE sesion_id = $1 AND revocado_en IS NULL`,
        [sesionId]
      );
      await client.query(
        `UPDATE accesos_oyente SET revocado_en = NOW()
         WHERE sesion_id = $1 AND revocado_en IS NULL`,
        [sesionId]
      );
      const credencial = randomBytes(32).toString('base64url');
      const venceEn = new Date(Date.now() + DURACION_ACCESO_MS);
      const { rows } = await client.query(
        `INSERT INTO accesos_oyente
           (sesion_id, credencial_hash, creado_por, vence_en, max_oyentes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [sesionId, hashCredencial(credencial), req.user.userId, venceEn, maxOyentes]
      );
      await client.query('COMMIT');
      for (const anterior of anteriores.rows) {
        await revocarAcceso(Number(anterior.id), io);
      }
      const accesoId = Number(rows[0].id);
      await bitacora(req.user.userId, 'habilitar_oyentes', `sesion=${sesionId}; cupo=${maxOyentes}`, req.ip);
      res.status(201).json({ codigo: credencial, venceEn, maxOyentes, accesoId });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      log.error('Error al habilitar acceso de oyentes', err);
      res.status(500).json({ error: 'No se pudo habilitar el acceso de oyentes.' });
    } finally {
      client.release();
    }
  });

  app.delete('/api/sesiones/:id/oyentes', authenticateJWT, async (req: any, res) => {
    const sesionId = Number(req.params.id);
    if (!Number.isInteger(sesionId) || sesionId <= 0) return res.status(400).json({ error: 'Sesión inválida.' });
    try {
      const permiso = await puedeGestionarSesion(Number(req.user.userId), sesionId);
      if (!permiso.existe) return res.status(404).json({ error: 'Sesión no encontrada.' });
      if (!permiso.autorizado) return res.status(403).json({ error: 'No puedes gestionar oyentes de esta sesión.' });
      const { rows } = await pool.query(
        `SELECT id FROM accesos_oyente
         WHERE sesion_id = $1 AND revocado_en IS NULL`,
        [sesionId]
      );
      for (const acceso of rows) await revocarAcceso(Number(acceso.id), io);
      await bitacora(req.user.userId, 'cerrar_oyentes', `sesion=${sesionId}`, req.ip);
      res.json({ ok: true });
    } catch (err) {
      log.error('Error al cerrar acceso de oyentes', err);
      res.status(500).json({ error: 'No se pudo cerrar el acceso de oyentes.' });
    }
  });

  app.post('/api/oyentes/canjear', limiteCanjeOyente, async (req, res) => {
    const codigo = req.body?.codigo;
    const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim() : '';
    if (typeof codigo !== 'string' || !/^[A-Za-z0-9_-]{40,50}$/.test(codigo) || !NOMBRE_OYENTE.test(nombre)) {
      return res.status(400).json({ error: 'Ingresa un nombre válido para continuar.' });
    }
    try {
      const { rows } = await pool.query(
        `SELECT ao.id AS acceso_id, ao.sesion_id, ao.vence_en,
                sc.espacio_id, sc.tema, sc.estado AS sesion_estado,
                e.nombre AS espacio_nombre, e.escena_url, e.capacidad_max,
                a.nombre AS asignatura,
                u.nombre AS docente_nombre, u.apellido AS docente_apellido
         FROM accesos_oyente ao
         JOIN sesiones_clase sc ON sc.id = ao.sesion_id
         JOIN espacios e ON e.id = sc.espacio_id
         LEFT JOIN asignaturas a ON a.id = e.asignatura_id
         LEFT JOIN perfiles_docente pd ON pd.usuario_id = sc.docente_id
         LEFT JOIN usuarios u ON u.id = pd.usuario_id
         WHERE ao.credencial_hash = $1 AND ao.revocado_en IS NULL
           AND ao.vence_en > NOW() AND sc.estado = 'en_curso' AND e.activo = TRUE`,
        [hashCredencial(codigo)]
      );
      if (rows.length === 0) return res.status(403).json({ error: 'El enlace no está disponible o venció.' });
      const acceso = rows[0];
      const idOyente = randomUUID();
      const token = firmarToken(
        {
          userId: 0,
          idOyente,
          email: 'oyente@temporal',
          nombre,
          apellido: '',
          rol: 'oyente',
          roles: ['oyente'],
          isOyente: true,
          accesoOyenteId: Number(acceso.acceso_id),
          sesionId: Number(acceso.sesion_id),
        },
        '4h'
      );
      const espacio = {
        id: acceso.espacio_id,
        nombre: acceso.espacio_nombre,
        tipo: 'aula',
        escena_url: acceso.escena_url,
        capacidad_max: acceso.capacidad_max,
        asignatura: acceso.asignatura,
        asignatura_codigo: null,
        docente_id: null,
        docente_nombre: acceso.docente_nombre,
        docente_apellido: acceso.docente_apellido,
        sesion_activa: {
          id: acceso.sesion_id,
          tema: acceso.tema,
          estado: acceso.sesion_estado,
          docente: [acceso.docente_nombre, acceso.docente_apellido].filter(Boolean).join(' '),
        },
      };
      res.json({
        token,
        user: { id: `oyente_${idOyente}`, email: 'oyente@temporal', nombre, apellido: '', rol: 'oyente', roles: ['oyente'], isOyente: true },
        espacio,
      });
    } catch (err) {
      log.error('Error al canjear acceso de oyente', err);
      res.status(500).json({ error: 'No se pudo validar el enlace de oyente.' });
    }
  });
}

