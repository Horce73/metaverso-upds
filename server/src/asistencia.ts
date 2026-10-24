// Cálculos del tablero de asistencia (DATA-01/02), sin base de datos para
// poder probarlos con node --test.

export interface Tramo {
  entrada: Date;
  /** null = sigue dentro del aula */
  salida: Date | null;
}

/**
 * Minutos que la persona estuvo dentro del aula mientras la clase duraba.
 * Cada tramo se recorta al horario de la clase (llegar antes o quedarse
 * después no suma) y los que se pisan (dos pestañas, reconexión) se cuentan
 * una sola vez. Un tramo abierto corre hasta el fin de la clase, o hasta
 * ahora si la clase sigue.
 */
export function minutosEfectivos(tramos: Tramo[], inicioClase: Date, finClase: Date | null, ahora: Date): number {
  const fin = Math.min((finClase ?? ahora).getTime(), ahora.getTime());
  const inicio = inicioClase.getTime();
  if (fin <= inicio) return 0;

  const recortados = tramos
    .map((t) => [Math.max(t.entrada.getTime(), inicio), Math.min((t.salida ?? ahora).getTime(), fin)] as const)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);

  let total = 0;
  let abiertoDesde = -Infinity;
  let abiertoHasta = -Infinity;
  for (const [a, b] of recortados) {
    if (a > abiertoHasta) {
      total += abiertoHasta - abiertoDesde > 0 ? abiertoHasta - abiertoDesde : 0;
      abiertoDesde = a;
      abiertoHasta = b;
    } else {
      abiertoHasta = Math.max(abiertoHasta, b);
    }
  }
  total += abiertoHasta - abiertoDesde > 0 ? abiertoHasta - abiertoDesde : 0;
  return Math.floor(total / 60000);
}

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
export function nombreArchivo(base: string): string {
  const limpio = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return `${limpio || 'asistencia'}.csv`;
}

export type EstadoAsistencia = 'presente' | 'tarde' | 'ausente';

export interface SesionTablero {
  id: number;
  tema: string | null;
  inicio: Date;
  /** null mientras la clase sigue en curso */
  fin: Date | null;
  estado: string;
}

export interface EstudianteTablero {
  id: number;
  registro_upds: string | null;
  nombre: string;
  apellido: string;
}

export interface AsistenciaTablero {
  id: number;
  sesion_id: number;
  usuario_id: number;
  estado: EstadoAsistencia;
}

export interface TramoTablero extends Tramo {
  asistencia_id: number;
}

export interface Tablero {
  sesiones: (SesionTablero & { duracion_min: number; presentes: number; tardes: number; ausentes: number; minutos_promedio: number })[];
  estudiantes: (EstudianteTablero & {
    presentes: number;
    tardes: number;
    ausencias: number;
    minutos_total: number;
    porcentaje_asistencia: number;
  })[];
  /** celdas[usuarioId][sesionId] */
  celdas: Record<number, Record<number, { estado: EstadoAsistencia; minutos: number }>>;
}

/**
 * Cruza inscritos con sesiones dictadas: quien no tiene fila de asistencia en
 * una sesión cuenta como ausente. Los minutos promedio de una sesión son
 * sobre los que asistieron.
 */
export function armarTablero(
  sesiones: SesionTablero[],
  estudiantes: EstudianteTablero[],
  asistencias: AsistenciaTablero[],
  tramos: TramoTablero[],
  ahora: Date
): Tablero {
  const tramosPorAsistencia = new Map<number, Tramo[]>();
  for (const t of tramos) {
    const lista = tramosPorAsistencia.get(t.asistencia_id) ?? [];
    lista.push(t);
    tramosPorAsistencia.set(t.asistencia_id, lista);
  }
  const asistenciaDe = new Map<string, AsistenciaTablero>();
  for (const a of asistencias) asistenciaDe.set(`${a.usuario_id}:${a.sesion_id}`, a);

  const celdas: Tablero['celdas'] = {};
  const filas = estudiantes.map((e) => {
    celdas[e.id] = {};
    let presentes = 0;
    let tardes = 0;
    let minutosTotal = 0;
    for (const s of sesiones) {
      const a = asistenciaDe.get(`${e.id}:${s.id}`);
      const estado: EstadoAsistencia = a ? a.estado : 'ausente';
      const minutos = a ? minutosEfectivos(tramosPorAsistencia.get(a.id) ?? [], s.inicio, s.fin, ahora) : 0;
      celdas[e.id][s.id] = { estado, minutos };
      if (estado === 'presente') presentes++;
      if (estado === 'tarde') tardes++;
      minutosTotal += minutos;
    }
    const asistidas = presentes + tardes;
    return {
      ...e,
      presentes,
      tardes,
      ausencias: sesiones.length - asistidas,
      minutos_total: minutosTotal,
      porcentaje_asistencia: sesiones.length ? Math.round((asistidas / sesiones.length) * 100) : 0,
    };
  });

  const resumenSesiones = sesiones.map((s) => {
    let presentes = 0;
    let tardes = 0;
    let minutos = 0;
    for (const e of estudiantes) {
      const c = celdas[e.id][s.id];
      if (c.estado === 'presente') presentes++;
      if (c.estado === 'tarde') tardes++;
      if (c.estado !== 'ausente') minutos += c.minutos;
    }
    const asistieron = presentes + tardes;
    const fin = Math.min((s.fin ?? ahora).getTime(), ahora.getTime());
    return {
      ...s,
      duracion_min: Math.max(0, Math.floor((fin - s.inicio.getTime()) / 60000)),
      presentes,
      tardes,
      ausentes: estudiantes.length - asistieron,
      minutos_promedio: asistieron ? Math.round(minutos / asistieron) : 0,
    };
  });

  return { sesiones: resumenSesiones, estudiantes: filas, celdas };
}

/** "2026-10-24 19:05" en la zona horaria de la universidad, para el CSV. */
export function fechaHora(fecha: Date | null, zona: string): string {
  if (!fecha) return '';
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zona,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(fecha)
      .map((p) => [p.type, p.value])
  );
  return `${partes.year}-${partes.month}-${partes.day} ${partes.hour}:${partes.minute}`;
}
