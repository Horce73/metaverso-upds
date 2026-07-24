import { useEffect, useRef } from 'react';

export interface KeyboardControlsState {
  adelante: boolean;
  atras: boolean;
  izquierda: boolean;
  derecha: boolean;
}

const MAPA_TECLAS: Record<string, keyof KeyboardControlsState> = {
  KeyW: 'adelante',
  ArrowUp: 'adelante',
  KeyS: 'atras',
  ArrowDown: 'atras',
  KeyA: 'izquierda',
  ArrowLeft: 'izquierda',
  KeyD: 'derecha',
  ArrowRight: 'derecha',
};

const CODIGOS_MOVIMIENTO = new Set(Object.keys(MAPA_TECLAS));

function estaEscribiendoEnUnInput(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  const tag = target?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Devuelve una ref mutable { adelante, atras, izquierda, derecha }
 * que se actualiza en vivo con el estado del teclado.
 */
export function useKeyboardControls() {
  const estado = useRef<KeyboardControlsState>({
    adelante: false,
    atras: false,
    izquierda: false,
    derecha: false,
  });

  useEffect(() => {
    const limpiarTodo = () => {
      estado.current.adelante = false;
      estado.current.atras = false;
      estado.current.izquierda = false;
      estado.current.derecha = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (estaEscribiendoEnUnInput(e)) return;

      const accion = MAPA_TECLAS[e.code];
      if (!accion) return;

      if (CODIGOS_MOVIMIENTO.has(e.code)) e.preventDefault();

      estado.current[accion] = true;
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const accion = MAPA_TECLAS[e.code];
      if (accion) estado.current[accion] = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', limpiarTodo);
    document.addEventListener('visibilitychange', limpiarTodo);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', limpiarTodo);
      document.removeEventListener('visibilitychange', limpiarTodo);
    };
  }, []);

  return estado;
}
