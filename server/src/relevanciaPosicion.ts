// A quien reenviar un 'user_moved' (3D-04). En el campus la vereda, el patio
// y la cancha quedan separados por los edificios (ver
// src/components/mundo3d/planoCampus.ts): nadie necesita la posicion de
// alguien que ni siquiera puede ver desde donde esta parado. En
// el aula no se filtra: es un solo salon compacto donde casi todos los pares
// ya estan cerca, y filtrar ahi solo suma codigo sin ahorrar trafico real.

export type EspacioTipo = 'campus' | 'aula';
export type Vector3 = [number, number, number];

// Del centro de la vereda al centro del patio hay unos 18: el filtro separa
// las areas que tapan los edificios; bastante mayor que el radio de voz (8-11 en
// zonasVoz.ts), porque ver a alguien a lo lejos sigue siendo relevante
// aunque no se lo oiga todavia.
export const RADIO_RELEVANCIA_CAMPUS = 18;

function distanciaXZ(a: Vector3, b: Vector3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

/**
 * Si quien esta en `posReceptor` deberia recibir el movimiento de quien esta
 * en `posEmisor`. Sin posicion conocida del receptor (recien unido, antes de
 * su primer 'move') se envia igual: no hay forma de saber si esta lejos.
 */
export function debeRecibirMovimiento(
  espacioTipo: EspacioTipo,
  posEmisor: Vector3,
  posReceptor: Vector3 | null
): boolean {
  if (espacioTipo !== 'campus') return true;
  if (!posReceptor) return true;
  return distanciaXZ(posEmisor, posReceptor) <= RADIO_RELEVANCIA_CAMPUS;
}
