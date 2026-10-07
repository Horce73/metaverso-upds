// Pizarra del aula por operaciones (AULA-02): lo comparten el panel 2D y la
// pizarra 3D de la escena. Un trazo va de que se apoya el lápiz a que se
// levanta; las coordenadas y el grosor son fracciones (0..1) del tamaño de la
// superficie, para que cualquiera lo redibuje a su resolución.
import type { Socket } from 'socket.io-client';

export type Punto = [number, number];

export interface Trazo {
  id: string;
  color: string;
  grosor: number;
  puntos: Punto[];
}

export interface LoteTrazo extends Trazo {
  fin: boolean;
  autorSocketId?: string;
}

/** Dibuja los puntos del trazo a partir de `desde` (continúa desde el anterior). */
export function dibujarTramo(ctx: CanvasRenderingContext2D, ancho: number, alto: number, trazo: Trazo, desde = 0) {
  const { puntos } = trazo;
  if (puntos.length === 0 || desde >= puntos.length) return;
  ctx.strokeStyle = trazo.color;
  ctx.fillStyle = trazo.color;
  ctx.lineWidth = Math.max(1, trazo.grosor * ancho);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (puntos.length === 1) {
    // Un toque sin arrastrar: un punto
    ctx.beginPath();
    ctx.arc(puntos[0][0] * ancho, puntos[0][1] * alto, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const inicio = Math.max(0, desde - 1);
  ctx.beginPath();
  ctx.moveTo(puntos[inicio][0] * ancho, puntos[inicio][1] * alto);
  for (let i = inicio + 1; i < puntos.length; i++) ctx.lineTo(puntos[i][0] * ancho, puntos[i][1] * alto);
  ctx.stroke();
}

export function redibujarTodo(
  ctx: CanvasRenderingContext2D,
  ancho: number,
  alto: number,
  trazos: Iterable<Trazo>,
  fondo: string | null
) {
  if (fondo) {
    ctx.fillStyle = fondo;
    ctx.fillRect(0, 0, ancho, alto);
  } else {
    ctx.clearRect(0, 0, ancho, alto);
  }
  for (const t of trazos) dibujarTramo(ctx, ancho, alto, t);
}

/** Id de trazo. crypto.randomUUID sólo existe en contexto seguro (https o localhost). */
export function nuevoIdTrazo(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

interface Escucha {
  /** Llegaron puntos nuevos de un trazo: dibujar sólo el tramo nuevo. */
  onTramo: (trazo: Trazo, desde: number, lote: LoteTrazo) => void;
  /** Cambió el conjunto (estado inicial, deshacer, borrar): redibujar todo. */
  onRedibujar: (trazos: Trazo[]) => void;
  /** El panel que dibuja ya pintó sus propios trazos: ignora el eco del servidor. */
  ignorarPropios?: boolean;
}

/**
 * Mantiene el estado de la pizarra del aula a partir de los eventos del
 * servidor y pide el estado actual. Devuelve el mapa (en orden de llegada)
 * y la función para dejar de escuchar. Los handlers tienen nombre: el mismo
 * socket lo escuchan el panel 2D y la pizarra 3D a la vez.
 */
export function suscribirPizarra(socket: Socket, { onTramo, onRedibujar, ignorarPropios = false }: Escucha) {
  const trazos = new Map<string, Trazo>();
  const lista = () => [...trazos.values()];

  const alLote = (lote: LoteTrazo) => {
    if (ignorarPropios && lote.autorSocketId === socket.id) return;
    let t = trazos.get(lote.id);
    if (!t) {
      t = { id: lote.id, color: lote.color, grosor: lote.grosor, puntos: [] };
      trazos.set(lote.id, t);
    }
    const desde = t.puntos.length;
    t.puntos.push(...lote.puntos);
    onTramo(t, desde, lote);
  };
  const alBorrar = (data: { ids: string[] }) => {
    data.ids.forEach((id) => trazos.delete(id));
    onRedibujar(lista());
  };
  const alBorrarTodo = () => {
    trazos.clear();
    onRedibujar([]);
  };
  const alEstado = (data: { trazos: Trazo[] }) => {
    trazos.clear();
    data.trazos.forEach((t) => trazos.set(t.id, { ...t, puntos: [...t.puntos] }));
    onRedibujar(lista());
  };

  socket.on('pizarra_trazo', alLote);
  socket.on('pizarra_borrado', alBorrar);
  socket.on('board_cleared', alBorrarTodo);
  socket.on('pizarra_state', alEstado);
  socket.emit('get_pizarra_state');

  return {
    trazos,
    /** Para el autor: suma puntos propios al estado local antes de que vuelvan del servidor. */
    agregarPropio: (lote: Trazo) => {
      const t = trazos.get(lote.id) ?? { id: lote.id, color: lote.color, grosor: lote.grosor, puntos: [] };
      t.puntos.push(...lote.puntos);
      trazos.set(lote.id, t);
    },
    dejar: () => {
      socket.off('pizarra_trazo', alLote);
      socket.off('pizarra_borrado', alBorrar);
      socket.off('board_cleared', alBorrarTodo);
      socket.off('pizarra_state', alEstado);
    },
  };
}
