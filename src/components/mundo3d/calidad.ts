// Calidad gráfica adaptativa (3D-05). Tres niveles fijos; la escena arranca en
// uno según el equipo y baja o sube según los cuadros por segundo medidos
// (PerformanceMonitor en MetaversoCanvas). Lógica pura, sin three.js, para
// probarla con node --test.

export type NivelCalidad = 'alta' | 'media' | 'baja';

export interface AjustesCalidad {
  /** Densidad de píxeles máxima del canvas (se acota además por la del equipo). */
  dpr: number;
  sombras: boolean;
  tamanoSombra: number;
  estrellas: number;
  /** Más allá de esta distancia a la cámara, un avatar se dibuja simplificado y sin sombra. */
  distanciaDetalle: number;
}

export const AJUSTES_CALIDAD: Record<NivelCalidad, AjustesCalidad> = {
  alta: { dpr: 1.5, sombras: true, tamanoSombra: 1024, estrellas: 1200, distanciaDetalle: 16 },
  media: { dpr: 1, sombras: true, tamanoSombra: 512, estrellas: 600, distanciaDetalle: 11 },
  baja: { dpr: 0.75, sombras: false, tamanoSombra: 512, estrellas: 0, distanciaDetalle: 7 },
};

const ORDEN: NivelCalidad[] = ['baja', 'media', 'alta'];

export function bajarNivel(nivel: NivelCalidad): NivelCalidad {
  return ORDEN[Math.max(0, ORDEN.indexOf(nivel) - 1)];
}

export function subirNivel(nivel: NivelCalidad): NivelCalidad {
  return ORDEN[Math.min(ORDEN.length - 1, ORDEN.indexOf(nivel) + 1)];
}

export interface PerfilEquipo {
  esTactil: boolean;
  /** navigator.deviceMemory en GB (sólo Chromium; undefined en el resto). */
  memoriaGb?: number;
  /** navigator.hardwareConcurrency */
  nucleos?: number;
}

/**
 * Nivel de arranque. Es sólo el punto de partida: el monitor de rendimiento
 * corrige en segundos si el equipo da más o menos de lo supuesto. Un celular
 * arranca en media porque su pantalla tiene muchos más píxeles por punto y
 * la GPU suele ser la de un equipo modesto.
 */
export function nivelInicial({ esTactil, memoriaGb, nucleos }: PerfilEquipo): NivelCalidad {
  const equipoChico = (memoriaGb !== undefined && memoriaGb <= 2) || (nucleos !== undefined && nucleos <= 2);
  if (equipoChico) return 'baja';
  if (esTactil) return 'media';
  return 'alta';
}
