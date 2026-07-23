import { useState } from 'react'

const COLORES_ROPA = [
  '#e67e22', '#3498db', '#e74c3c', '#2ecc71',
  '#9b59b6', '#f1c40f', '#1abc9c', '#34495e',
]

const TONOS_PIEL = ['#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a21']

/**
 * Panel flotante para editar la personalización del avatar en vivo.
 * Es "controlado": recibe el estado actual y una función para actualizarlo,
 * el dueño de la verdad es World.jsx (que además lo persiste en localStorage).
 */
export default function CustomizadorAvatar({ personalizacion, onCambiar, abierto, onToggle }) {
  const [pestaña, setPestaña] = useState('ropa')

  const actualizar = (cambios) => onCambiar({ ...personalizacion, ...cambios })
  const actualizarAccesorio = (clave, valor) =>
    onCambiar({
      ...personalizacion,
      accesorios: { ...personalizacion.accesorios, [clave]: valor },
    })

  return (
    <div style={estilos.contenedor}>
      <button style={estilos.botonToggle} onClick={onToggle}>
        {abierto ? 'Cerrar personalización ✕' : 'Personalizar avatar ✎'}
      </button>

      {abierto && (
        <div style={estilos.panel}>
          <div style={estilos.tabs}>
            {['ropa', 'piel', 'tamaño', 'accesorios'].map((t) => (
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
                      outline:
                        personalizacion.colorRopa === c
                          ? '3px solid #fff'
                          : '2px solid rgba(255,255,255,0.2)',
                    }}
                    aria-label={`color de ropa ${c}`}
                  />
                ))}
              </div>
              <label style={estilos.etiquetaInput}>
                Color personalizado:
                <input
                  type="color"
                  value={personalizacion.colorRopa}
                  onChange={(e) => actualizar({ colorRopa: e.target.value })}
                  style={estilos.inputColor}
                />
              </label>
            </div>
          )}

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
                      outline:
                        personalizacion.colorPiel === c
                          ? '3px solid #fff'
                          : '2px solid rgba(255,255,255,0.2)',
                    }}
                    aria-label={`tono de piel ${c}`}
                  />
                ))}
              </div>
            </div>
          )}

          {pestaña === 'tamaño' && (
            <div style={estilos.seccion}>
              <label style={estilos.etiquetaInput}>
                Tamaño: {personalizacion.escala.toFixed(2)}x
                <input
                  type="range"
                  min="0.7"
                  max="1.4"
                  step="0.05"
                  value={personalizacion.escala}
                  onChange={(e) => actualizar({ escala: parseFloat(e.target.value) })}
                  style={estilos.slider}
                />
              </label>
            </div>
          )}

          {pestaña === 'accesorios' && (
            <div style={estilos.seccion}>
              {[
                { clave: 'sombrero', etiqueta: 'Sombrero' },
                { clave: 'gafas', etiqueta: 'Gafas' },
                { clave: 'mochila', etiqueta: 'Mochila' },
              ].map(({ clave, etiqueta }) => (
                <label key={clave} style={estilos.checkboxFila}>
                  <input
                    type="checkbox"
                    checked={personalizacion.accesorios[clave]}
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
  )
}

const estilos = {
  contenedor: {
    position: 'absolute',
    bottom: '16px',
    right: '16px',
    pointerEvents: 'auto',
    fontFamily: 'system-ui, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '8px',
  },
  botonToggle: {
    background: '#2c3e50',
    color: '#fff',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '8px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  panel: {
    background: 'rgba(20,20,20,0.9)',
    color: '#fff',
    padding: '14px',
    borderRadius: '12px',
    width: '260px',
  },
  tabs: { display: 'flex', gap: '6px', marginBottom: '12px' },
  tab: {
    flex: 1,
    background: 'rgba(255,255,255,0.08)',
    color: '#ccc',
    border: 'none',
    padding: '6px 4px',
    borderRadius: '6px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  tabActiva: { background: '#3498db', color: '#fff', fontWeight: 600 },
  seccion: { display: 'flex', flexDirection: 'column', gap: '10px' },
  swatches: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  swatch: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
  },
  etiquetaInput: { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' },
  inputColor: { width: '100%', height: '32px', border: 'none', borderRadius: '6px', cursor: 'pointer' },
  slider: { width: '100%' },
  checkboxFila: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' },
}
