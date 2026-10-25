// Registro estructurado (OPS-03). Una línea por evento: en producción JSON
// (se puede filtrar y reconstruir qué pasó en una prueba sin reproducirla),
// en desarrollo texto legible. LOG_FORMATO=json|texto lo fuerza.

export type Nivel = 'info' | 'warn' | 'error';
export type Campos = Record<string, unknown>;

function errorComoCampos(error: unknown): Campos | undefined {
  if (error === undefined || error === null) return undefined;
  if (error instanceof Error) {
    const codigo = (error as Error & { code?: unknown }).code;
    return { mensaje: error.message, ...(codigo !== undefined ? { codigo } : {}), pila: error.stack };
  }
  return { mensaje: String(error) };
}

/** La línea de un evento. Pura, para poder probarla. */
export function formatear(nivel: Nivel, mensaje: string, campos: Campos | undefined, error: unknown, formato: 'json' | 'texto', ahora = new Date()): string {
  const err = errorComoCampos(error);
  if (formato === 'json') {
    return JSON.stringify({ t: ahora.toISOString(), nivel, msg: mensaje, ...campos, ...(err ? { error: err } : {}) }, (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v
    );
  }
  const extra = campos && Object.keys(campos).length ? ` ${Object.entries(campos).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' ')}` : '';
  const pila = err ? `\n  ${err.pila ?? err.mensaje}` : '';
  return `${ahora.toISOString().slice(11, 19)} ${nivel.toUpperCase().padEnd(5)} ${mensaje}${extra}${pila}`;
}

const formato: 'json' | 'texto' =
  process.env.LOG_FORMATO === 'json' || process.env.LOG_FORMATO === 'texto'
    ? process.env.LOG_FORMATO
    : process.env.NODE_ENV === 'production'
      ? 'json'
      : 'texto';

function escribir(nivel: Nivel, mensaje: string, campos?: Campos, error?: unknown) {
  const linea = formatear(nivel, mensaje, campos, error, formato);
  if (nivel === 'error') process.stderr.write(`${linea}\n`);
  else process.stdout.write(`${linea}\n`);
}

export const log = {
  info: (mensaje: string, campos?: Campos) => escribir('info', mensaje, campos),
  warn: (mensaje: string, campos?: Campos) => escribir('warn', mensaje, campos),
  /** El error va aparte de los campos: se registra con su pila. */
  error: (mensaje: string, error?: unknown, campos?: Campos) => escribir('error', mensaje, campos, error),
};
