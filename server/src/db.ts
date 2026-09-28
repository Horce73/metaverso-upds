import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const poolConfig = {
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/metaverso_upds',
  // Sin tope, una petición que no consigue conexión espera para siempre; si
  // el pool se agota, mejor un 500 que un backend colgado entero.
  connectionTimeoutMillis: 10_000,
};

export const pool = new Pool(poolConfig);

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
    console.error('❌ No se pudo conectar a PostgreSQL:', err.message);
    process.exit(1);
  } else {
    console.log('✅ Conexión exitosa a PostgreSQL');
    release();
  }
});
