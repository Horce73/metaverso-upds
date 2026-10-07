// Pantalla compartida del aula (AULA-01, decisión 0002). El docente sube una
// imagen cada vez que su pantalla cambia y el servidor la reenvía al aula.
// Se guarda la última para quien entra tarde. Una pantalla por aula a la vez.

/** Tope por cuadro; el cliente reduce la calidad antes de llegar aquí. */
export const MAX_BYTES_CUADRO = 900_000;

interface PantallaAula {
  socketId: string;
  nombre: string;
  ultimoCuadro: Buffer | null;
}

const pantallas = new Map<number, PantallaAula>();

export function pantallaDe(espacioId: number): PantallaAula | null {
  return pantallas.get(espacioId) ?? null;
}

export function estadoPantalla(espacioId: number) {
  const p = pantallas.get(espacioId);
  return p ? { activa: true, socketId: p.socketId, por: p.nombre } : { activa: false };
}

/** false si otra persona ya está compartiendo en esa aula. */
export function iniciarPantalla(espacioId: number, socketId: string, nombre: string): boolean {
  const actual = pantallas.get(espacioId);
  if (actual && actual.socketId !== socketId) return false;
  pantallas.set(espacioId, { socketId, nombre, ultimoCuadro: actual?.ultimoCuadro ?? null });
  return true;
}

/** Sólo WebP o JPEG: es lo único que el cliente envía y lo único que se reenvía. */
export function esCuadroValido(datos: unknown): datos is Buffer {
  if (!Buffer.isBuffer(datos) || datos.length < 12 || datos.length > MAX_BYTES_CUADRO) return false;
  const webp = datos.subarray(0, 4).toString('latin1') === 'RIFF' && datos.subarray(8, 12).toString('latin1') === 'WEBP';
  const jpeg = datos[0] === 0xff && datos[1] === 0xd8 && datos[2] === 0xff;
  return webp || jpeg;
}

export function guardarCuadro(espacioId: number, socketId: string, datos: Buffer): boolean {
  const p = pantallas.get(espacioId);
  if (!p || p.socketId !== socketId) return false;
  p.ultimoCuadro = datos;
  return true;
}

/** Quien compartía dejó de hacerlo o salió del aula. */
export function detenerPantalla(espacioId: number, socketId: string): boolean {
  const p = pantallas.get(espacioId);
  if (!p || p.socketId !== socketId) return false;
  pantallas.delete(espacioId);
  return true;
}
