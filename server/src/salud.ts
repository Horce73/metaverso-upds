// Sondas de salud (OPS-03).
//   /api/salud        el proceso responde (liveness)
//   /api/salud/lista  además la base contesta y no hay migraciones pendientes
//                     (readiness): 503 si algo falla, con el motivo
// Van antes del límite de pedidos de /api: Docker las consulta cada pocos
// segundos.
import type { Express } from 'express';
import { pool } from './db.js';
import { leerMigraciones } from './migraciones.js';

const TIEMPO_MAXIMO_DB_MS = 2000;

async function conTiempoMaximo<T>(promesa: Promise<T>, ms: number): Promise<T> {
  let temporizador: NodeJS.Timeout | undefined;
  const limite = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new Error(`sin respuesta en ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([promesa, limite]);
  } finally {
    clearTimeout(temporizador);
  }
}

export function registrarRutasSalud(app: Express) {
  const inicio = Date.now();

  app.get('/api/salud', (_req, res) => {
    res.json({ estado: 'ok', segundosActivo: Math.round((Date.now() - inicio) / 1000) });
  });

  app.get('/api/salud/lista', async (_req, res) => {
    const comprobaciones: Record<string, string> = {};
    let lista = true;
    try {
      const { rows } = await conTiempoMaximo(pool.query('SELECT version FROM schema_migraciones'), TIEMPO_MAXIMO_DB_MS);
      comprobaciones.baseDeDatos = 'ok';
      const aplicadas = new Set(rows.map((r) => r.version));
      const pendientes = (await leerMigraciones()).filter((m) => !aplicadas.has(m.version)).map((m) => `${m.version}_${m.nombre}`);
      comprobaciones.migraciones = pendientes.length ? `pendientes: ${pendientes.join(', ')}` : 'ok';
      if (pendientes.length) lista = false;
    } catch (err) {
      comprobaciones.baseDeDatos = (err as Error).message;
      lista = false;
    }
    res.status(lista ? 200 : 503).json({ estado: lista ? 'ok' : 'no lista', ...comprobaciones });
  });
}
