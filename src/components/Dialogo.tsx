import React, { useRef } from 'react';
import { useDialogo } from './useDialogo.js';

interface DialogoProps {
  onClose: () => void;
  etiqueta: string;
  /** Modal: atrapa el foco. Un menú o panel que convive con el resto, no. */
  modal?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

/** Contenedor con la navegación por teclado de useDialogo (A11Y-03). */
export const Dialogo: React.FC<DialogoProps> = ({ onClose, etiqueta, modal = true, className, style, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  useDialogo(ref, onClose, { atraparFoco: modal });
  return (
    <div ref={ref} className={className} style={style} role="dialog" aria-modal={modal || undefined} aria-label={etiqueta}>
      {children}
    </div>
  );
};
