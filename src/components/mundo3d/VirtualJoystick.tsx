import React, { useRef } from 'react';
import { estadoJoystick, limpiarJoystick } from './touchControls.js';

const RADIO_BASE = 56;
const RADIO_NUDO = 24;
// Por debajo de esta fraccion del radio, el arrastre no cuenta como
// intencion de moverse (evita micro-temblor del dedo al apoyar el pulgar).
const ZONA_MUERTA = 0.22;

/**
 * Joystick virtual de 8 direcciones (no analogico): escribe los mismos 4
 * booleanos que el teclado en estadoJoystick, asi que AvatarModel no
 * distingue si el movimiento vino del teclado o del dedo.
 */
export function VirtualJoystick() {
  const baseRef = useRef<HTMLDivElement>(null);
  const nudoRef = useRef<HTMLDivElement>(null);
  const activoRef = useRef<number | null>(null); // pointerId en curso, o null

  const actualizarNudo = (dx: number, dy: number) => {
    const nudo = nudoRef.current;
    if (nudo) nudo.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const procesarArrastre = (clientX: number, clientY: number) => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > RADIO_BASE) {
      dx = (dx / dist) * RADIO_BASE;
      dy = (dy / dist) * RADIO_BASE;
    }
    actualizarNudo(dx, dy);

    const umbral = RADIO_BASE * ZONA_MUERTA;
    estadoJoystick.derecha = dx > umbral;
    estadoJoystick.izquierda = dx < -umbral;
    estadoJoystick.atras = dy > umbral;
    estadoJoystick.adelante = dy < -umbral;
  };

  const soltar = (e: React.PointerEvent) => {
    if (activoRef.current !== e.pointerId) return;
    activoRef.current = null;
    limpiarJoystick();
    actualizarNudo(0, 0);
    try { baseRef.current?.releasePointerCapture(e.pointerId); } catch { /* ya liberado */ }
  };

  return (
    <div
      ref={baseRef}
      aria-label="Joystick de movimiento"
      role="presentation"
      onPointerDown={(e) => {
        e.preventDefault();
        activoRef.current = e.pointerId;
        baseRef.current?.setPointerCapture(e.pointerId);
        procesarArrastre(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (activoRef.current !== e.pointerId) return;
        procesarArrastre(e.clientX, e.clientY);
      }}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      style={{
        position: 'fixed',
        left: '20px',
        bottom: '20px',
        width: `${RADIO_BASE * 2}px`,
        height: `${RADIO_BASE * 2}px`,
        borderRadius: '50%',
        background: 'rgba(15, 23, 42, 0.78)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(56, 189, 248, 0.4)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        touchAction: 'none',
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        ref={nudoRef}
        style={{
          width: `${RADIO_NUDO * 2}px`,
          height: `${RADIO_NUDO * 2}px`,
          borderRadius: '50%',
          background: 'rgba(56, 189, 248, 0.55)',
          border: '1px solid rgba(224, 242, 254, 0.6)',
          transition: 'transform 60ms linear',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
