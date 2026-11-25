// Plano del campus UPDS: la manzana de la universidad en Sucre. Es una
// versión jugable, no un relevamiento: se juntan plantas que en la realidad
// están a distinta altura, y lo de más arriba es fachada.
//
// Ejes: x corre a lo largo de la calle; la línea de fachadas está en z = 0;
// los edificios quedan en z < 0 y la calle en z > 0. Unidades ≈ metros.
//
//        z > 0   ─────────────────── calle ───────────────────
//        z = 0   [ edificio nuevo ][ edificio antiguo (ala de la calle) ][núcleo]
//                  (nivel 1: entrada, vestíbulo, escalera; hall, pasillo de conexión)
//        nivel 4   │escalera│ ── pasillo de las aulas ────────────── │ascensor
//                  pasillo │        [ fila de 5 aulas            ]  paso    ╱
//                  del     │ ─ escalones ─ patio ───────── fuente ─ gradas ╱ auditorio
//                  nuevo   │ patio [ bloque central: cafetería,   ] área  ╱ (cancha
//                          │ este  [ hall, biblioteca, depósitos  ] de    ╱  encima)
//                          │ ─────────── pasillo del fondo ──────── esparcimiento
//
// El edificio nuevo (CAMPUS-02) y el antiguo (CAMPUS-04 y 05) salen de los
// planos arquitectónicos de 2024 (docs/mapas, fuera del repo), con medidas
// redondeadas. Los niveles van a su altura real (CAMPUS-05): la calle entra
// al nivel 1; detrás del ala de la calle el terreno sube y el patio del
// antiguo queda a la altura del nivel 4 del nuevo (NIVEL_4, unos 11 m). Del
// nivel 1 se recorren los dos ingresos del antiguo, su hall y el pasillo de
// conexión, y la entrada y el vestíbulo del nuevo. Se sube por la escalera en
// U del nuevo, que para en los niveles 2 y 3 (sólo sus descansos y el pasillo
// del nivel 2, CAMPUS-03), o por el ascensor del núcleo del antiguo (tecla E).
// En el nivel 4: el pasillo del nuevo, el pasillo de las aulas del antiguo y
// lo que da al patio, con sus desniveles: el patio un poco más alto que los
// pasillos (NIVEL_PATIO), el bloque central un poco más que el patio y el área
// de esparcimiento con la cancha, sobre el auditorio, más arriba
// (NIVEL_ESPARCIMIENTO). El pasillo de las aulas (+10,36) y el del nuevo
// (+10,90) quedan juntos en NIVEL_4.
//
// En la realidad las filas del antiguo están giradas unos 3° respecto del
// nuevo: acá van alineadas a los ejes. El auditorio y la cancha, girados 115°
// junto al lindero, conservan su giro (Rect.giro).
//
// La conexión con el piso de arriba de las aulas (nivel 5) queda para otra tanda.
//
// Altura: cada zona caminable es una superficie plana o una rampa (las
// escaleras: la altura sube pareja, a ras de los peldaños). El avatar pisa la
// superficie alcanzable de un paso desde donde está (ESCALON): así el borde
// del área de esparcimiento hace de baranda y el patio no sube a ella sin la
// escalera. Los obstáculos ocupan un tramo de altura y sólo estorban a quien
// camina a esa altura.
//
// Lógica pura, sin three.js, para probarla con node --test: la escena
// (Campus.tsx), la colisión del avatar y la tecla E salen de este plano.

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /**
   * Giro alrededor del centro, en radianes, con el mismo sentido que
   * rotation.y de three.js: el eje x propio del rectángulo apunta en el mundo
   * hacia (cos giro, -sin giro). Sin giro, el rectángulo va alineado a los ejes.
   */
  giro?: number;
}

export interface AulaPlano {
  id: number | string;
  docenteId?: string | number | null;
  docenteNombre?: string | null;
}

export interface PuertaAula {
  id: string;
  /** Centro de la puerta, sobre la pared, y la altura del piso frente a ella. */
  x: number;
  z: number;
  y: number;
  /** Giro (rotation.y) que deja la cara de la puerta mirando al pasillo: 0 mira hacia +z, π hacia -z, π/2 hacia +x. */
  giro: number;
  /** Punto frente a la puerta, en el pasillo: ahí se para quien quiere entrar. */
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

/** Puerta del ascensor en una parada: se le pone E delante y lleva a la otra. */
export interface ParadaAscensor {
  nombre: string;
  x: number;
  z: number;
  y: number;
  giro: number;
  frente: [number, number];
  /** Donde aparece quien llega: unos pasos delante de la puerta, para que la cámara (detrás) no quede en el muro. */
  llegada: [number, number];
}

/** Obstáculo que ocupa de y0 a y1 (una mesa, un árbol, un auto, el muro entre dos tramos). */
export interface Bloqueo extends Rect {
  y0: number;
  y1: number;
}

export interface PlanoCampus {
  /** Fin del edificio antiguo sobre la calle, donde llega el lindero. */
  xFin: number;
  calleAncho: number;
  edificioNuevo: Rect;
  alaCalle: Rect;
  /** Escalera, ascensor y baños del antiguo, en la punta del ala de la calle. */
  nucleo: Rect;
  /** Nivel 1 del antiguo: el ingreso principal (el del letrero), el ingreso vidriado junto al nuevo, el hall y el pasillo de conexión por detrás. */
  pasoRecepcion: Rect;
  entradaAntigua: Rect;
  hallAntiguo: Rect;
  pasilloConexion: Rect;
  /** Puerta entre el vestíbulo del nuevo y el hall del antiguo (nivel 1). */
  conexionNuevo: Rect;
  /** Ascensor del núcleo: una parada en el pasillo de conexión (calle) y otra en el pasillo de las aulas (nivel 4). */
  ascensor: ParadaAscensor[];
  /** Pasillo de las aulas (+10,36 en la realidad), entre el ala de la calle y la fila. */
  corredor: Rect;
  /** Fila de cinco aulas, con la puerta al corredor y las ventanas al patio. */
  filaAulas: Rect;
  /** Paso entre la fila y el auditorio, del corredor a la escalera del patio. */
  pasoOeste: Rect;
  /** Escalera en abanico del paso al patio. */
  escaleraPatio: Rect;
  /** Descanso al pie de la escalera del patio, junto a la de esparcimiento. */
  descanso: Rect;
  /** Patio (+12,00): franja entre la fila y el bloque central, costado de la fuente y costado del nuevo. */
  patio: Rect;
  patioOeste: Rect;
  patioEste: Rect;
  /** Pasillo del fondo, contra el muro de contención. */
  pasilloFondo: Rect;
  /** Bloque central (+12,30): cafetería y hall se caminan, el resto es macizo. */
  bloqueCentral: Rect;
  cafeteria: Rect;
  hall: Rect;
  /** Puertas de la cafetería: al patio y al hall (vanos en el muro). */
  puertaCafeteria: Rect;
  puertaHall: Rect;
  /** Escalera que sube del patio al área de esparcimiento (+15,20). */
  escaleraEsparcimiento: Rect;
  /** Área de esparcimiento, sobre el terreno natural, en dos pedazos (el de la escalera y el resto). */
  esparcimiento: Rect[];
  /** Auditorio junto al lindero, girado; la cancha es su techo. */
  auditorio: Rect;
  cancha: Rect;
  fuente: { x: number; z: number; radio: number };
  /** Árboles del patio, en maceteros. */
  arbolesPatio: [number, number][];
  /** Mesas redondas de la cafetería. */
  mesas: [number, number][];
  /** Edificio nuevo: puerta de la calle y vestíbulo (nivel 1), pasillo junto al antiguo y escalones al patio (nivel 4). */
  entradaNuevo: Rect;
  hallNuevo: Rect;
  pasilloNuevo: Rect;
  escalonesNuevo: Rect;
  /** Escalera en U junto a la fachada: sube del vestíbulo, piso a piso, hasta el nivel 4. */
  escaleraNuevo: Rect;
  /** Descansos de la escalera en los niveles 2, 3 y 4 (el del 4 da al pasillo); el del 2 sigue en un pasillo (CAMPUS-03). */
  hallAlto: Rect;
  hallesNuevo: { rect: Rect; y: number }[];
  pasilloAlto: Rect;
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
/** Fondo del ala de la calle hasta el pasillo de las aulas. */
export const PROF_ALA = 10.5;
export const X_INICIO_ANTIGUO = -10;
/** Donde el lindero del oeste corta la línea de fachadas. */
export const X_FIN = 22.5;
export const ANCHO_PASO = 4;

// Edificio nuevo (CAMPUS-02): 13 m de frente y 37 de fondo, pegado al antiguo
export const FRENTE_NUEVO = 13;
export const FONDO_NUEVO = 37;
/** Alto de la planta baja y de cada piso de arriba del edificio nuevo. */
export const PB_NUEVO = 3.6;
export const PISO_NUEVO = 3.7;
/** Nivel de piso de cada uno de los 11 niveles del edificio nuevo (el 1 es la calle). */
export const NIVELES_NUEVO: number[] = Array.from({ length: 11 }, (_, i) => (i === 0 ? 0 : PB_NUEVO + PISO_NUEVO * (i - 1)));
/** Nivel 4 (+10,90): el pasillo del nuevo y el de las aulas del antiguo. */
export const NIVEL_4 = NIVELES_NUEVO[3];

/** Alto de cada piso de la fila de aulas y del bloque central (de +10,36 a +13,31 en la realidad). */
export const PISO_FILA = 3;
// Edificio antiguo, ala de la calle: planta baja y tres pisos (2, 3 y el 4
// con las buhardillas), que llegan al techo del pasillo de las aulas
export const PB_ANTIGUO = 3.6;
export const PISO_ANTIGUO = (NIVEL_4 + PISO_FILA - PB_ANTIGUO) / 3;
/** Nivel alto (CAMPUS-03): el nivel 2 del nuevo. */
export const NIVEL_ALTO = NIVELES_NUEVO[1];
/** El patio (+12,00) sobre los pasillos del nivel 4. */
export const NIVEL_PATIO = NIVEL_4 + 1.1;
/** El bloque central (+12,30) queda un escalón bajo sobre el patio. */
export const NIVEL_BLOQUE = NIVEL_PATIO + 0.3;
/** Área de esparcimiento y cancha (+15,20): 16 peldaños sobre el patio. */
export const NIVEL_ESPARCIMIENTO = NIVEL_PATIO + 3.2;
/** Desnivel que el avatar sube o baja de un paso: un cordón, medio peldaño. */
export const ESCALON = 0.45;
/** Alto del cuerpo del avatar: un obstáculo más bajo que el escalón se pisa, uno más alto que la cabeza no estorba. */
export const ALTO_CUERPO = 1.7;
/** Largo máximo de cada tramo en que se parte un paso del avatar (con pocos FPS un paso es largo). */
export const PASO_MAXIMO = 0.2;
export const PELDANOS_PATIO = 8;
export const PELDANOS_U = 11;
export const PELDANOS_ESPARCIMIENTO = 16;
export const PELDANOS_NUEVO = 6;
/** Giro del auditorio y la cancha, paralelos al lindero del oeste. */
export const GIRO_OESTE = -2.01;

/** Losa de la cubierta del edificio nuevo, sobre el último nivel. */
export const ALTO_NUEVO = 38;
/** Muro del antiguo del lado del nuevo (la culata), de x0 - 0,6 a x0. */
export const CULATA = 0.6;
/** Revestimiento blanco del lado del nuevo, para que por dentro no se vea el ladrillo de la culata. */
export const REVESTIMIENTO = 0.15;

/** Puertas de las dos aulas de la buhardilla, sobre el muro del ala de la calle que da al pasillo. */
export const X_PUERTAS_BUHARDILLA = [3, -4.2];

/** Cuánto delante de la puerta del ascensor aparece quien llega (la cámara va 1,5 m detrás). */
const LLEGADA_ASCENSOR = 2.2;

/** Niveles donde para la escalera del nuevo: del 1 al 4. */
const NIVELES_ESCALERA = NIVELES_NUEVO.slice(0, 4);

/** Distancia del punto de espera a la puerta, en pasillos de 2,5 a 3 m: frente a frente, cada uno queda del lado de su puerta. */
const FRENTE_PUERTA = 0.9;
/** Puertas genéricas (aulas que no entran en los lugares del plano): separación mínima entre centros. */
const SEPARACION_GENERICA = 1.7;

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

export function contiene(r: Rect, x: number, z: number): boolean {
  if (!r.giro) return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
  // Al marco propio del rectángulo: la inversa del giro de three.js
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const c = Math.cos(r.giro);
  const s = Math.sin(r.giro);
  const lx = (x - cx) * c - (z - cz) * s;
  const lz = (x - cx) * s + (z - cz) * c;
  return Math.abs(lx) <= (r.x1 - r.x0) / 2 && Math.abs(lz) <= (r.z1 - r.z0) / 2;
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

function obstaculo(x: number, z: number, radio: number, y0: number, y1: number): Bloqueo {
  return { x0: x - radio, x1: x + radio, z0: z - radio, z1: z + radio, y0, y1 };
}

/** Rectángulo girado de largo × ancho centrado en (x, z). */
function girado(x: number, z: number, largo: number, ancho: number, giro: number): Rect {
  return { x0: x - largo / 2, x1: x + largo / 2, z0: z - ancho / 2, z1: z + ancho / 2, giro };
}

export function calcularPlanoCampus(aulas: AulaPlano[]): PlanoCampus {
  const xFin = X_FIN;
  const calleAncho = ACERA + CALZADA + ACERA_ENFRENTE;
  // Del lado del antiguo, los pasillos del nuevo llegan hasta el revestimiento de la culata
  const xCulata = X_INICIO_ANTIGUO - CULATA - REVESTIMIENTO;
  const zCorredor = FACHADA_Z - PROF_ALA; // -10,5

  const edificioNuevo: Rect = { x0: X_INICIO_ANTIGUO - FRENTE_NUEVO, x1: X_INICIO_ANTIGUO, z0: FACHADA_Z - FONDO_NUEVO, z1: FACHADA_Z };
  const alaCalle: Rect = { x0: X_INICIO_ANTIGUO, x1: xFin, z0: zCorredor, z1: FACHADA_Z };
  const nucleo: Rect = { x0: xFin, x1: 27, z0: zCorredor - 3, z1: -4 };

  // Nivel 1 del antiguo: ingreso principal (el del letrero) hasta el pasillo
  // de conexión, que corre por detrás hasta el hall del ingreso vidriado
  const pasilloConexion: Rect = { x0: -1, x1: xFin, z0: -7.5, z1: -5 };
  const pasoRecepcion: Rect = { x0: 16.5, x1: 16.5 + ANCHO_PASO, z0: pasilloConexion.z1, z1: FACHADA_Z + 0.5 };
  const hallAntiguo: Rect = { x0: -9.4, x1: pasilloConexion.x0, z0: pasilloConexion.z0, z1: FACHADA_Z - 0.3 };
  const entradaAntigua: Rect = { x0: -8.6, x1: -6.6, z0: hallAntiguo.z1, z1: FACHADA_Z + 0.5 };
  const conexionNuevo: Rect = { x0: xCulata, x1: hallAntiguo.x0, z0: -7, z1: -5.4 };

  // Pasillo de las aulas: de la culata (por donde se pasa al pasillo del
  // nuevo) hasta el núcleo; la fila de aulas, del lado del patio
  const corredor: Rect = { x0: xCulata, x1: xFin, z0: zCorredor - 3, z1: zCorredor };
  const filaAulas: Rect = { x0: X_INICIO_ANTIGUO, x1: 18.5, z0: corredor.z0 - 6, z1: corredor.z0 };
  const pasoOeste: Rect = { x0: filaAulas.x1, x1: 20.5, z0: filaAulas.z0, z1: corredor.z0 };
  const escaleraPatio: Rect = { x0: 14.5, x1: pasoOeste.x1, z0: filaAulas.z0 - 3, z1: filaAulas.z0 };
  const descanso: Rect = { x0: escaleraPatio.x0, x1: escaleraPatio.x1, z0: escaleraPatio.z0 - 1, z1: escaleraPatio.z0 };
  const escaleraEsparcimiento: Rect = { x0: descanso.x0, x1: descanso.x1, z0: descanso.z0 - 1.5, z1: descanso.z0 };

  // Patio y bloque central, de la culata al muro de contención del oeste (x = 14,5)
  const bloqueCentral: Rect = { x0: -6.5, x1: 11, z0: -36, z1: -24.5 };
  const patio: Rect = { x0: -7.5, x1: escaleraPatio.x0, z0: bloqueCentral.z1, z1: filaAulas.z0 };
  const patioOeste: Rect = { x0: bloqueCentral.x1, x1: escaleraPatio.x0, z0: bloqueCentral.z0, z1: bloqueCentral.z1 };
  const patioEste: Rect = { x0: -9.5, x1: bloqueCentral.x0, z0: bloqueCentral.z0, z1: bloqueCentral.z1 };
  const pasilloFondo: Rect = { x0: patioEste.x0, x1: escaleraPatio.x0, z0: -38.5, z1: bloqueCentral.z0 };
  const cafeteria: Rect = { x0: -6.2, x1: 1.5, z0: -30, z1: -24.8 };
  const hall: Rect = { x0: 1.8, x1: 3.2, z0: bloqueCentral.z0, z1: bloqueCentral.z1 };
  // Vanos de la cafetería: la puerta al patio y la que da al hall
  const puertaCafeteria: Rect = { x0: -4, x1: -2.2, z0: cafeteria.z1, z1: bloqueCentral.z1 };
  const puertaHall: Rect = { x0: cafeteria.x1, x1: hall.x0, z0: -28, z1: -26.8 };

  // Área de esparcimiento sobre el terreno natural, al oeste del patio, y el
  // auditorio con la cancha encima, junto al lindero
  const esparcimiento: Rect[] = [
    { x0: escaleraEsparcimiento.x1, x1: 25, z0: -37.5, z1: escaleraEsparcimiento.z1 },
    { x0: 15, x1: escaleraEsparcimiento.x1, z0: -37.5, z1: escaleraEsparcimiento.z0 },
  ];
  const auditorio = girado(28.7, -24.8, 17, 10, GIRO_OESTE);
  const cancha = auditorio;

  // Edificio nuevo: entrada y escalera junto a la fachada (nivel 1), pasillo
  // junto al antiguo y escalones al patio (nivel 4)
  const entradaNuevo: Rect = { x0: -16.5, x1: -14.5, z0: -4.5, z1: FACHADA_Z + 0.5 };
  const hallNuevo: Rect = { x0: -17, x1: xCulata, z0: -8, z1: -4.5 };
  const escaleraNuevo: Rect = { x0: -14.3, x1: xCulata, z0: -4.5, z1: -0.3 };
  const pasilloNuevo: Rect = { x0: -13.5, x1: xCulata, z0: bloqueCentral.z1, z1: hallNuevo.z0 };
  const escalonesNuevo: Rect = { x0: xCulata, x1: patio.x0, z0: -24, z1: -22 };
  const hallAlto: Rect = { x0: hallNuevo.x0, x1: xCulata, z0: hallNuevo.z0, z1: escaleraNuevo.z0 };
  const hallesNuevo = NIVELES_ESCALERA.slice(1).map((y) => ({ rect: hallAlto, y }));
  const pasilloAlto: Rect = { x0: pasilloNuevo.x0, x1: xCulata, z0: -21, z1: hallNuevo.z0 };

  // Ascensor: sus puertas, sobre el muro del núcleo, al final de cada pasillo
  const parada = (nombre: string, z: number, y: number): ParadaAscensor => ({
    nombre,
    x: xFin,
    z,
    y,
    giro: -Math.PI / 2,
    frente: [xFin - FRENTE_PUERTA, z],
    llegada: [xFin - LLEGADA_ASCENSOR, z],
  });
  const ascensor = [parada('la calle', (pasilloConexion.z0 + pasilloConexion.z1) / 2, 0), parada('el nivel 4', -12, NIVEL_4)];

  const fuente = { x: 13, z: -24, radio: 1 };
  const arbolesPatio: [number, number][] = [
    [7.5, -23.6],
    [-0.5, -23.6],
    [-3, -23.6],
    [-5.5, -23.6],
    [12.2, -26.4],
    [12.2, -33.2],
  ];
  const mesas: [number, number][] = [
    [-4.9, -27.2],
    [0, -26.1],
    [0.8, -28.4],
  ];

  const puertas = ubicarPuertas(ordenarAulas(aulas), { corredor, filaAulas, alaCalle, pasilloNuevo, pasilloFondo });

  const calle: Rect = { x0: -34, x1: xFin + 10, z0: FACHADA_Z + 0.4, z1: FACHADA_Z + calleAncho - 0.4 };
  // Escalera en U: en cada piso, primer tramo hacia la fachada, descanso y segundo tramo de vuelta
  const medioU = (escaleraNuevo.x0 + escaleraNuevo.x1) / 2;
  const descansoU = escaleraNuevo.z1 - 1.2;
  const huellaU = (descansoU - escaleraNuevo.z0) / PELDANOS_U;
  const pisosU = NIVELES_ESCALERA.slice(0, -1).map((y, i) => [y, NIVELES_ESCALERA[i + 1]]);

  const superficies: Superficie[] = [
    // Nivel 1: la calle, los ingresos y pasillos del antiguo y la entrada del nuevo
    ...[calle, pasoRecepcion, entradaAntigua, hallAntiguo, pasilloConexion, conexionNuevo, entradaNuevo, hallNuevo].map((r) => plana(r)),
    // Nivel 4: los dos pasillos y el paso al patio
    ...[corredor, pasoOeste, pasilloNuevo].map((r) => plana(r, NIVEL_4)),
    // Patio
    ...[patio, patioOeste, patioEste, pasilloFondo, descanso].map((r) => plana(r, NIVEL_PATIO)),
    tramo(escaleraPatio, 'z', escaleraPatio.z1, escaleraPatio.z0, PELDANOS_PATIO, NIVEL_4, NIVEL_PATIO),
    tramo(escalonesNuevo, 'x', escalonesNuevo.x0, escalonesNuevo.x1, PELDANOS_NUEVO, NIVEL_4, NIVEL_PATIO),
    // Bloque central
    ...[cafeteria, hall, puertaCafeteria, puertaHall].map((r) => plana(r, NIVEL_BLOQUE)),
    // Área de esparcimiento y cancha
    tramo(escaleraEsparcimiento, 'x', escaleraEsparcimiento.x0, escaleraEsparcimiento.x1, PELDANOS_ESPARCIMIENTO, NIVEL_PATIO, NIVEL_ESPARCIMIENTO),
    ...[...esparcimiento, cancha].map((r) => plana(r, NIVEL_ESPARCIMIENTO)),
    // Escalera en U del nuevo, piso a piso, con el descanso de cada nivel y el pasillo del nivel 2
    ...pisosU.flatMap(([y0, y1]) => {
      const medio = (y0 + y1) / 2;
      return [
        tramo({ ...escaleraNuevo, x1: medioU - 0.05, z1: descansoU }, 'z', escaleraNuevo.z0, descansoU, PELDANOS_U, y0, medio),
        plana({ ...escaleraNuevo, z0: descansoU }, medio),
        tramo({ ...escaleraNuevo, x0: medioU + 0.05, z1: descansoU }, 'z', descansoU, escaleraNuevo.z0, PELDANOS_U, medio, y1),
      ];
    }),
    ...hallesNuevo.map((h) => plana(h.rect, h.y)),
    plana(pasilloAlto, NIVEL_ALTO),
  ];

  // Árboles al borde de la vereda, sin tapar las dos entradas
  const zArbol = FACHADA_Z + ACERA - 0.6;
  const libre = (x: number) => [entradaNuevo, entradaAntigua, pasoRecepcion].every((r) => x < r.x0 - 1.5 || x > r.x1 + 1.5);
  const arboles: [number, number][] = [];
  for (let x = -30; x <= xFin + 8; x += 9) if (libre(x)) arboles.push([x, zArbol]);
  // Autos y motos junto al cordón, como en la foto del frontis
  const zAuto = FACHADA_Z + ACERA + 1.3;
  const autos: [number, number][] = [
    [-2, zAuto],
    [9, zAuto],
  ];
  const motos: [number, number][] = [];
  for (let x = 12.5; x <= 15.2; x += 0.9) motos.push([x, FACHADA_Z + ACERA + 0.8]);

  const bloqueado: Bloqueo[] = [
    // Muro entre los dos tramos de la escalera en U, en cada piso
    ...pisosU.map(([y0, y1]) => ({ x0: medioU - 0.06, x1: medioU + 0.06, z0: escaleraNuevo.z0 + huellaU, z1: descansoU, y0, y1 })),
    // Fuente, maceteros del patio y mesas de la cafetería
    obstaculo(fuente.x, fuente.z, fuente.radio, NIVEL_PATIO, NIVEL_PATIO + 0.6),
    ...arbolesPatio.map(([x, z]) => obstaculo(x, z, 0.6, NIVEL_PATIO, NIVEL_PATIO + 4)),
    ...mesas.map(([x, z]) => obstaculo(x, z, 0.8, NIVEL_BLOQUE, NIVEL_BLOQUE + 0.8)),
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
    nucleo,
    pasoRecepcion,
    entradaAntigua,
    hallAntiguo,
    pasilloConexion,
    conexionNuevo,
    ascensor,
    corredor,
    filaAulas,
    pasoOeste,
    escaleraPatio,
    descanso,
    patio,
    patioOeste,
    patioEste,
    pasilloFondo,
    bloqueCentral,
    cafeteria,
    hall,
    puertaCafeteria,
    puertaHall,
    escaleraEsparcimiento,
    esparcimiento,
    auditorio,
    cancha,
    fuente,
    arbolesPatio,
    mesas,
    entradaNuevo,
    hallNuevo,
    pasilloNuevo,
    escalonesNuevo,
    escaleraNuevo,
    hallAlto,
    hallesNuevo,
    pasilloAlto,
    arboles,
    autos,
    motos,
    puertas,
    superficies,
    bloqueado,
    // En la vereda, frente a la recepción, mirando a la fachada
    aparicion: { position: [(pasoRecepcion.x0 + pasoRecepcion.x1) / 2, 0, FACHADA_Z + 2], rotation: [0, Math.PI, 0] },
  };
}

/** Lugar de una puerta: centro sobre la pared, altura del piso, giro y hacia dónde queda el pasillo (dx, dz). */
type Lugar = { x: number; z: number; y: number; giro: number; hacia: [number, number] };

/**
 * Puertas de las aulas, en el orden en que se llenan: las del plano y, si hay
 * más aulas que esas, puertas genéricas en el muro del pasillo del fondo.
 * Las aulas que no entran ni ahí quedan sin puerta en el campus.
 */
function ubicarPuertas(
  aulas: AulaPlano[],
  r: { corredor: Rect; filaAulas: Rect; alaCalle: Rect; pasilloNuevo: Rect; pasilloFondo: Rect }
): PuertaAula[] {
  const lugares: Lugar[] = [
    // Las cinco aulas de la fila, con la puerta al corredor
    ...[18, 12.2, 6.6, 1, -4.4].map((x): Lugar => ({ x, z: r.filaAulas.z1, y: NIVEL_4, giro: 0, hacia: [0, 1] })),
    // Las dos aulas de la buhardilla del ala de la calle, frente a la fila
    ...X_PUERTAS_BUHARDILLA.map((x): Lugar => ({ x, z: r.alaCalle.z0, y: NIVEL_4, giro: Math.PI, hacia: [0, -1] })),
    // Aulas del nuevo sobre su pasillo (nivel 4)
    ...[-10, -13, -16.4, -21.1].map((z): Lugar => ({ x: r.pasilloNuevo.x0, z, y: NIVEL_4, giro: Math.PI / 2, hacia: [1, 0] })),
  ];
  // Genéricas: repartidas a lo largo del muro de contención, lo más separadas que se pueda
  const sobran = aulas.length - lugares.length;
  if (sobran > 0) {
    const x0 = r.pasilloFondo.x0 + 1;
    const largo = r.pasilloFondo.x1 - 1 - x0;
    const n = Math.min(sobran, Math.floor(largo / SEPARACION_GENERICA));
    const paso = Math.min(3, largo / n);
    for (let i = 0; i < n; i++) {
      lugares.push({ x: x0 + paso * (i + 0.5), z: r.pasilloFondo.z0, y: NIVEL_PATIO, giro: 0, hacia: [0, 1] });
    }
  }
  return aulas.slice(0, lugares.length).map((aula, i) => {
    const l = lugares[i];
    return { id: String(aula.id), x: l.x, z: l.z, y: l.y, giro: l.giro, frente: [l.x + l.hacia[0] * FRENTE_PUERTA, l.z + l.hacia[1] * FRENTE_PUERTA] };
  });
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
 * borde del área de esparcimiento, el costado de una escalera) o un obstáculo
 * lo estorba. Si hay dos pisos a mano (el pie de una escalera), el más cercano.
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

/** ¿Puede pararse el avatar en (x, z) viniendo de la altura y (por defecto, el piso 0)? */
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

/** Puerta más cercana a (x, z) a menos de `maxima`, de las que están en el piso donde se para el avatar (y), o null. */
export function puertaCercana(plano: PlanoCampus, x: number, z: number, maxima = 3.5, y = 0): PuertaAula | null {
  let mejor: PuertaAula | null = null;
  let distancia = maxima;
  for (const p of plano.puertas) {
    if (Math.abs(y - p.y) > ESCALON) continue;
    const d = Math.hypot(x - p.frente[0], z - p.frente[1]);
    if (d < distancia) {
      distancia = d;
      mejor = p;
    }
  }
  return mejor;
}

/** Parada del ascensor frente a la que está el avatar (a menos de `maxima`, en su piso), o null. */
export function paradaCercana(plano: PlanoCampus, x: number, z: number, y: number, maxima = 1.6): ParadaAscensor | null {
  return plano.ascensor.find((p) => Math.abs(y - p.y) <= ESCALON && Math.hypot(x - p.frente[0], z - p.frente[1]) < maxima) ?? null;
}

/** Adónde lleva el ascensor desde una parada: a la siguiente (con dos, a la otra). */
export function siguienteParada(plano: PlanoCampus, desde: ParadaAscensor): ParadaAscensor {
  const i = plano.ascensor.indexOf(desde);
  return plano.ascensor[(i + 1) % plano.ascensor.length];
}
