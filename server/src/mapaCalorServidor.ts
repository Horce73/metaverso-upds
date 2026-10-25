// Mapas de calor de uso (DATA-04). Las posiciones ya viajan por socket; cada
// MUESTREO_S se anota en qué celda del piso está cada persona y, cada
// VOLCADO_S, lo acumulado se suma en la base por espacio, día y celda. No se
// guarda quién estaba: sólo cuánto tiempo hubo gente en cada lugar.
import type { Express } from 'express';
import { pool } from './db.js';
import { authenticateJWT, requiereAdmin } from './middleware/auth.js';
import { Acumulador, MUESTREO_S, TAMANO_CELDA } from './mapaCalor.js';
import { log } from './registro.js';

const VOLCADO_S = 60;
const ZONA_HORARIA = process.env.ZONA_HORARIA || 'America/La_Paz';
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

async function volcar(acumulador: Acumulador): Promise<void> {
  const filas = acumulador.vaciar();
  if (filas.length === 0) return;
  await pool.query(
    `INSERT INTO mapa_calor (espacio_id, dia, cx, cz, segundos)
     SELECT f.espacio_id, (NOW() AT TIME ZONE $5)::date, f.cx, f.cz, f.segundos
     FROM UNNEST($1::int[], $2::smallint[], $3::smallint[], $4::int[]) AS f(espacio_id, cx, cz, segundos)
     JOIN espacios e ON e.id = f.espacio_id
     ON CONFLICT (espacio_id, dia, cx, cz) DO UPDATE SET segundos = mapa_calor.segundos + EXCLUDED.segundos`,
    [filas.map((f) => f.espacioId), filas.map((f) => f.cx), filas.map((f) => f.cz), filas.map((f) => f.segundos), ZONA_HORARIA]
  );
}

/**
 * Arranca el muestreo. obtenerPosiciones devuelve dónde está ahora cada
 * persona conectada (sólo quienes ya mandaron su posición real).
 */
export function iniciarMapaCalor(obtenerPosiciones: () => { espacioId: number; x: number; z: number }[]): () => Promise<void> {
  const acumulador = new Acumulador();
  const muestreo = setInterval(() => {
    for (const p of obtenerPosiciones()) acumulador.sumar(p.espacioId, p.x, p.z, MUESTREO_S);
  }, MUESTREO_S * 1000);
  const volcado = setInterval(() => {
    volcar(acumulador).catch((err) => log.error('Error al guardar el mapa de calor', err));
  }, VOLCADO_S * 1000);
  muestreo.unref();
  volcado.unref();
  return async () => {
    clearInterval(muestreo);
    clearInterval(volcado);
    await volcar(acumulador);
  };
}

/**
 * Celdas de un espacio en un rango de días, sumadas. Sólo administradores:
 * aunque no identifica a nadie, muestra por dónde anda la gente.
 */
export function registrarRutasMapaCalor(app: Express) {
  app.get('/api/admin/mapa-calor', authenticateJWT, requiereAdmin, async (req: any, res) => {
    const espacioId = Number(req.query.espacio_id);
    if (!Number.isInteger(espacioId)) return res.status(400).json({ error: 'Falta espacio_id' });
    const desde = FECHA.test(req.query.desde ?? '') ? req.query.desde : null;
    const hasta = FECHA.test(req.query.hasta ?? '') ? req.query.hasta : null;
    try {
      const { rows } = await pool.query(
        `SELECT cx, cz, SUM(segundos)::int AS segundos
         FROM mapa_calor
         WHERE espacio_id = $1
           AND ($2::date IS NULL OR dia >= $2::date)
           AND ($3::date IS NULL OR dia <= $3::date)
         GROUP BY cx, cz`,
        [espacioId, desde, hasta]
      );
      res.json({ tamano_celda: TAMANO_CELDA, celdas: rows });
    } catch (err) {
      log.error('Error al leer el mapa de calor', err);
      res.status(500).json({ error: 'Error de servidor' });
    }
  });
}
