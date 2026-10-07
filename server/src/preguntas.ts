// Levantar la mano y cola de preguntas (AULA-03). Estado en memoria por aula:
// quién espera turno, en orden, y a quién le cedió la palabra el docente.
// Quien tiene la palabra difunde su voz a toda el aula, igual que el docente
// (las zonas de VOZ-03 lo tratan como difusor mientras la tenga).

export interface EnCola {
  socketId: string;
  userId: number;
  nombre: string;
  desde: number;
}

export interface Palabra {
  socketId: string;
  userId: number;
  nombre: string;
  peerId: string;
}

interface EstadoAula {
  cola: EnCola[];
  palabra: Palabra | null;
}

const estados = new Map<number, EstadoAula>();

function estado(espacioId: number): EstadoAula {
  let e = estados.get(espacioId);
  if (!e) {
    e = { cola: [], palabra: null };
    estados.set(espacioId, e);
  }
  return e;
}

/** Lo que se envía al aula: sin userId (no hace falta para la interfaz). */
export function estadoPublico(espacioId: number) {
  const { cola, palabra } = estado(espacioId);
  return {
    cola: cola.map(({ socketId, nombre, desde }) => ({ socketId, nombre, desde })),
    palabra: palabra && { socketId: palabra.socketId, nombre: palabra.nombre, peerId: palabra.peerId },
  };
}

export function levantarMano(espacioId: number, quien: EnCola): boolean {
  const e = estado(espacioId);
  if (e.cola.some((c) => c.socketId === quien.socketId) || e.palabra?.socketId === quien.socketId) return false;
  e.cola.push(quien);
  return true;
}

export function bajarMano(espacioId: number, socketId: string): boolean {
  const e = estado(espacioId);
  const antes = e.cola.length;
  e.cola = e.cola.filter((c) => c.socketId !== socketId);
  return e.cola.length !== antes;
}

/** Da la palabra (sale de la cola si estaba). Reemplaza a quien la tuviera. */
export function cederPalabra(espacioId: number, quien: Palabra) {
  const e = estado(espacioId);
  e.cola = e.cola.filter((c) => c.socketId !== quien.socketId);
  e.palabra = quien;
}

export function quienTienePalabra(espacioId: number): Palabra | null {
  return estado(espacioId).palabra;
}

export function quitarPalabra(espacioId: number): boolean {
  const e = estado(espacioId);
  if (!e.palabra) return false;
  e.palabra = null;
  return true;
}

/** Alguien salió del aula: deja la cola y, si la tenía, la palabra. */
export function salirDelAula(espacioId: number, socketId: string): boolean {
  const e = estados.get(espacioId);
  if (!e) return false;
  const cambioCola = bajarMano(espacioId, socketId);
  const teniaPalabra = e.palabra?.socketId === socketId;
  if (teniaPalabra) e.palabra = null;
  if (e.cola.length === 0 && !e.palabra) estados.delete(espacioId);
  return cambioCola || teniaPalabra;
}
