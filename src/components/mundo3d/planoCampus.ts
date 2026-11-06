// Plano del campus UPDS (CAMPUS-01): la manzana de la universidad en Sucre,
// a partir del frontis, la vista satelital y los planos de evacuación (ver
// docs/referencias-upds). Es una versión jugable, no un relevamiento: se
// recorre la planta baja y los pisos de arriba son fachada.
//
// Ejes: x corre a lo largo de la calle; la línea de fachadas está en z = 0;
// los edificios quedan en z < 0 y la calle en z > 0. Unidades ≈ metros.
//
//        z > 0   ─────────────── calle ───────────────
//        z = 0   [ edificio nuevo ][ edificio antiguo (ala de la calle) ]
//                  entrada │ escalera  │ patio con galerías y aulas    │ recepción
//                    vestíbulo         │                               │
//                          │ pasillo ──┘ bajada al patio               │
//                  (torre de 11 niveles)[ edificio antiguo (ala del fondo) ]
//                                                         [ cancha ]
//
// El edificio nuevo (CAMPUS-02) sale de los planos de la ampliación
// (docs/mapas, fuera del repo), con medidas redondeadas. En la realidad el
// terreno sube hacia el fondo: la calle entra al nivel 1 y el patio queda a la
// altura del nivel 4. El juego es plano, así que se juntan las dos plantas:
// del nivel 1, la entrada, el vestíbulo y la escalera junto a la fachada; del
// nivel 4, el pasillo del lado del edificio antiguo y la bajada al patio.
//
// Lógica pura, sin three.js, para probarla con node --test: la escena
// (Campus.tsx), la colisión del avatar y la tecla E salen de este plano.

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface AulaPlano {
  id: number | string;
  docenteId?: string | number | null;
  docenteNombre?: string | null;
}

export interface PuertaAula {
  id: string;
  /** Centro de la puerta, sobre la pared. */
  x: number;
  z: number;
  /** Ala en la que está: la de la calle (la puerta mira hacia -z) o la del fondo (mira hacia +z). */
  lado: 'calle' | 'fondo';
  /** Punto frente a la puerta, dentro del patio: ahí se para quien quiere entrar. */
  frente: [number, number];
}

export interface PlanoCampus {
  /** Fin del edificio antiguo sobre la calle; crece si hay muchas aulas. */
  xFin: number;
  calleAncho: number;
  edificioNuevo: Rect;
  alaCalle: Rect;
  alaFondo: Rect;
  patio: Rect;
  cancha: Rect;
  /** Pasillo de la recepción (calle → patio) y del ala del fondo (patio → cancha). */
  pasoRecepcion: Rect;
  pasoCancha: Rect;
  /** Edificio nuevo: puerta de la calle, vestíbulo, pasillo y bajada al patio (transitables). */
  entradaNuevo: Rect;
  hallNuevo: Rect;
  pasilloNuevo: Rect;
  conexionNuevo: Rect;
  /** Escalera en U junto a la fachada (decorado; no se sube). */
  escaleraNuevo: Rect;
  escalera: Rect;
  columnas: [number, number][];
  /** Decorado de la calle que estorba el paso: árboles de la vereda, autos y motos estacionados. */
  arboles: [number, number][];
  autos: [number, number][];
  motos: [number, number][];
  puertas: PuertaAula[];
  transitable: Rect[];
  bloqueado: Rect[];
  aparicion: { position: [number, number, number]; rotation: [number, number, number] };
}

export const FACHADA_Z = 0;
export const ACERA = 3;
export const CALZADA = 8;
export const ACERA_ENFRENTE = 2;
export const PROF_ALA = 10;
export const PATIO_FONDO = 12;
export const GALERIA = 2.5;
export const X_INICIO_ANTIGUO = -10;
export const X_PRIMERA_PUERTA = -6;
export const PASO_PUERTAS = 4.5;
export const ANCHO_PASO = 4;
export const X_FIN_MINIMO = 28;
export const DISTANCIA_PUERTA = 3.2;

// Edificio nuevo (CAMPUS-02): 13 m de frente y 37 de fondo, pegado al antiguo
export const FRENTE_NUEVO = 13;
export const FONDO_NUEVO = 37;
/** Alto de la planta baja y de cada piso de arriba del edificio nuevo. */
export const PB_NUEVO = 3.6;
export const PISO_NUEVO = 3.7;
/** Nivel de piso de cada uno de los 11 niveles del edificio nuevo (el 1 es la calle). */
export const NIVELES_NUEVO: number[] = Array.from({ length: 11 }, (_, i) => (i === 0 ? 0 : PB_NUEVO + PISO_NUEVO * (i - 1)));
/** Losa de la cubierta del edificio nuevo, sobre el último nivel. */
export const ALTO_NUEVO = 38;
/** Muro del antiguo que cierra el patio del lado del nuevo (la culata), de x0 - 0,6 a x0. */
export const CULATA = 0.6;

const Z_PATIO_CALLE = FACHADA_Z - PROF_ALA; // -10
const Z_PATIO_FONDO = Z_PATIO_CALLE - PATIO_FONDO; // -22
const Z_FIN_FONDO = Z_PATIO_FONDO - PROF_ALA; // -32

/** Agrupa por docente (orden alfabético estable) para que sus aulas queden juntas. */
export function ordenarAulas<T extends AulaPlano>(aulas: T[]): T[] {
  const grupos = new Map<string, { etiqueta: string; aulas: T[] }>();
  for (const aula of aulas) {
    const clave = aula.docenteId != null ? `d-${aula.docenteId}` : `a-${aula.id}`;
    if (!grupos.has(clave)) grupos.set(clave, { etiqueta: aula.docenteNombre || String(aula.id), aulas: [] });
    grupos.get(clave)!.aulas.push(aula);
  }
  return [...grupos.values()].sort((a, b) => a.etiqueta.localeCompare(b.etiqueta)).flatMap((g) => g.aulas);
}

/** Largo del edificio antiguo para que entren las puertas de un lado antes del pasillo del fondo. */
export function xFinPara(cantidadAulas: number): number {
  const porLado = Math.max(1, Math.ceil(cantidadAulas / 2));
  const ultima = X_PRIMERA_PUERTA + PASO_PUERTAS * (porLado - 1);
  // La última puerta (1,2 m de ancho) termina antes del pasillo, que ocupa [xFin-8, xFin-4]
  return Math.max(X_FIN_MINIMO, Math.ceil(ultima + 9.75));
}

export function contiene(r: Rect, x: number, z: number): boolean {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}

export function calcularPlanoCampus(aulas: AulaPlano[]): PlanoCampus {
  const xFin = xFinPara(aulas.length);
  const calleAncho = ACERA + CALZADA + ACERA_ENFRENTE;

  const edificioNuevo: Rect = { x0: X_INICIO_ANTIGUO - FRENTE_NUEVO, x1: X_INICIO_ANTIGUO, z0: FACHADA_Z - FONDO_NUEVO, z1: FACHADA_Z };
  const alaCalle: Rect = { x0: X_INICIO_ANTIGUO, x1: xFin, z0: Z_PATIO_CALLE, z1: FACHADA_Z };
  const alaFondo: Rect = { x0: X_INICIO_ANTIGUO, x1: xFin, z0: Z_FIN_FONDO, z1: Z_PATIO_FONDO };
  const patio: Rect = { x0: X_INICIO_ANTIGUO + 0.5, x1: xFin - 0.5, z0: Z_PATIO_FONDO + 0.3, z1: Z_PATIO_CALLE - 0.3 };
  const pasoRecepcion: Rect = { x0: xFin - 8, x1: xFin - 4, z0: Z_PATIO_CALLE - 0.5, z1: FACHADA_Z + 0.5 };
  const pasoCancha: Rect = { x0: xFin - 8, x1: xFin - 4, z0: Z_FIN_FONDO - 0.5, z1: Z_PATIO_FONDO + 0.5 };
  const cancha: Rect = { x0: xFin - 24, x1: xFin, z0: Z_FIN_FONDO - 16, z1: Z_FIN_FONDO };
  // Del lado del antiguo, el pasillo y el vestíbulo llegan hasta la culata
  const xCulata = X_INICIO_ANTIGUO - CULATA;
  const entradaNuevo: Rect = { x0: -16.5, x1: -14.5, z0: -4.5, z1: FACHADA_Z + 0.5 };
  const hallNuevo: Rect = { x0: -17, x1: xCulata, z0: -8, z1: -4.5 };
  const escaleraNuevo: Rect = { x0: -14.3, x1: xCulata, z0: -4.5, z1: -0.3 };
  // La bajada al patio abre la culata a unos 19 m de la fachada; el pasillo termina ahí
  const conexionNuevo: Rect = { x0: -11.2, x1: X_INICIO_ANTIGUO + 0.7, z0: -21, z1: -17 };
  const pasilloNuevo: Rect = { x0: -13.5, x1: xCulata, z0: conexionNuevo.z0, z1: hallNuevo.z0 };

  // Escalera central del patio (decorado; no se sube)
  const xCentro = (patio.x0 + Math.min(patio.x1, xFin - 9)) / 2;
  const zCentro = (Z_PATIO_CALLE + Z_PATIO_FONDO) / 2;
  const escalera: Rect = { x0: xCentro - 5, x1: xCentro + 5, z0: zCentro - 1.6, z1: zCentro + 1.6 };

  // Puertas: primero el ala de la calle, después la del fondo, en orden de docente
  const ordenadas = ordenarAulas(aulas);
  const porLado = Math.ceil(ordenadas.length / 2);
  const puertas: PuertaAula[] = ordenadas.map((aula, i) => {
    const lado: PuertaAula['lado'] = i < porLado ? 'calle' : 'fondo';
    const indice = lado === 'calle' ? i : i - porLado;
    const x = X_PRIMERA_PUERTA + PASO_PUERTAS * indice;
    const z = lado === 'calle' ? Z_PATIO_CALLE : Z_PATIO_FONDO;
    const frente: [number, number] = [x, lado === 'calle' ? z - DISTANCIA_PUERTA : z + DISTANCIA_PUERTA];
    return { id: String(aula.id), x, z, lado, frente };
  });

  // Columnas de las galerías, entre puerta y puerta
  const columnas: [number, number][] = [];
  for (let x = X_PRIMERA_PUERTA - PASO_PUERTAS / 2; x < xFin - 1; x += PASO_PUERTAS) {
    if (x < X_INICIO_ANTIGUO + 1) continue;
    columnas.push([x, Z_PATIO_CALLE - GALERIA]);
    columnas.push([x, Z_PATIO_FONDO + GALERIA]);
  }

  const calle: Rect = { x0: -34, x1: xFin + 10, z0: FACHADA_Z + 0.4, z1: FACHADA_Z + calleAncho - 0.4 };
  const transitable = [calle, pasoRecepcion, entradaNuevo, hallNuevo, pasilloNuevo, conexionNuevo, patio, pasoCancha, cancha];

  // Árboles al borde de la vereda, sin tapar las dos entradas
  const zArbol = FACHADA_Z + ACERA - 0.6;
  const libre = (x: number) =>
    (x < entradaNuevo.x0 - 1.5 || x > entradaNuevo.x1 + 1.5) && (x < pasoRecepcion.x0 - 1.5 || x > pasoRecepcion.x1 + 1.5);
  const arboles: [number, number][] = [];
  for (let x = -30; x <= xFin + 8; x += 9) if (libre(x)) arboles.push([x, zArbol]);
  // Autos y motos junto al cordón, como en la foto del frontis
  const zAuto = FACHADA_Z + ACERA + 1.3;
  const autos: [number, number][] = [
    [-2, zAuto],
    [9, zAuto],
  ];
  const motos: [number, number][] = [];
  for (let x = 14; x <= 18.6; x += 0.9) motos.push([x, FACHADA_Z + ACERA + 0.8]);

  const bloqueado: Rect[] = [
    escalera,
    ...columnas.map(([x, z]) => ({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 })),
    ...arboles.map(([x, z]) => ({ x0: x - 0.35, x1: x + 0.35, z0: z - 0.35, z1: z + 0.35 })),
    ...autos.map(([x, z]) => ({ x0: x - 2.2, x1: x + 2.2, z0: z - 0.95, z1: z + 0.95 })),
    ...(motos.length
      ? [{ x0: motos[0][0] - 0.4, x1: motos[motos.length - 1][0] + 0.4, z0: motos[0][1] - 0.9, z1: motos[0][1] + 0.9 }]
      : []),
  ];

  return {
    xFin,
    calleAncho,
    edificioNuevo,
    alaCalle,
    alaFondo,
    patio,
    cancha,
    pasoRecepcion,
    pasoCancha,
    entradaNuevo,
    hallNuevo,
    pasilloNuevo,
    conexionNuevo,
    escaleraNuevo,
    escalera,
    columnas,
    arboles,
    autos,
    motos,
    puertas,
    transitable,
    bloqueado,
    // En la vereda, frente a la recepción, mirando a la fachada
    aparicion: { position: [xFin - 6, 0, FACHADA_Z + 2], rotation: [0, Math.PI, 0] },
  };
}

/** ¿Puede pararse el avatar en (x, z)? Dentro de alguna zona transitable y fuera de los obstáculos. */
export function esTransitable(plano: PlanoCampus, x: number, z: number): boolean {
  if (!plano.transitable.some((r) => contiene(r, x, z))) return false;
  return !plano.bloqueado.some((r) => contiene(r, x, z));
}

/** Puerta más cercana a (x, z) a menos de `maxima`, o null. */
export function puertaCercana(plano: PlanoCampus, x: number, z: number, maxima = 3.5): PuertaAula | null {
  let mejor: PuertaAula | null = null;
  let distancia = maxima;
  for (const p of plano.puertas) {
    const d = Math.hypot(x - p.frente[0], z - p.frente[1]);
    if (d < distancia) {
      distancia = d;
      mejor = p;
    }
  }
  return mejor;
}
