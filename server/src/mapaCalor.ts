// Mapas de calor de uso (DATA-04): celdas del piso y acumulador, sin base de
// datos para poder probarlos. El muestreo y la ruta están en mapaCalorServidor.ts.

export const TAMANO_CELDA = 2;
export const MUESTREO_S = 10;

export function celdaDe(x: number, z: number, tamano = TAMANO_CELDA): [number, number] {
  return [Math.floor(x / tamano), Math.floor(z / tamano)];
}

/** Segundos por espacio y celda, en memoria hasta el próximo volcado. */
export class Acumulador {
  private segundos = new Map<string, number>();

  sumar(espacioId: number, x: number, z: number, segundos: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const [cx, cz] = celdaDe(x, z);
    // Fuera de cualquier escena real: no vale la pena guardarlo (y cabe en SMALLINT)
    if (Math.abs(cx) > 500 || Math.abs(cz) > 500) return;
    const clave = `${espacioId}|${cx}|${cz}`;
    this.segundos.set(clave, (this.segundos.get(clave) ?? 0) + segundos);
  }

  /** Devuelve lo acumulado y empieza de cero. */
  vaciar(): { espacioId: number; cx: number; cz: number; segundos: number }[] {
    const filas = [...this.segundos].map(([clave, segundos]) => {
      const [espacioId, cx, cz] = clave.split('|').map(Number);
      return { espacioId, cx, cz, segundos };
    });
    this.segundos.clear();
    return filas;
  }
}
