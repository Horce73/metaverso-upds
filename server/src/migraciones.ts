import { readdir, readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import type pg from 'pg';

// Migraciones versionadas (OPS-04). Cada cambio de esquema es un par de
// archivos en server/migrations:
//   NNNN_nombre.up.sql    aplica el cambio
//   NNNN_nombre.down.sql  lo revierte
// La tabla schema_migraciones registra cuales ya se aplicaron, asi que un
// cambio nuevo se aplica sobre una base con datos sin tener que vaciarla.

// server/migrations, tanto desde src/ (tsx) como desde dist/ (compilado)
export const DIRECTORIO_MIGRACIONES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations'
);

// Clave arbitraria del advisory lock: evita que dos backends arrancando a la
// vez apliquen la misma migracion dos veces.
const LOCK_MIGRACIONES = 7342001;

const PATRON = /^(\d{4})_([a-z0-9_]+)\.(up|down)\.sql$/;

export interface Migracion {
  version: string;
  nombre: string;
  up: string;
  down: string;
}

export async function leerMigraciones(directorio = DIRECTORIO_MIGRACIONES): Promise<Migracion[]> {
  const archivos = await readdir(directorio);
  const porVersion = new Map<string, { nombre: string; up?: string; down?: string }>();

  for (const archivo of archivos) {
    const m = PATRON.exec(archivo);
    if (!m) continue;
    const [, version, nombre, sentido] = m;
    const entrada = porVersion.get(version) ?? { nombre };
    if (entrada.nombre !== nombre) {
      throw new Error(`La version ${version} tiene dos nombres distintos: ${entrada.nombre} y ${nombre}`);
    }
    entrada[sentido as 'up' | 'down'] = path.join(directorio, archivo);
    porVersion.set(version, entrada);
  }

  const migraciones: Migracion[] = [];
  for (const [version, { nombre, up, down }] of [...porVersion].sort(([a], [b]) => a.localeCompare(b))) {
    if (!up || !down) {
      throw new Error(`La migracion ${version}_${nombre} necesita .up.sql y .down.sql`);
    }
    migraciones.push({ version, nombre, up, down });
  }
  return migraciones;
}

async function prepararTabla(client: pg.PoolClient) {
  const existe = await client.query("SELECT to_regclass('public.schema_migraciones') AS t");
  if (existe.rows[0].t) return;

  await client.query(`
    CREATE TABLE schema_migraciones (
      version    VARCHAR(4) PRIMARY KEY,
      nombre     VARCHAR(100) NOT NULL,
      aplicada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Bases creadas antes de las migraciones con el antiguo database/schema.sql:
  // ya tienen el esquema inicial, se marca como aplicado en vez de re-ejecutarlo.
  const legado = await client.query("SELECT to_regclass('public.usuarios') AS t");
  if (legado.rows[0].t) {
    await client.query(
      "INSERT INTO schema_migraciones (version, nombre) VALUES ('0001', 'esquema_inicial')"
    );
    console.log('[migraciones] base existente detectada: 0001_esquema_inicial marcada como aplicada');
  }
}

async function conBloqueo<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_MIGRACIONES]);
    await prepararTabla(client);
    return await fn(client);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_MIGRACIONES]).catch(() => {});
    client.release();
  }
}

async function versionesAplicadas(client: pg.PoolClient): Promise<Set<string>> {
  const res = await client.query('SELECT version FROM schema_migraciones');
  return new Set(res.rows.map((r: any) => r.version));
}

// Cada migracion corre en su propia transaccion: si falla, la base queda en la
// ultima version completa y el error se propaga.
async function ejecutar(client: pg.PoolClient, archivo: string, registro: () => Promise<unknown>) {
  const sql = await readFile(archivo, 'utf8');
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await registro();
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

export async function aplicarMigraciones(pool: pg.Pool, directorio?: string): Promise<string[]> {
  const migraciones = await leerMigraciones(directorio);
  return conBloqueo(pool, async (client) => {
    const aplicadas = await versionesAplicadas(client);
    const nuevas: string[] = [];
    for (const m of migraciones) {
      if (aplicadas.has(m.version)) continue;
      await ejecutar(client, m.up, () => client.query(
        'INSERT INTO schema_migraciones (version, nombre) VALUES ($1, $2)',
        [m.version, m.nombre]
      ));
      nuevas.push(`${m.version}_${m.nombre}`);
      console.log(`[migraciones] aplicada ${m.version}_${m.nombre}`);
    }
    return nuevas;
  });
}

export async function revertirUltima(pool: pg.Pool, directorio?: string): Promise<string | null> {
  const migraciones = await leerMigraciones(directorio);
  return conBloqueo(pool, async (client) => {
    const res = await client.query('SELECT version FROM schema_migraciones ORDER BY version DESC LIMIT 1');
    if (res.rows.length === 0) return null;
    const version = res.rows[0].version;
    const m = migraciones.find(x => x.version === version);
    if (!m) throw new Error(`La version aplicada ${version} no tiene archivos en ${DIRECTORIO_MIGRACIONES}`);
    await ejecutar(client, m.down, () => client.query(
      'DELETE FROM schema_migraciones WHERE version = $1',
      [version]
    ));
    console.log(`[migraciones] revertida ${m.version}_${m.nombre}`);
    return `${m.version}_${m.nombre}`;
  });
}

export async function estadoMigraciones(pool: pg.Pool, directorio?: string) {
  const migraciones = await leerMigraciones(directorio);
  return conBloqueo(pool, async (client) => {
    const aplicadas = await versionesAplicadas(client);
    return migraciones.map(m => ({
      migracion: `${m.version}_${m.nombre}`,
      aplicada: aplicadas.has(m.version)
    }));
  });
}
