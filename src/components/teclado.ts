// Atajos de teclado globales (A11Y-03). Escuchan en window, así que hay que
// distinguir cuándo la tecla es para ellos y cuándo para lo que tiene el foco.

/** El foco está en un campo de texto: las letras son para escribir. */
export function estaEscribiendo(e: KeyboardEvent): boolean {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
}

/**
 * Caminar (WASD, flechas) e interactuar (E) sólo si el foco no está
 * escribiendo ni dentro de un modal o panel: ahí las flechas y las letras son
 * para navegar ese diálogo, no para mover el avatar que está detrás.
 */
export function esTeclaDelMundo3D(e: KeyboardEvent): boolean {
  if (estaEscribiendo(e)) return false;
  const t = e.target;
  return !(t instanceof HTMLElement && t.closest('[role="dialog"]'));
}
