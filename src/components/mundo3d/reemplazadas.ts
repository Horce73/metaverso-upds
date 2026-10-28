import type * as THREE from 'three';

// Piezas originales que Fusionar reemplazó por una malla fusionada (y dejó
// ocultas). Fuera de userData a propósito: React Three Fiber reemplaza ese
// objeto entero cada vez que el componente vuelve a dibujarse, y una marca
// guardada ahí se perdería.
export const reemplazadas = new WeakSet<THREE.Object3D>();

/** ¿Esta pieza fue reemplazada por una malla fusionada? Entonces debe seguir oculta. */
export function fueFusionada(o: THREE.Object3D): boolean {
  return reemplazadas.has(o);
}
