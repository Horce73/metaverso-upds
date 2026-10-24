// Interpolación del movimiento remoto (3D-03). En vez de perseguir el último
// paquete con un lerp exponencial (que acelera, frena y se queda corto cuando
// los paquetes llegan irregulares), cada avatar remoto se dibuja un poco en
// el pasado, entre las dos muestras que rodean ese instante.
//
// Las muestras llevan la hora del EMISOR, no la de llegada: estampar por
// llegada traslada el jitter de la red directo a la velocidad (dos paquetes
// que llegan pegados tras uno demorado parecen un tramo recorrido en 5 ms) y
// medido así resultó peor que el lerp viejo. Con la hora del emisor, el jitter
// solo decide si la muestra llegó a tiempo para dibujarse, no cuánto duró el
// tramo. Los relojes de emisor y receptor no comparten origen: se dibuja en
// "ahora - atraso", donde el atraso es el desfase mínimo observado (el paquete
// que menos tardó) más un margen. El margen cubre el intervalo entre paquetes
// del emisor más el jitter de la red (p95 de ambos en los últimos ~2 s, entre
// RETARDO_MIN_MS y RETARDO_MAX_MS): un margen fijo de 100 ms se quedaba corto
// por el túnel y en datos móviles (jitter), y también con un emisor lento que
// manda pocos paquetes por segundo; en ambos casos el avatar frenaba y saltaba.
// Si aun así se queda sin datos, el reloj de dibujo se congela en la última
// muestra (sumando atraso, hasta el máximo) en vez de seguir corriendo: el
// avatar hace una pausa y retoma desde donde estaba, en lugar de frenar y
// después saltar hacia adelante cuando llega el paquete demorado. El atraso nunca cambia de golpe: se acerca a su
// objetivo como mucho un 10 % del tiempo transcurrido, para que el avatar no
// retroceda ni dé un tirón cuando el margen se ajusta.

export type Vector3 = [number, number, number];

interface Muestra {
  /** Hora del emisor (su performance.now()) en que tomó esta posición. */
  t: number;
  pos: Vector3;
  angulo: number;
}

export interface EstadoInterpolacion {
  muestras: Muestra[];
  /** Llegada local menos hora del emisor, de los últimos paquetes. */
  desfases: number[];
  /** Tiempo del emisor entre paquetes consecutivos mientras caminaba. */
  intervalos: number[];
  /** A dónde quiere ir el atraso, según los desfases recientes. */
  atrasoObjetivo: number | null;
  /** Desfase mínimo reciente: el atraso nunca pasa de éste más RETARDO_MAX_MS. */
  desfaseMinimo: number | null;
  /** Atraso con el que se dibuja ahora mismo (se acerca de a poco al objetivo). */
  atraso: number | null;
  ultimoAhora: number | null;
}

export const RETARDO_MIN_MS = 100;
export const RETARDO_MAX_MS = 300;
const MARGEN_JITTER_MS = 20;
const VELOCIDAD_AJUSTE = 0.1;

/** Saltos mayores que esto (cambio de espacio, entrar a una silla lejana) no se interpolan. */
export const DISTANCIA_TELETRANSPORTE = 12;

// Velocidad de caminata del avatar (u/s), la misma que usa AvatarModel. Sirve
// para distinguir una pausa del emisor de un emisor lento: quieto, por 3D-04,
// no manda nada; si al volver el hueco entre paquetes es mucho mayor que lo
// que se tarda en recorrer esa distancia caminando, estuvo quieto casi todo
// el hueco y el tramo se dibuja recién al final. Si no, caminó todo el hueco
// (equipo con pocos FPS) y se interpola a lo largo de todo.
export const VELOCIDAD_CAMINAR = 4;
const INTERVALO_ENVIO_MS = 33;

const MAX_MUESTRAS = 30;
const VENTANA_DESFASES = 60; // ~2 s de movimiento

export function crearEstado(): EstadoInterpolacion {
  return {
    muestras: [],
    desfases: [],
    intervalos: [],
    atrasoObjetivo: null,
    desfaseMinimo: null,
    atraso: null,
    ultimoAhora: null,
  };
}

function distanciaXZ(a: Vector3, b: Vector3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function diferenciaAngular(desde: number, hasta: number): number {
  return Math.atan2(Math.sin(hasta - desde), Math.cos(hasta - desde));
}

/**
 * Registra una posición recibida. `tEmisor` falta en la foto inicial del
 * espacio (space_users) y en clientes viejos: esa muestra vale como posición
 * base, sin hora, y se ubica justo antes de la siguiente que sí la traiga.
 */
export function recibir(
  e: EstadoInterpolacion,
  pos: Vector3,
  angulo: number,
  tEmisor: number | undefined,
  ahoraLocal: number
): void {
  const conHora = typeof tEmisor === 'number' && Number.isFinite(tEmisor);
  const ultima = e.muestras[e.muestras.length - 1];

  // Repetida o fuera de orden: antes que el chequeo de teletransporte, para
  // que un paquete viejo y lejano no se tome como un salto y borre el buffer.
  if (conHora && ultima && ultima.t >= tEmisor) return;

  if (!conHora || (ultima && distanciaXZ(ultima.pos, pos) > DISTANCIA_TELETRANSPORTE)) {
    e.muestras.length = 0;
    e.muestras.push({ t: conHora ? tEmisor : -Infinity, pos, angulo });
    if (conHora) registrarDesfase(e, ahoraLocal - tEmisor);
    return;
  }

  if (ultima) {
    const hueco = tEmisor - ultima.t; // Infinity si la anterior era la foto inicial sin hora
    const tiempoCaminando = (distanciaXZ(ultima.pos, pos) / VELOCIDAD_CAMINAR) * 1000;
    if (hueco > tiempoCaminando * 2 + INTERVALO_ENVIO_MS) {
      ultima.t = tEmisor - Math.max(tiempoCaminando, INTERVALO_ENVIO_MS);
    } else {
      e.intervalos.push(hueco);
      if (e.intervalos.length > VENTANA_DESFASES) e.intervalos.shift();
    }
  }

  e.muestras.push({ t: tEmisor, pos, angulo });
  if (e.muestras.length > MAX_MUESTRAS) e.muestras.splice(0, e.muestras.length - MAX_MUESTRAS);
  registrarDesfase(e, ahoraLocal - tEmisor);
}

function registrarDesfase(e: EstadoInterpolacion, desfase: number): void {
  e.desfases.push(desfase);
  if (e.desfases.length > VENTANA_DESFASES) e.desfases.shift();

  const orden = [...e.desfases].sort((a, b) => a - b);
  const minimo = orden[0];
  const jitter = percentil95(orden) - minimo;
  const intervalo = e.intervalos.length ? percentil95([...e.intervalos].sort((a, b) => a - b)) : 0;
  const margen = Math.min(RETARDO_MAX_MS, Math.max(RETARDO_MIN_MS, intervalo + jitter + MARGEN_JITTER_MS));
  e.atrasoObjetivo = minimo + margen;
  e.desfaseMinimo = minimo;
}

function percentil95(ordenados: number[]): number {
  return ordenados[Math.min(ordenados.length - 1, Math.floor(ordenados.length * 0.95))];
}

function avanzarAtraso(e: EstadoInterpolacion, ahoraLocal: number): number {
  const objetivo = e.atrasoObjetivo ?? RETARDO_MIN_MS;
  if (e.atraso === null || e.ultimoAhora === null) {
    e.atraso = objetivo;
  } else {
    const paso = Math.max(0, ahoraLocal - e.ultimoAhora) * VELOCIDAD_AJUSTE;
    e.atraso += Math.max(-paso, Math.min(paso, objetivo - e.atraso));
  }
  e.ultimoAhora = ahoraLocal;
  return e.atraso;
}

/** Posición y ángulo a dibujar ahora; null si todavía no llegó ninguna muestra. */
export function posicionEn(e: EstadoInterpolacion, ahoraLocal: number): { pos: Vector3; angulo: number } | null {
  const m = e.muestras;
  if (m.length === 0) return null;
  let tRender = ahoraLocal - avanzarAtraso(e, ahoraLocal);

  // Sin datos para este instante: congelar el reloj en la última muestra
  const ultimaT = m[m.length - 1].t;
  if (tRender > ultimaT && Number.isFinite(ultimaT) && e.atraso !== null && e.desfaseMinimo !== null) {
    const tope = e.desfaseMinimo + RETARDO_MAX_MS;
    e.atraso = Math.min(tope, e.atraso + (tRender - ultimaT));
    tRender = ahoraLocal - e.atraso;
  }

  // Descartar lo que ya quedó atrás (siempre queda al menos una muestra)
  let i = 0;
  while (i + 1 < m.length && m[i + 1].t <= tRender) i++;
  if (i > 0) m.splice(0, i);

  const a = m[0];
  const b = m[1];
  if (!b || tRender <= a.t) return { pos: [...a.pos], angulo: a.angulo };

  const f = Math.min(1, (tRender - a.t) / (b.t - a.t));
  return {
    pos: [
      a.pos[0] + (b.pos[0] - a.pos[0]) * f,
      a.pos[1] + (b.pos[1] - a.pos[1]) * f,
      a.pos[2] + (b.pos[2] - a.pos[2]) * f,
    ],
    angulo: a.angulo + diferenciaAngular(a.angulo, b.angulo) * f,
  };
}
