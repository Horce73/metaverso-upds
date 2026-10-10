import type { KeyboardControlsState } from './useKeyboardControls.js';

// Objeto mutable compartido en vez de un hook: el joystick virtual vive como
// overlay HTML fuera del <Canvas> (en MetaversoCanvas.tsx), y AvatarModel que
// lo lee corre dentro del Canvas. No hay contexto ni prop que cruce esa
// frontera hoy, asi que ambos importan este mismo modulo y listo — igual de
// simple que la ref de useKeyboardControls, solo que compartida entre dos
// arboles de React distintos.
export const estadoJoystick: KeyboardControlsState = {
  adelante: false,
  atras: false,
  izquierda: false,
  derecha: false,
};

export function limpiarJoystick() {
  estadoJoystick.adelante = false;
  estadoJoystick.atras = false;
  estadoJoystick.izquierda = false;
  estadoJoystick.derecha = false;
}
