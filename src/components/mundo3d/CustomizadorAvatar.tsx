import React, { useState } from 'react';
import type { PersonalizacionAvatar } from './AvatarModel.js';

const COLORES_ROPA = [
  '#3498db', '#e67e22', '#e74c3c', '#2ecc71',
  '#9b59b6', '#f1c40f', '#1abc9c', '#34495e',
  '#0033A0', '#10b981', '#ec4899', '#6366f1',
];

const TONOS_PIEL = ['#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a21'];
const COLORES_CABELLO = ['#1e1b18', '#2c1d11', '#5a3d28', '#b87333', '#eab308', '#94a3b8', '#3b82f6'];

const ESTILOS_CABELLO: { id: NonNullable<PersonalizacionAvatar['cabello']>['estilo']; etiqueta: string }[] = [
  { id: 'corto', etiqueta: 'Corto' },
  { id: 'tupe', etiqueta: 'Tupé' },
  { id: 'largo', etiqueta: 'Largo' },
  { id: 'rizado', etiqueta: 'Rizado' },
  { id: 'bun', etiqueta: 'Moño' },
  { id: 'calvo', etiqueta: 'Calvo' },
];

const ESTILOS_VELLO_FACIAL: { id: NonNullable<PersonalizacionAvatar['velloFacial']>['estilo']; etiqueta: string }[] = [
  { id: 'ninguno', etiqueta: 'Lampiño' },
  { id: 'bigote', etiqueta: 'Bigote' },
  { id: 'perilla', etiqueta: 'Perilla' },
  { id: 'barba', etiqueta: 'Barba' },
  { id: 'candado', etiqueta: 'Candado' },
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
  const [pestaña, setPestaña] = useState<'cabello' | 'vello' | 'rostro' | 'ropa' | 'piel' | 'accesorios'>('cabello');

  const estiloCabelloActual = personalizacion.cabello?.estilo || personalizacion.estiloCabello || 'corto';
  const colorCabelloActual = personalizacion.cabello?.color || personalizacion.colorCabello || '#2c1d11';
  const estiloVelloActual = personalizacion.velloFacial?.estilo || 'ninguno';
  const colorVelloActual = personalizacion.velloFacial?.color || colorCabelloActual;

  const colorPrimarioActual = personalizacion.ropa?.colorPrimario || personalizacion.colorRopa || '#3498db';
  const colorSecundarioActual = personalizacion.ropa?.colorSecundario || '#1d4ed8';

  const actualizar = (cambios: Partial<PersonalizacionAvatar>) => {
    onCambiar({ ...personalizacion, ...cambios });
  };

  const actualizarRopa = (clave: 'colorPrimario' | 'colorSecundario', val: string) => {
    onCambiar({
      ...personalizacion,
      colorRopa: clave === 'colorPrimario' ? val : personalizacion.colorRopa,
      ropa: {
        colorPrimario: clave === 'colorPrimario' ? val : colorPrimarioActual,
        colorSecundario: clave === 'colorSecundario' ? val : colorSecundarioActual,
      },
    });
  };

  const actualizarCabello = (clave: 'estilo' | 'color', val: string) => {
    onCambiar({
      ...personalizacion,
      estiloCabello: clave === 'estilo' ? (val as any) : estiloCabelloActual,
      colorCabello: clave === 'color' ? val : colorCabelloActual,
      cabello: {
        estilo: clave === 'estilo' ? (val as any) : estiloCabelloActual,
        color: clave === 'color' ? val : colorCabelloActual,
      },
    });
  };

  const actualizarVello = (clave: 'estilo' | 'color', val: string) => {
    onCambiar({
      ...personalizacion,
      velloFacial: {
        estilo: clave === 'estilo' ? (val as any) : estiloVelloActual,
        color: clave === 'color' ? val : colorVelloActual,
      },
    });
  };

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
            {(['cabello', 'vello', 'rostro', 'ropa', 'piel', 'accesorios'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setPestaña(t)}
                style={{
                  ...estilos.tab,
                  ...(pestaña === t ? estilos.tabActiva : {}),
                }}
              >
                {t === 'vello' ? 'Vello' : t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Pestaña Cabello */}
          {pestaña === 'cabello' && (
            <div style={estilos.seccion}>
              <span style={estilos.subtitulo}>Estilo de Peinado:</span>
              <div style={estilos.gridBotones}>
                {ESTILOS_CABELLO.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => actualizarCabello('estilo', item.id)}
                    style={{
                      ...estilos.btnOpcion,
                      ...(estiloCabelloActual === item.id ? estilos.btnOpcionActivo : {}),
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
                    onClick={() => actualizarCabello('color', c)}
                    style={{
                      ...estilos.swatch,
                      background: c,
                      outline: colorCabelloActual === c ? '3px solid #60a5fa' : '2px solid rgba(255,255,255,0.2)',
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Pestaña Vello Facial */}
          {pestaña === 'vello' && (
            <div style={estilos.seccion}>
              <span style={estilos.subtitulo}>Estilo de Vello Facial:</span>
              <div style={estilos.gridBotones}>
                {ESTILOS_VELLO_FACIAL.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => actualizarVello('estilo', item.id)}
                    style={{
                      ...estilos.btnOpcion,
                      ...(estiloVelloActual === item.id ? estilos.btnOpcionActivo : {}),
                    }}
                  >
                    {item.etiqueta}
                  </button>
                ))}
              </div>

              <span style={{ ...estilos.subtitulo, marginTop: '8px' }}>Tinte de Barba/Bigote:</span>
              <div style={estilos.swatches}>
                {COLORES_CABELLO.map((c) => (
                  <button
                    key={c}
                    onClick={() => actualizarVello('color', c)}
                    style={{
                      ...estilos.swatch,
                      background: c,
                      outline: colorVelloActual === c ? '3px solid #60a5fa' : '2px solid rgba(255,255,255,0.2)',
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Pestaña Rostro */}
          {pestaña === 'rostro' && (
            <div style={estilos.seccion}>
              <span style={estilos.subtitulo}>Expresión Facial (Atlas UV):</span>
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

          {/* Pestaña Ropa (Shader Dual Tinte Primario & Secundario) */}
          {pestaña === 'ropa' && (
            <div style={estilos.seccion}>
              <span style={estilos.subtitulo}>Color Primario de Ropa:</span>
              <div style={estilos.swatches}>
                {COLORES_ROPA.map((c) => (
                  <button
                    key={c}
                    onClick={() => actualizarRopa('colorPrimario', c)}
                    style={{
                      ...estilos.swatch,
                      background: c,
                      outline: colorPrimarioActual === c ? '3px solid #fff' : '2px solid rgba(255,255,255,0.2)',
                    }}
                  />
                ))}
              </div>

              <span style={{ ...estilos.subtitulo, marginTop: '8px' }}>Color Secundario / Acentuado:</span>
              <div style={estilos.swatches}>
                {COLORES_ROPA.map((c) => (
                  <button
                    key={`sec-${c}`}
                    onClick={() => actualizarRopa('colorSecundario', c)}
                    style={{
                      ...estilos.swatch,
                      background: c,
                      outline: colorSecundarioActual === c ? '3px solid #60a5fa' : '2px solid rgba(255,255,255,0.2)',
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Pestaña Piel */}
          {pestaña === 'piel' && (
            <div style={estilos.seccion}>
              <span style={estilos.subtitulo}>Tono de Piel:</span>
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
    width: '300px',
    boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
  },
  tabs: { display: 'flex', gap: '4px', marginBottom: '14px', flexWrap: 'wrap' },
  tab: {
    flex: '1 1 28%',
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
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
  },
  checkboxFila: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#e2e8f0', cursor: 'pointer' },
};

export default CustomizadorAvatar;
