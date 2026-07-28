import React, { useState } from 'react';
import type { PersonalizacionAvatar } from './AvatarModel.js';

const COLORES_ROPA = [
  '#3498db', '#e67e22', '#e74c3c', '#2ecc71',
  '#9b59b6', '#f1c40f', '#1abc9c', '#34495e',
];

const TONOS_PIEL = ['#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a21'];

const COLORES_CABELLO = ['#1e1b18', '#2c1d11', '#5a3d28', '#b87333', '#eab308', '#94a3b8', '#3b82f6'];

const ESTILOS_CABELLO: { id: NonNullable<PersonalizacionAvatar['estiloCabello']>; etiqueta: string }[] = [
  { id: 'corto', etiqueta: 'Corto' },
  { id: 'tupe', etiqueta: 'Tupé' },
  { id: 'largo', etiqueta: 'Largo' },
  { id: 'rizado', etiqueta: 'Rizado' },
  { id: 'bun', etiqueta: 'Moño' },
  { id: 'calvo', etiqueta: 'Calvo' },
];

const EXPRESIONES_ROSTRO: { id: NonNullable<PersonalizacionAvatar['expresionRostro']>; etiqueta: string; emoji: string }[] = [
  { id: 'alegre', etiqueta: 'Alegre', emoji: '😊' },
  { id: 'guiño', etiqueta: 'Guiño', emoji: '😉' },
  { id: 'serio', etiqueta: 'Serio', emoji: '😐' },
  { id: 'sorprendido', etiqueta: 'Sorprendido', emoji: '😮' },
];

interface CustomizadorAvatarProps {
  personalizacion: PersonalizacionAvatar;
  onCambiar: (nueva: PersonalizacionAvatar) => void;
  abierto: boolean;
  onToggle: () => void;
}

export const CustomizadorAvatar: React.FC<CustomizadorAvatarProps> = ({
  personalizacion,
  onCambiar,
  abierto,
  onToggle,
}) => {
  const [pestaña, setPestaña] = useState<'cabello' | 'rostro' | 'ropa' | 'piel' | 'accesorios'>('cabello');

  const actualizar = (cambios: Partial<PersonalizacionAvatar>) =>
    onCambiar({ ...personalizacion, ...cambios });

  const actualizarAccesorio = (clave: 'sombrero' | 'gafas' | 'mochila', valor: boolean) =>
    onCambiar({
      ...personalizacion,
      accesorios: { ...personalizacion.accesorios, [clave]: valor },
    });

  return (
    <div style={estilos.contenedor}>
      <button style={estilos.botonToggle} onClick={onToggle}>
        {abierto ? 'Cerrar personalización ✕' : '✨ Personalizar avatar'}
      </button>

      {abierto && (
        <div style={estilos.panel}>
          <div style={estilos.tabs}>
            {(['cabello', 'rostro', 'ropa', 'piel', 'accesorios'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setPestaña(t)}
                style={{
                  ...estilos.tab,
                  ...(pestaña === t ? estilos.tabActiva : {}),
                }}
              >
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Pestaña Cabello */}
          {pestaña === 'cabello' && (
            <div style={estilos.seccion}>
              <span style={estilos.subtitulo}>Estilo de Cabello:</span>
              <div style={estilos.gridBotones}>
                {ESTILOS_CABELLO.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => actualizar({ estiloCabello: item.id })}
                    style={{
                      ...estilos.btnOpcion,
                      ...(personalizacion.estiloCabello === item.id ? estilos.btnOpcionActivo : {}),
                    }}
                  >
                    {item.etiqueta}
                  </button>
                ))}
              </div>

              <span style={{ ...estilos.subtitulo, marginTop: '8px' }}>Color de Cabello:</span>
              <div style={estilos.swatches}>
                {COLORES_CABELLO.map((c) => (
                  <button
                    key={c}
                    onClick={() => actualizar({ colorCabello: c })}
                    style={{
                      ...estilos.swatch,
                      background: c,
                      outline: personalizacion.colorCabello === c ? '3px solid #60a5fa' : '2px solid rgba(255,255,255,0.2)',
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Pestaña Rostro */}
          {pestaña === 'rostro' && (
            <div style={estilos.seccion}>
              <span style={estilos.subtitulo}>Expresión Facial:</span>
              <div style={estilos.gridBotones}>
                {EXPRESIONES_ROSTRO.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => actualizar({ expresionRostro: item.id })}
                    style={{
                      ...estilos.btnOpcion,
                      ...(personalizacion.expresionRostro === item.id ? estilos.btnOpcionActivo : {}),
                    }}
                  >
                    {item.emoji} {item.etiqueta}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Pestaña Ropa */}
          {pestaña === 'ropa' && (
            <div style={estilos.seccion}>
              <div style={estilos.swatches}>
                {COLORES_ROPA.map((c) => (
                  <button
                    key={c}
                    onClick={() => actualizar({ colorRopa: c })}
                    style={{
                      ...estilos.swatch,
                      background: c,
                      outline: personalizacion.colorRopa === c ? '3px solid #fff' : '2px solid rgba(255,255,255,0.2)',
                    }}
                  />
                ))}
              </div>
              <label style={estilos.etiquetaInput}>
                Color personalizado:
                <input
                  type="color"
                  value={personalizacion.colorRopa || '#3498db'}
                  onChange={(e) => actualizar({ colorRopa: e.target.value })}
                  style={estilos.inputColor}
                />
              </label>
            </div>
          )}

          {/* Pestaña Piel */}
          {pestaña === 'piel' && (
            <div style={estilos.seccion}>
              <div style={estilos.swatches}>
                {TONOS_PIEL.map((c) => (
                  <button
                    key={c}
                    onClick={() => actualizar({ colorPiel: c })}
                    style={{
                      ...estilos.swatch,
                      background: c,
                      outline: personalizacion.colorPiel === c ? '3px solid #fff' : '2px solid rgba(255,255,255,0.2)',
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Pestaña Accesorios */}
          {pestaña === 'accesorios' && (
            <div style={estilos.seccion}>
              {[
                { clave: 'sombrero' as const, etiqueta: 'Sombrero Vaquero' },
                { clave: 'gafas' as const, etiqueta: 'Gafas de Sol' },
                { clave: 'mochila' as const, etiqueta: 'Mochila' },
              ].map(({ clave, etiqueta }) => (
                <label key={clave} style={estilos.checkboxFila}>
                  <input
                    type="checkbox"
                    checked={!!personalizacion.accesorios?.[clave]}
                    onChange={(e) => actualizarAccesorio(clave, e.target.checked)}
                  />
                  {etiqueta}
                </label>
              ))}
            </div>
          )}
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
  panel: {
    background: 'rgba(15, 23, 42, 0.95)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff',
    padding: '16px',
    borderRadius: '16px',
    width: '280px',
    boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
  },
  tabs: { display: 'flex', gap: '4px', marginBottom: '14px', flexWrap: 'wrap' },
  tab: {
    flex: '1 1 30%',
    background: 'rgba(255,255,255,0.06)',
    color: '#94a3b8',
    border: 'none',
    padding: '6px 4px',
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  tabActiva: { background: '#2563eb', color: '#fff', fontWeight: 600 },
  seccion: { display: 'flex', flexDirection: 'column', gap: '10px' },
  subtitulo: { fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 },
  gridBotones: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' },
  btnOpcion: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    color: '#e2e8f0',
    padding: '8px',
    fontSize: '0.8rem',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  btnOpcionActivo: {
    background: 'rgba(59, 130, 246, 0.3)',
    borderColor: '#3b82f6',
    color: '#60a5fa',
    fontWeight: 600,
  },
  swatches: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  swatch: {
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
  },
  etiquetaInput: { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', color: '#cbd5e1' },
  inputColor: { width: '100%', height: '32px', border: 'none', borderRadius: '6px', cursor: 'pointer' },
  checkboxFila: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#e2e8f0', cursor: 'pointer' },
};

export default CustomizadorAvatar;
