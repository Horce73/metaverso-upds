// Plano del campus UPDS (CAMPUS-01): la manzana de la universidad en Sucre,
// a partir del frontis, la vista satelital y los planos de evacuación (ver
// docs/referencias-upds). Es una versión jugable, no un relevamiento: se
// recorren la planta baja y un nivel alto (CAMPUS-03); lo de más arriba es
// fachada.
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
// Nivel alto (CAMPUS-03), a NIVEL_ALTO sobre el patio, con el mismo truco: en
// la realidad el primer piso del antiguo, el nivel 5 del nuevo y la cancha
// quedan a unos 3 m sobre el patio, y el nivel 2 del nuevo (adonde llega la
// escalera en U) a lo mismo sobre la calle. Se llega por la escalera del patio
// (su descanso es una pasarela entre las dos galerías), por la escalera en U
// del vestíbulo y por las gradas de la cancha; el piso alto del nuevo sale a
// la galería del ala del fondo por la culata.
//
// Altura: cada zona caminable es una superficie plana o una rampa (las
// escaleras: la altura sube pareja, a ras de los peldaños). El avatar pisa la
// superficie alcanzable de un paso desde donde está (ESCALON): así el borde de
// una galería hace de baranda (el patio está 3,6 m más abajo) y el patio no
// sube a la galería sin la escalera. Los obstáculos ocupan un tramo de altura y
// sólo estorban a quien camina a esa altura.
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

/** Escalera vista como rampa: la altura va de y0 (en `desde`) a y1 (en `hasta`) a lo largo de `eje`, y se mantiene más allá. */
export interface Rampa {
  eje: 'x' | 'z';
  desde: number;
  hasta: number;
  y0: number;
  y1: number;
}

/** Zona caminable: un piso plano a la altura `y` o, si trae rampa, un tramo de escalera. */
export interface Superficie extends Rect {
  y: number;
  rampa?: Rampa;
}

/** Obstáculo que ocupa de y0 a y1 (una columna, un auto, el muro entre dos tramos). */
export interface Bloqueo extends Rect {
  y0: number;
  y1: number;
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
  /** Escalera en U junto a la fachada: sube del vestíbulo al piso alto. */
  escaleraNuevo: Rect;
  /** Escalera del patio: dos tramos que suben hacia el centro, donde sale la pasarela. */
  escalera: Rect;
  /** Nivel alto (CAMPUS-03): galerías del primer piso y la pasarela que las une. */
  galeriaCalle: Rect;
  galeriaFondo: Rect;
  pasarela: Rect;
  /** Piso alto del edificio nuevo y su salida a la galería del fondo. */
  hallAlto: Rect;
  pasilloAlto: Rect;
  conexionAlta: Rect;
  /** Gradas que suben del pasillo del ala del fondo a la cancha elevada. */
  gradasCancha: Rect;
  columnas: [number, number][];
  /** Decorado de la calle que estorba el paso: árboles de la vereda, autos y motos estacionados. */
  arboles: [number, number][];
  autos: [number, number][];
  motos: [number, number][];
  puertas: PuertaAula[];
  superficies: Superficie[];
  bloqueado: Bloqueo[];
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

// Edificio antiguo: alto de la planta baja y de cada piso de arriba
export const PB_ANTIGUO = 3.6;
export const PISO_ANTIGUO = 3.2;
/** Nivel alto (CAMPUS-03): galerías del primer piso, piso alto del nuevo y cancha. */
export const NIVEL_ALTO = PB_ANTIGUO;
/** Desnivel que el avatar sube o baja de un paso: un cordón, medio peldaño. */
export const ESCALON = 0.45;
/** Alto del cuerpo del avatar: un obstáculo más bajo que el escalón se pisa, uno más alto que la cabeza no estorba. */
export const ALTO_CUERPO = 1.7;
/** Largo máximo de cada tramo en que se parte un paso del avatar (con pocos FPS un paso es largo). */
export const PASO_MAXIMO = 0.2;
/** Grosor del parapeto de las galerías y de la pasarela. */
export const PARAPETO = 0.25;
export const PELDANOS_PATIO = 12;
export const PELDANOS_U = 11;
export const PELDANOS_CANCHA = 16;
/** Largo de las gradas de la cancha, entre el ala del fondo y la cancha. */
export const LARGO_GRADAS = 6;

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
/** Revestimiento blanco del lado del nuevo, para que por dentro no se vea el ladrillo de la culata. */
export const REVESTIMIENTO = 0.15;

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

function plana(r: Rect, y = 0): Superficie {
  return { ...r, y };
}

/**
 * Tramo de escalera de `peldanos` peldaños que sube de yBase (en `desde`) a
 * yTope (en `hasta`). La rampa pasa por el centro de la huella de cada
 * peldaño: arranca medio peldaño arriba del piso y llega al tope medio
 * peldaño antes del final.
 */
function tramo(r: Rect, eje: Rampa['eje'], desde: number, hasta: number, peldanos: number, yBase: number, yTope: number): Superficie {
  const huella = (hasta - desde) / peldanos;
  const contra = (yTope - yBase) / peldanos;
  return { ...r, y: yBase, rampa: { eje, desde, hasta: desde + huella * (peldanos - 0.5), y0: yBase + contra / 2, y1: yTope } };
}

/** El rectángulo `r` sin el hueco `h` (hasta cuatro pedazos). */
function restar(r: Rect, h: Rect): Rect[] {
  const partes: Rect[] = [];
  if (h.x0 > r.x0) partes.push({ x0: r.x0, x1: h.x0, z0: r.z0, z1: r.z1 });
  if (h.x1 < r.x1) partes.push({ x0: h.x1, x1: r.x1, z0: r.z0, z1: r.z1 });
  const x0 = Math.max(r.x0, h.x0);
  const x1 = Math.min(r.x1, h.x1);
  if (h.z0 > r.z0) partes.push({ x0, x1, z0: r.z0, z1: h.z0 });
  if (h.z1 < r.z1) partes.push({ x0, x1, z0: h.z1, z1: r.z1 });
  return partes;
}

function obstaculo(x: number, z: number, radio: number, y0: number, y1: number): Bloqueo {
  return { x0: x - radio, x1: x + radio, z0: z - radio, z1: z + radio, y0, y1 };
}

export function calcularPlanoCampus(aulas: AulaPlano[]): PlanoCampus {
  const xFin = xFinPara(aulas.length);
  const calleAncho = ACERA + CALZADA + ACERA_ENFRENTE;

  const edificioNuevo: Rect = { x0: X_INICIO_ANTIGUO - FRENTE_NUEVO, x1: X_INICIO_ANTIGUO, z0: FACHADA_Z - FONDO_NUEVO, z1: FACHADA_Z };
  const alaCalle: Rect = { x0: X_INICIO_ANTIGUO, x1: xFin, z0: Z_PATIO_CALLE, z1: FACHADA_Z };
  const alaFondo: Rect = { x0: X_INICIO_ANTIGUO, x1: xFin, z0: Z_FIN_FONDO, z1: Z_PATIO_FONDO };
  const patio: Rect = { x0: X_INICIO_ANTIGUO + 0.5, x1: xFin - 0.5, z0: Z_PATIO_FONDO + 0.3, z1: Z_PATIO_CALLE - 0.3 };
  const pasoRecepcion: Rect = { x0: xFin - 8, x1: xFin - 4, z0: Z_PATIO_CALLE - 0.5, z1: FACHADA_Z + 0.5 };
  const pasoCancha: Rect = { x0: xFin - 8, x1: xFin - 4, z0: Z_FIN_FONDO - 0.3, z1: Z_PATIO_FONDO + 0.5 };
  // Detrás del ala del fondo, gradas hasta la cancha elevada (al nivel de las galerías)
  const gradasCancha: Rect = { x0: pasoCancha.x0, x1: pasoCancha.x1, z0: Z_FIN_FONDO - LARGO_GRADAS, z1: Z_FIN_FONDO };
  const cancha: Rect = { x0: xFin - 24, x1: xFin, z0: gradasCancha.z0 - 16, z1: gradasCancha.z0 };
  // Del lado del antiguo, el pasillo y el vestíbulo llegan hasta el revestimiento de la culata
  const xCulata = X_INICIO_ANTIGUO - CULATA - REVESTIMIENTO;
  const entradaNuevo: Rect = { x0: -16.5, x1: -14.5, z0: -4.5, z1: FACHADA_Z + 0.5 };
  const hallNuevo: Rect = { x0: -17, x1: xCulata, z0: -8, z1: -4.5 };
  const escaleraNuevo: Rect = { x0: -14.3, x1: xCulata, z0: -4.5, z1: -0.3 };
  // La bajada al patio abre la culata a unos 19 m de la fachada; el pasillo termina ahí
  const conexionNuevo: Rect = { x0: -11.2, x1: X_INICIO_ANTIGUO + 0.7, z0: -21, z1: -17 };
  const pasilloNuevo: Rect = { x0: -13.5, x1: xCulata, z0: conexionNuevo.z0, z1: hallNuevo.z0 };

  // Escalera central del patio. Su centro va frente a una puerta, a medio
  // camino entre dos columnas: ahí llega la pasarela a cada galería
  const xMedio = (patio.x0 + Math.min(patio.x1, xFin - 9)) / 2;
  const xCentro = X_PRIMERA_PUERTA + PASO_PUERTAS * Math.round((xMedio - X_PRIMERA_PUERTA) / PASO_PUERTAS);
  const zCentro = (Z_PATIO_CALLE + Z_PATIO_FONDO) / 2;
  const escalera: Rect = { x0: xCentro - 5, x1: xCentro + 5, z0: zCentro - 1.6, z1: zCentro + 1.6 };

  // Nivel alto del antiguo: las galerías (entre el parapeto y el muro del ala)
  // y la pasarela que sale del descanso de la escalera hacia las dos
  const galeriaCalle: Rect = { x0: X_INICIO_ANTIGUO + 0.1, x1: xFin - 0.6, z0: Z_PATIO_CALLE - GALERIA + PARAPETO, z1: Z_PATIO_CALLE - 0.3 };
  const galeriaFondo: Rect = { x0: X_INICIO_ANTIGUO + 0.1, x1: xFin - 0.6, z0: Z_PATIO_FONDO + 0.3, z1: Z_PATIO_FONDO + GALERIA - PARAPETO };
  const pasarela: Rect = { x0: xCentro - 1, x1: xCentro + 1, z0: galeriaFondo.z1 - 0.05, z1: galeriaCalle.z0 + 0.05 };

  // Piso alto del nuevo: sobre el vestíbulo y el pasillo; el pasillo sigue
  // hasta la galería del fondo y sale a ella por la culata
  const hallAlto: Rect = { x0: hallNuevo.x0, x1: xCulata, z0: hallNuevo.z0, z1: escaleraNuevo.z0 };
  const pasilloAlto: Rect = { x0: pasilloNuevo.x0, x1: xCulata, z0: galeriaFondo.z0, z1: hallNuevo.z0 };
  const conexionAlta: Rect = { x0: xCulata - 0.3, x1: X_INICIO_ANTIGUO + 0.7, z0: galeriaFondo.z0 + 0.1, z1: galeriaFondo.z1 };

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
  // Escalera en U: primer tramo hacia la fachada, descanso y segundo tramo de vuelta
  const medioU = (escaleraNuevo.x0 + escaleraNuevo.x1) / 2;
  const descansoU = escaleraNuevo.z1 - 1.2;
  const huellaU = (descansoU - escaleraNuevo.z0) / PELDANOS_U;

  const superficies: Superficie[] = [
    // Planta baja (el patio, sin el hueco de la escalera: por debajo no se pasa)
    ...[calle, pasoRecepcion, entradaNuevo, hallNuevo, pasilloNuevo, conexionNuevo, pasoCancha].map((r) => plana(r)),
    ...restar(patio, escalera).map((r) => plana(r)),
    // Escalera del patio: un tramo desde cada punta hasta la pasarela
    tramo({ ...escalera, x1: xCentro - 1 }, 'x', escalera.x0, xCentro - 1, PELDANOS_PATIO, 0, NIVEL_ALTO),
    tramo({ ...escalera, x0: xCentro + 1 }, 'x', escalera.x1, xCentro + 1, PELDANOS_PATIO, 0, NIVEL_ALTO),
    // Escalera en U del nuevo
    tramo({ ...escaleraNuevo, x1: medioU - 0.05, z1: descansoU }, 'z', escaleraNuevo.z0, descansoU, PELDANOS_U, 0, NIVEL_ALTO / 2),
    plana({ ...escaleraNuevo, z0: descansoU }, NIVEL_ALTO / 2),
    tramo({ ...escaleraNuevo, x0: medioU + 0.05, z1: descansoU }, 'z', descansoU, escaleraNuevo.z0, PELDANOS_U, NIVEL_ALTO / 2, NIVEL_ALTO),
    // Gradas de la cancha
    tramo(gradasCancha, 'z', gradasCancha.z1, gradasCancha.z0, PELDANOS_CANCHA, 0, NIVEL_ALTO),
    // Nivel alto
    ...[galeriaCalle, galeriaFondo, pasarela, hallAlto, pasilloAlto, conexionAlta, cancha].map((r) => plana(r, NIVEL_ALTO)),
  ];

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

  const bloqueado: Bloqueo[] = [
    // Columnas de las galerías, abajo y arriba
    ...columnas.map(([x, z]) => obstaculo(x, z, 0.3, 0, NIVEL_ALTO)),
    ...columnas.map(([x, z]) => obstaculo(x, z, 0.3, NIVEL_ALTO, NIVEL_ALTO + PISO_ANTIGUO)),
    // Muro entre los dos tramos de la escalera en U
    { x0: medioU - 0.06, x1: medioU + 0.06, z0: escaleraNuevo.z0 + huellaU, z1: descansoU, y0: 0, y1: NIVEL_ALTO },
    ...arboles.map(([x, z]) => obstaculo(x, z, 0.35, 0, 6)),
    ...autos.map(([x, z]) => ({ x0: x - 2.2, x1: x + 2.2, z0: z - 0.95, z1: z + 0.95, y0: 0, y1: 1.6 })),
    ...(motos.length
      ? [{ x0: motos[0][0] - 0.4, x1: motos[motos.length - 1][0] + 0.4, z0: motos[0][1] - 0.9, z1: motos[0][1] + 0.9, y0: 0, y1: 1.2 }]
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
    galeriaCalle,
    galeriaFondo,
    pasarela,
    hallAlto,
    pasilloAlto,
    conexionAlta,
    gradasCancha,
    columnas,
    arboles,
    autos,
    motos,
    puertas,
    superficies,
    bloqueado,
    // En la vereda, frente a la recepción, mirando a la fachada
    aparicion: { position: [xFin - 6, 0, FACHADA_Z + 2], rotation: [0, Math.PI, 0] },
  };
}

/** Altura del piso de la superficie en (x, z), que se supone dentro de ella. */
export function alturaSuperficie(s: Superficie, x: number, z: number): number {
  const r = s.rampa;
  if (!r) return s.y;
  const t = Math.min(1, Math.max(0, ((r.eje === 'x' ? x : z) - r.desde) / (r.hasta - r.desde)));
  return r.y0 + (r.y1 - r.y0) * t;
}

/** ¿El obstáculo le estorba a quien está parado a la altura h? (lo pisa si es más bajo que un escalón) */
function estorba(b: Bloqueo, h: number): boolean {
  return h < b.y1 - ESCALON && h + ALTO_CUERPO > b.y0;
}

/**
 * Altura a la que queda el avatar si se para en (x, z) viniendo de la altura
 * `yActual`, o null si ahí no hay piso alcanzable de un paso (una pared, el
 * borde de la galería, el hueco de una escalera) o un obstáculo lo estorba.
 * Si hay dos pisos a mano (el pie de una escalera), el más cercano.
 */
export function alturaEn(plano: PlanoCampus, x: number, z: number, yActual = 0): number | null {
  let mejor: number | null = null;
  for (const s of plano.superficies) {
    if (!contiene(s, x, z)) continue;
    const h = alturaSuperficie(s, x, z);
    const salto = Math.abs(h - yActual);
    if (salto > ESCALON) continue;
    if (mejor !== null) {
      const saltoMejor = Math.abs(mejor - yActual);
      // Más cerca gana; a la par, la más alta (el primer peldaño sobre el piso)
      const gana = salto < saltoMejor - 1e-9 || (salto <= saltoMejor + 1e-9 && h > mejor);
      if (!gana) continue;
    }
    if (plano.bloqueado.some((b) => contiene(b, x, z) && estorba(b, h))) continue;
    mejor = h;
  }
  return mejor;
}

/** ¿Puede pararse el avatar en (x, z) viniendo de la altura y (por defecto, la planta baja)? */
export function esTransitable(plano: PlanoCampus, x: number, z: number, y = 0): boolean {
  return alturaEn(plano, x, z, y) !== null;
}

/**
 * Un paso del avatar: de (x, y, z) hacia (x + dx, z + dz). Se parte en tramos
 * cortos para que la altura siga la escalera y un paso largo (pocos FPS, una
 * pestaña que vuelve) no atraviese una pared. Si un tramo choca, se intenta
 * deslizar sólo en x o sólo en z; si tampoco, se queda donde llegó.
 */
export function caminar(plano: PlanoCampus, x: number, y: number, z: number, dx: number, dz: number): [number, number, number] {
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / PASO_MAXIMO));
  const sx = dx / n;
  const sz = dz / n;
  for (let i = 0; i < n; i++) {
    let h = alturaEn(plano, x + sx, z + sz, y);
    if (h !== null) {
      x += sx;
      z += sz;
    } else if ((h = alturaEn(plano, x + sx, z, y)) !== null) {
      x += sx;
    } else if ((h = alturaEn(plano, x, z + sz, y)) !== null) {
      z += sz;
    } else {
      break;
    }
    y = h;
  }
  return [x, y, z];
}

/** Puerta más cercana a (x, z) a menos de `maxima`, o null. Las puertas están en la planta baja: desde arriba no se abren. */
export function puertaCercana(plano: PlanoCampus, x: number, z: number, maxima = 3.5, y = 0): PuertaAula | null {
  if (y > ESCALON) return null;
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
