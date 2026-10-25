// CSV para abrir en Excel o importar a otro sistema (DATA-02, DATA-03).

export type Celda = string | number | null | undefined;

// Una celda que empieza con estos caracteres Excel la interpreta como
// fórmula: un nombre como "=HYPERLINK(...)" se ejecutaría al abrir el archivo.
const INICIO_FORMULA = /^[=+\-@\t\r]/;

function celdaCsv(valor: Celda): string {
  if (valor === null || valor === undefined) return '';
  let texto = String(valor);
  if (typeof valor === 'string' && INICIO_FORMULA.test(texto)) texto = `'${texto}`;
  return /[",;\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * CSV para abrir directo en Excel o importar al sistema académico: separado
 * por comas (RFC 4180), filas con CRLF y BOM de UTF-8 para que Excel no
 * rompa las tildes y las eñes.
 */
export function aCsv(encabezados: string[], filas: Celda[][]): string {
  const lineas = [encabezados, ...filas].map((fila) => fila.map(celdaCsv).join(','));
  return `\uFEFF${lineas.join('\r\n')}\r\n`;
}

/** Nombre de archivo seguro para Content-Disposition (sin tildes ni separadores). */
export function nombreArchivo(base: string, extension = 'csv'): string {
  const limpio = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return `${limpio || 'asistencia'}.${extension}`;
}
