import { useEffect, useRef, type RefObject } from 'react';

// Navegación por teclado en modales y paneles (A11Y-03). Al abrir, el foco
// entra al diálogo; Tab y Mayús+Tab quedan dentro mientras esté abierto;
// Escape lo cierra; al cerrarse el foco vuelve a donde estaba (el botón que
// lo abrió), en vez de perderse al principio de la página.

const ENFOCABLES = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function enfocablesDe(contenedor: HTMLElement): HTMLElement[] {
  return Array.from(contenedor.querySelectorAll<HTMLElement>(ENFOCABLES)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

interface OpcionesDialogo {
  /** Atrapar Tab dentro (modales). Un panel lateral no modal lo deja en false. */
  atraparFoco?: boolean;
}

export function useDialogo(ref: RefObject<HTMLElement | null>, onClose: () => void, { atraparFoco = true }: OpcionesDialogo = {}) {
  const cerrarRef = useRef(onClose);
  cerrarRef.current = onClose;

  useEffect(() => {
    const contenedor = ref.current;
    if (!contenedor) return;
    const previo = document.activeElement as HTMLElement | null;

    // El primer campo si hay uno (lo que se viene a llenar); si no, el primer botón
    const inicial =
      contenedor.querySelector<HTMLElement>('[data-foco-inicial]') ??
      contenedor.querySelector<HTMLElement>('input:not([type="hidden"]):not([disabled]), textarea, select') ??
      enfocablesDe(contenedor)[0];
    if (inicial) inicial.focus();
    else {
      contenedor.tabIndex = -1;
      contenedor.focus();
    }

    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        cerrarRef.current();
        return;
      }
      if (e.key !== 'Tab' || !atraparFoco) return;
      const enfocables = enfocablesDe(contenedor);
      if (enfocables.length === 0) {
        e.preventDefault();
        return;
      }
      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      const activo = document.activeElement;
      if (e.shiftKey && (activo === primero || !contenedor.contains(activo))) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && (activo === ultimo || !contenedor.contains(activo))) {
        e.preventDefault();
        primero.focus();
      }
    };

    contenedor.addEventListener('keydown', alPulsar);
    return () => {
      contenedor.removeEventListener('keydown', alPulsar);
      if (previo && document.contains(previo)) previo.focus();
    };
  }, [ref, atraparFoco]);
}
