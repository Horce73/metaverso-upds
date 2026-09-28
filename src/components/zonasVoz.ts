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
  yaConectado: boolean
): boolean {
  if (tipo === 'aula' && (yo.difusor || otro.difusor)) return true;
  if (!yo.posicion || !otro.posicion) return yaConectado;
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
  tipo: TipoEspacio
): { llamar: string[]; colgar: string[] } {
  const llamar: string[] = [];
  const colgar: string[] = [];
  for (const [peerId, otro] of otros) {
    if (peerId === miPeerId) continue;
    if (!otro.posicion && !(tipo === 'aula' && (yo.difusor || otro.difusor))) continue;
    const conectado = conectados.has(peerId);
    const debe = debeEstarConectado(yo, otro, tipo, conectado);
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
