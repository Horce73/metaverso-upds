import pg from 'pg';
import dotenv from 'dotenv';
import { log } from './registro.js';

dotenv.config();

const { Pool } = pg;

const poolConfig = {
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/metaverso_upds',
  // Sin tope, una petición que no consigue conexión espera para siempre; si
  // el pool se agota, mejor un 500 que un backend colgado entero.
  connectionTimeoutMillis: 10_000,
};

export const pool = new Pool(poolConfig);

// Si la base corta una conexión inactiva (reinicio, corte de red) el pool
// emite 'error'; sin este listener eso tumba el proceso entero, y con él el
// chat y la voz. Así se registra, el pool abre otra conexión cuando haga
// falta y /api/salud/lista avisa mientras la base no conteste.
pool.on('error', (err) => log.error('Se perdió una conexión inactiva con PostgreSQL', err));

// Ejecuta fn dentro de una transacción con una conexión propia y la devuelve
// al pool al terminar. Todo lo que no sea parte de la transacción (bitácora,
// lecturas posteriores) va después: pedir otra conexión mientras se retiene
// ésta agota el pool con unas pocas peticiones simultáneas y lo bloquea.
export async function enTransaccion<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

pool.connect((err, client, release) => {
  if (err) {
    log.error('❌ No se pudo conectar a PostgreSQL', err);
    process.exit(1);
  } else {
    log.info('Conexión exitosa a PostgreSQL');
    release();
  }
});
