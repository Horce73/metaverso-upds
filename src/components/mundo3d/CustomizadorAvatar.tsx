import React from 'react';
import { normalizarApariencia, type PersonalizacionAvatar } from './personalizacion.js';
import { EditorApariencia } from './EditorApariencia.js';
import { useEsTactil } from './useEsTactil.js';

// Panel ✨ de personalización dentro del mundo: los cambios se ven al instante
// en el avatar propio y en el de los demás. Las opciones son las del editor
// compartido (EditorApariencia), las mismas del registro y del menú.

interface CustomizadorAvatarProps {
  personalizacion: PersonalizacionAvatar;
  onCambiar: (nueva: PersonalizacionAvatar) => void;
  abierto: boolean;
  onToggle: () => void;
}

export const CustomizadorAvatar: React.FC<CustomizadorAvatarProps> = ({ personalizacion, onCambiar, abierto, onToggle }) => {
  // En táctil la esquina de abajo es del joystick y del botón de interactuar
  // (bottom 84px): el botón queda compacto y encima de ellos.
  const esTactil = useEsTactil();
  const apariencia = React.useMemo(() => normalizarApariencia(personalizacion), [personalizacion]);

  return (
    <div style={esTactil ? { ...estilos.contenedor, bottom: '160px' } : estilos.contenedor}>
      <button
        style={esTactil && !abierto ? estilos.botonCompacto : estilos.botonToggle}
        onClick={onToggle}
        aria-label={abierto ? 'Cerrar personalización' : 'Personalizar avatar'}
        aria-expanded={abierto}
      >
        {abierto ? 'Cerrar personalización ✕' : esTactil ? '✨' : '✨ Personalizar avatar'}
      </button>

      {abierto && (
        <div
          style={
            esTactil
              ? // Entre la barra de controles de arriba y el botón: el resto se desplaza
                { ...estilos.panel, maxHeight: 'calc(100dvh - var(--fondo-barra-superior, 150px) - 300px)' }
              : estilos.panel
          }
        >
          <EditorApariencia apariencia={apariencia} onCambiar={onCambiar} />
        </div>
      )}
    </div>
  );
};

const estilos: Record<string, React.CSSProperties> = {
  contenedor: {
    position: 'absolute',
    bottom: '20px',
    right: '20px',
    pointerEvents: 'auto',
    fontFamily: 'Inter, system-ui, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '8px',
    zIndex: 60,
  },
  botonToggle: {
    background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.2)',
    padding: '10px 18px',
    borderRadius: '12px',
    fontWeight: 600,
    fontSize: '0.9rem',
    cursor: 'pointer',
    boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
    transition: 'all 0.2s ease',
  },
  botonCompacto: {
    width: '52px',
    height: '52px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.2)',
    fontSize: '1.4rem',
    cursor: 'pointer',
    boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
  },
  panel: {
    background: 'rgba(15, 23, 42, 0.95)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff',
    padding: '14px',
    borderRadius: '16px',
    width: 'min(330px, calc(100vw - 32px))',
    // Más alto que la pantalla no: el contenido se desplaza dentro
    maxHeight: 'min(520px, calc(100dvh - 140px))',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
  },
};

export default CustomizadorAvatar;
