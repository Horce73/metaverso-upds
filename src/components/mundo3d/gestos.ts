// Gestos del avatar (GESTO-01, RF-19). Quién está gesticulando vive fuera del
// estado de React, como posicionesRemotas.ts: cada AvatarModel lo lee en su
// useFrame y un gesto no re-renderiza la escena. La lista es la misma que
// valida el servidor (server/src/gestos.ts).

export const GESTOS = ['saludar', 'aplaudir', 'asentir', 'negar', 'senalar'] as const;
export type Gesto = (typeof GESTOS)[number];

export const DURACION_GESTO_MS = 1500;
export const ENFRIAMIENTO_GESTO_MS = 500;
/** Clave del avatar propio; los remotos usan su socketId. */
export const GESTO_LOCAL = 'local';

const esGesto = (id: unknown): id is Gesto => (GESTOS as readonly unknown[]).includes(id);

export interface GestoActivo {
  id: Gesto;
  desde: number;
}

const activos = new Map<string, GestoActivo>();
let ultimoLocal = -Infinity;

/** Gesto recibido de otro avatar. Un id desconocido se ignora. */
export function registrarGesto(socketId: string, id: unknown, ahora = performance.now()): void {
  if (esGesto(id)) activos.set(socketId, { id, desde: ahora });
}

/** Gesto propio: false si todavía no pasó el anterior más el enfriamiento. */
export function gestoLocal(id: Gesto, ahora = performance.now()): boolean {
  if (ahora - ultimoLocal < DURACION_GESTO_MS + ENFRIAMIENTO_GESTO_MS) return false;
  ultimoLocal = ahora;
  activos.set(GESTO_LOCAL, { id, desde: ahora });
  return true;
}

/** El gesto en curso de ese avatar; al vencer se borra solo. */
export function gestoEn(clave: string, ahora = performance.now()): GestoActivo | undefined {
  const g = activos.get(clave);
  if (g && ahora - g.desde >= DURACION_GESTO_MS) {
    activos.delete(clave);
    return undefined;
  }
  return g;
}

export interface PoseGesto {
  der: boolean;
  derX: number;
  derZ: number;
  izq: boolean;
  izqX: number;
  izqZ: number;
  /** Rotación del cuerpo: x inclina hacia adelante, y gira. */
  cuerpoX: number;
  cuerpoY: number;
}

export const crearPose = (): PoseGesto => ({ der: false, derX: 0, derZ: 0, izq: false, izqX: 0, izqZ: 0, cuerpoX: 0, cuerpoY: 0 });

/**
 * Hacia dónde van los brazos y el cuerpo a los `s` segundos del gesto. Escribe
 * en `p` (un objeto por avatar) para no crear basura en cada cuadro. Brazos
 * con pivote en el hombro, colgando: x negativo los lleva hacia adelante y z
 * los abre hacia afuera (negativo el derecho, positivo el izquierdo).
 */
export function poseGesto(id: Gesto, s: number, p: PoseGesto): PoseGesto {
  p.der = p.izq = false;
  p.derX = p.derZ = p.izqX = p.izqZ = p.cuerpoX = p.cuerpoY = 0;
  switch (id) {
    case 'saludar':
      p.der = true;
      p.derZ = -2.6 + 0.35 * Math.sin(s * 12);
      break;
    case 'aplaudir': {
      const palmas = 0.3 + 0.25 * Math.sin(s * 16);
      p.der = p.izq = true;
      p.derX = p.izqX = -1.3;
      p.derZ = palmas;
      p.izqZ = -palmas;
      break;
    }
    case 'asentir':
      p.cuerpoX = 0.15 * Math.abs(Math.sin(s * 7));
      break;
    case 'negar':
      p.cuerpoY = 0.3 * Math.sin(s * 10);
      break;
    case 'senalar':
      p.der = true;
      p.derX = -1.5;
      break;
  }
  return p;
}
