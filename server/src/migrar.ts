import { writeFile } from 'fs/promises';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import {
  DIRECTORIO_MIGRACIONES,
  aplicarMigraciones,
  estadoMigraciones,
  leerMigraciones,
  revertirUltima
} from './migraciones.js';

// CLI de migraciones:
//   npm run migrate                 aplica las pendientes
//   npm run migrate:down            revierte la ultima aplicada
//   npm run migrate:status          lista aplicadas y pendientes
//   npm run migrate:create -- nombre  crea el par up/down con el siguiente numero

dotenv.config();

async function crear(nombre: string | undefined) {
  const limpio = (nombre ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (!limpio) throw new Error('Uso: npm run migrate:create -- nombre_descriptivo');

  const existentes = await leerMigraciones();
  const ultima = existentes.length ? Number(existentes[existentes.length - 1].version) : 0;
  const base = `${String(ultima + 1).padStart(4, '0')}_${limpio}`;

  await writeFile(path.join(DIRECTORIO_MIGRACIONES, `${base}.up.sql`), `-- ${base}: aplicar\n`, { flag: 'wx' });
  await writeFile(path.join(DIRECTORIO_MIGRACIONES, `${base}.down.sql`), `-- ${base}: revertir\n`, { flag: 'wx' });
  console.log(`Creadas migrations/${base}.up.sql y migrations/${base}.down.sql`);
}

async function main() {
  const [comando = 'up', argumento] = process.argv.slice(2);
  if (comando === 'create') return crear(argumento);

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/metaverso_upds'
  });
  try {
    if (comando === 'up') {
      const nuevas = await aplicarMigraciones(pool);
      if (nuevas.length === 0) console.log('[migraciones] la base ya esta al dia');
    } else if (comando === 'down') {
      const revertida = await revertirUltima(pool);
      if (!revertida) console.log('[migraciones] no hay migraciones aplicadas');
    } else if (comando === 'status') {
      for (const { migracion, aplicada } of await estadoMigraciones(pool)) {
        console.log(`${aplicada ? '[x]' : '[ ]'} ${migracion}`);
      }
    } else {
      throw new Error(`Comando desconocido: ${comando} (usa up, down, status o create)`);
    }
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('[migraciones] error:', err.message);
  process.exit(1);
});
