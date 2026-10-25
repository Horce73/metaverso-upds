// Visor de bitácora (DATA-03). La bitácora se llena en cada evento
// (helpers.bitacora); acá el administrador la consulta con filtros, la
// recorre por páginas y la exporta. Cierra el requisito de auditoría (RNF-05).
import type { Express } from 'express';
import { pool } from './db.js';
import { authenticateJWT, requiereAdmin } from './middleware/auth.js';
import { bitacora } from './helpers.js';
import { aCsv, nombreArchivo } from './csv.js';
import { fechaHora } from './asistencia.js';
import { log } from './registro.js';

const ZONA_HORARIA = process.env.ZONA_HORARIA || 'America/La_Paz';
const POR_PAGINA = 100;
const MAX_POR_PAGINA = 500;
const MAX_EXPORTAR = 20000;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

interface Filtros {
  evento?: string;
  q?: string;
  ip?: string;
  desde?: string;
  hasta?: string;
}

/**
 * WHERE con los filtros pedidos. Las fechas son días completos en la zona
 * horaria de la universidad: "hasta 2026-10-24" incluye todo ese día.
 */
function condiciones({ evento, q, ip, desde, hasta }: Filtros): { sql: string; params: unknown[] } {
  const partes: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (evento) partes.push(`b.evento = ${p(evento)}`);
  if (ip) partes.push(`b.ip = ${p(ip)}`);
  if (q) {
    const patron = p(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    partes.push(
      `(b.detalle ILIKE ${patron} OR u.email ILIKE ${patron} OR (u.nombre || ' ' || u.apellido) ILIKE ${patron})`
    );
  }
  if (desde && FECHA.test(desde)) partes.push(`b.fecha >= (${p(desde)}::date)::timestamp AT TIME ZONE ${p(ZONA_HORARIA)}`);
  if (hasta && FECHA.test(hasta)) partes.push(`b.fecha < (${p(hasta)}::date + 1)::timestamp AT TIME ZONE ${p(ZONA_HORARIA)}`);
  return { sql: partes.length ? `AND ${partes.join(' AND ')}` : '', params };
}

const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : undefined);

export function registrarRutasBitacora(app: Express) {
  // Una página, de lo más nuevo a lo más viejo. "siguiente" se pasa como
  // antes_de para la página que sigue; null cuando ya no hay más.
  app.get('/api/admin/bitacora', authenticateJWT, requiereAdmin, async (req: any, res) => {
    try {
      const filtros: Filtros = {
        evento: texto(req.query.evento),
        q: texto(req.query.q),
        ip: texto(req.query.ip),
        desde: texto(req.query.desde),
        hasta: texto(req.query.hasta),
      };
      const { sql, params } = condiciones(filtros);
      const exportar = req.query.formato === 'csv';
      const limite = exportar ? MAX_EXPORTAR : Math.min(Number(req.query.limit) || POR_PAGINA, MAX_POR_PAGINA);
      const antesDe = Number(req.query.antes_de);
      const paginar = !exportar && Number.isInteger(antesDe) && antesDe > 0;

      const { rows } = await pool.query(
        `SELECT b.id, b.usuario_id, b.evento, b.detalle, b.ip, b.fecha,
                u.email, u.nombre, u.apellido
         FROM bitacora b
         LEFT JOIN usuarios u ON u.id = b.usuario_id
         WHERE TRUE ${sql} ${paginar ? `AND b.id < $${params.length + 1}` : ''}
         ORDER BY b.id DESC
         LIMIT ${limite + 1}`,
        paginar ? [...params, antesDe] : params
      );
      const hayMas = rows.length > limite;
      const filas = rows.slice(0, limite);

      if (exportar) {
        await bitacora(req.user.userId, 'exportar_bitacora', JSON.stringify(filtros).slice(0, 255), req.ip);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo(`bitacora_${fechaHora(new Date(), ZONA_HORARIA).slice(0, 10)}`)}"`);
        return res.send(
          aCsv(
            ['Fecha', 'Evento', 'Detalle', 'Usuario', 'Email', 'IP'],
            filas.map((b) => [
              fechaHora(b.fecha, ZONA_HORARIA),
              b.evento,
              b.detalle,
              b.nombre ? `${b.nombre} ${b.apellido}` : '',
              b.email,
              b.ip,
            ])
          )
        );
      }

      res.json({ filas, siguiente: hayMas ? filas[filas.length - 1].id : null });
    } catch (err) {
      log.error('Error al obtener bitacora', err);
      res.status(500).json({ error: 'Error de servidor' });
    }
  });

  // Tipos de evento que existen, para el filtro
  app.get('/api/admin/bitacora/eventos', authenticateJWT, requiereAdmin, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT evento, COUNT(*)::int AS cantidad FROM bitacora GROUP BY evento ORDER BY evento'
      );
      res.json(rows);
    } catch (err) {
      log.error('Error al listar eventos de bitacora', err);
      res.status(500).json({ error: 'Error de servidor' });
    }
  });
}
