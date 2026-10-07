// Zonas de audio (VOZ-03). Deciden con quién abre llamada cada participante y
// cómo se oye cada voz. Es lo que permite que la malla llegue al aula de 30
// (decisión 0001): el costo de CPU crece con cada voz que se recibe, así que
// un alumno sólo llama a quien dicta la clase y a quienes tiene cerca.
//
// - Aula: docentes y administradores difunden. Se conectan con todos y se los
//   oye igual desde cualquier punto; el resto se oye sólo de cerca.
// - Campus: todo es proximidad, nadie difunde.

export type TipoEspacio = 'campus' | 'aula';
export type Vector3 = [number, number, number];

export interface ParticipanteVoz {
  /** null mientras no se conoce: no se decide nada sobre ese participante. */
  posicion: Vector3 | null;
  difusor: boolean;
}

// En unidades de la escena (≈ metros). La voz se apaga en `audible`; la
// llamada se abre un poco antes, en `conectar`, para que ya esté negociada
// cuando la voz empiece a oírse, y no se cuelga hasta `desconectar`, para que
// quien camina en el borde no abra y cierre llamadas sin parar.
export const RADIOS: Record<TipoEspacio, { audible: number; conectar: number; desconectar: number }> = {
  aula: { audible: 5, conectar: 6, desconectar: 8 },
  campus: { audible: 8, conectar: 9, desconectar: 11 },
};

/** Distancia hasta la que una voz de proximidad suena a volumen completo. */
export const DISTANCIA_REFERENCIA = 1.5;

// Mesas de trabajo del aula (AULA-07). Con el modo grupos activo, la voz de
// quien está en una mesa sólo llega a su mesa. Cada mesa abarca dos pupitres
// de una fila (los pupitres están en x = ±3, ±8.5 y z = -5, 0, 5).
export interface Mesa {
  id: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export const MESAS_AULA: Mesa[] = [-5, 0, 5].flatMap((z, fila) =>
  [
    [-11.25, -0.75],
    [0.75, 11.25],
  ].map(([x0, x1], lado) => ({ id: fila * 2 + lado + 1, x0, x1, z0: z - 2.4, z1: z + 2.4 }))
);

/** Margen para seguir "en la mesa" una llamada ya abierta: evita cortes en el borde. */
export const MARGEN_MESA = 0.75;

export interface OpcionesZonas {
  /** Modo de trabajo en grupos del aula, activado por el docente. */
  grupos?: boolean;
}

/** Mesa en la que está una posición (la más cercana si el margen alcanza a dos), o null. */
export function mesaDe(pos: Vector3 | null, margen = 0): number | null {
  if (!pos) return null;
  let mejor: number | null = null;
  let distanciaMejor = Infinity;
  for (const m of MESAS_AULA) {
    if (pos[0] < m.x0 - margen || pos[0] > m.x1 + margen || pos[2] < m.z0 - margen || pos[2] > m.z1 + margen) continue;
    const d = Math.hypot(pos[0] - (m.x0 + m.x1) / 2, pos[2] - (m.z0 + m.z1) / 2);
    if (d < distanciaMejor) {
      distanciaMejor = d;
      mejor = m.id;
    }
  }
  return mejor;
}

/**
 * Si difunde ahora mismo. En modo grupos, quien difunde sólo lo hace fuera de
 * las mesas: el docente que se acerca a una mesa pasa a ser parte del grupo.
 */
export function difundeAhora(p: ParticipanteVoz, tipo: TipoEspacio, opciones: OpcionesZonas = {}): boolean {
  if (tipo !== 'aula' || !p.difusor) return false;
  return !(opciones.grupos && mesaDe(p.posicion) !== null);
}

export function esDifusor(roles: readonly string[], tipo: TipoEspacio): boolean {
  return tipo === 'aula' && (roles.includes('docente') || roles.includes('administrador'));
}

// Horizontal: sentarse o levantarse no cambia de zona.
function distancia(a: Vector3, b: Vector3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

export function debeEstarConectado(
  yo: ParticipanteVoz,
  otro: ParticipanteVoz,
  tipo: TipoEspacio,
  yaConectado: boolean,
  opciones: OpcionesZonas = {}
): boolean {
  if (difundeAhora(yo, tipo, opciones) || difundeAhora(otro, tipo, opciones)) return true;
  if (!yo.posicion || !otro.posicion) return yaConectado;
  if (tipo === 'aula' && opciones.grupos) {
    // Si alguno está en una mesa, sólo se oyen si es la misma
    const margen = yaConectado ? MARGEN_MESA : 0;
    const mesaYo = mesaDe(yo.posicion, margen);
    const mesaOtro = mesaDe(otro.posicion, margen);
    if (mesaYo !== null || mesaOtro !== null) return mesaYo !== null && mesaYo === mesaOtro;
  }
  const { conectar, desconectar } = RADIOS[tipo];
  return distancia(yo.posicion, otro.posicion) < (yaConectado ? desconectar : conectar);
}

/**
 * Qué llamadas abrir y cuáles colgar. Sólo abre el de peerId menor: los dos
 * lados evalúan lo mismo y así nunca se cruzan dos llamadas entre el mismo
 * par. Colgar sí puede cualquiera; PeerJS avisa al otro extremo.
 */
export function planificarConexiones(
  miPeerId: string,
  yo: ParticipanteVoz,
  otros: ReadonlyMap<string, ParticipanteVoz>,
  conectados: ReadonlySet<string>,
  tipo: TipoEspacio,
  opciones: OpcionesZonas = {}
): { llamar: string[]; colgar: string[] } {
  const llamar: string[] = [];
  const colgar: string[] = [];
  for (const [peerId, otro] of otros) {
    if (peerId === miPeerId) continue;
    if (!otro.posicion && !difundeAhora(yo, tipo, opciones) && !difundeAhora(otro, tipo, opciones)) continue;
    const conectado = conectados.has(peerId);
    const debe = debeEstarConectado(yo, otro, tipo, conectado, opciones);
    if (debe && !conectado && miPeerId < peerId) llamar.push(peerId);
    if (!debe && conectado) colgar.push(peerId);
  }
  return { llamar, colgar };
}

/**
 * - constante: el otro difunde; se lo oye igual en toda el aula.
 * - sala: yo difundo; oigo a toda la clase, más bajo cuanto más lejos.
 * - proximidad: dos participantes comunes; sólo se oyen de cerca.
 */
export type PerfilAudicion = 'constante' | 'sala' | 'proximidad';

export function perfilAudicion(yoDifundo: boolean, otroDifunde: boolean): PerfilAudicion {
  if (otroDifunde) return 'constante';
  if (yoDifundo) return 'sala';
  return 'proximidad';
}

/** Cómo oigo a otro, según quién difunde y, en modo grupos, si compartimos mesa. */
export function perfilEntre(
  yo: ParticipanteVoz,
  otro: ParticipanteVoz,
  tipo: TipoEspacio,
  opciones: OpcionesZonas = {}
): PerfilAudicion {
  if (tipo === 'aula' && opciones.grupos) {
    const mesa = mesaDe(yo.posicion);
    // La mesa se oye pareja, como alrededor de una mesa real
    if (mesa !== null && mesa === mesaDe(otro.posicion)) return 'constante';
  }
  return perfilAudicion(difundeAhora(yo, tipo, opciones), difundeAhora(otro, tipo, opciones));
}

// Parámetros de PannerNode para cada perfil. El respaldo sin Web Audio
// (iOS/Safari) aplica las mismas curvas con gananciaPorDistancia.
export function parametrosPanner(
  perfil: PerfilAudicion,
  tipo: TipoEspacio
): Pick<PannerNode, 'distanceModel' | 'refDistance' | 'maxDistance' | 'rolloffFactor'> {
  switch (perfil) {
    case 'constante':
      return { distanceModel: 'inverse', refDistance: 1, maxDistance: 10000, rolloffFactor: 0 };
    case 'sala':
      return { distanceModel: 'inverse', refDistance: 6, maxDistance: 10000, rolloffFactor: 0.3 };
    case 'proximidad':
      return {
        distanceModel: 'linear',
        refDistance: DISTANCIA_REFERENCIA,
        maxDistance: RADIOS[tipo].audible,
        rolloffFactor: 1,
      };
  }
}

export function gananciaPorDistancia(d: number, perfil: PerfilAudicion, tipo: TipoEspacio): number {
  const { distanceModel, refDistance, maxDistance, rolloffFactor } = parametrosPanner(perfil, tipo);
  if (distanceModel === 'linear') {
    const dd = Math.min(Math.max(d, refDistance), maxDistance);
    return 1 - (rolloffFactor * (dd - refDistance)) / (maxDistance - refDistance);
  }
  return refDistance / (refDistance + rolloffFactor * (Math.max(d, refDistance) - refDistance));
}
