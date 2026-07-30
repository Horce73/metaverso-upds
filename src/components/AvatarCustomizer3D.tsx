import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { AvatarModel, type PersonalizacionAvatar, PERSONALIZACION_POR_DEFECTO } from './mundo3d/AvatarModel.js';

const COLORES_ROPA = [
  '#3498db', '#e67e22', '#e74c3c', '#2ecc71',
  '#9b59b6', '#f1c40f', '#1abc9c', '#34495e',
  '#0033A0', '#10b981', '#ec4899', '#6366f1'
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

export interface AvatarCustomizer3DProps {
  nombreVisible: string;
  aparienciaInicial?: PersonalizacionAvatar;
  onSave: (apariencia: PersonalizacionAvatar) => void;
  onSkip?: () => void;
  onCancel?: () => void;
  title?: string;
  subtitle?: string;
  saveButtonText?: string;
  showSkipButton?: boolean;
}

export const AvatarCustomizer3D: React.FC<AvatarCustomizer3DProps> = ({
  nombreVisible,
  aparienciaInicial,
  onSave,
  onSkip,
  onCancel,
  title = 'Personalización de Tu Avatar 3D',
  subtitle = 'Arrastra con el mouse para rotar a tu personaje 360°',
  saveButtonText = '🎉 Guardar y Entrar',
  showSkipButton = false,
}) => {
  const [apariencia, setApariencia] = useState<PersonalizacionAvatar>({
    ...PERSONALIZACION_POR_DEFECTO,
    ...aparienciaInicial,
  });

  const [pestaña, setPestaña] = useState<'cabello' | 'vello' | 'rostro' | 'ropa' | 'piel' | 'accesorios'>('cabello');

  const estiloCabelloActual = apariencia.cabello?.estilo || apariencia.estiloCabello || 'corto';
  const colorCabelloActual = apariencia.cabello?.color || apariencia.colorCabello || '#2c1d11';
  const estiloVelloActual = apariencia.velloFacial?.estilo || 'ninguno';
  const colorVelloActual = apariencia.velloFacial?.color || colorCabelloActual;

  const colorPrimarioActual = apariencia.ropa?.colorPrimario || apariencia.colorRopa || '#3498db';
  const colorSecundarioActual = apariencia.ropa?.colorSecundario || '#1d4ed8';

  const actualizar = (cambios: Partial<PersonalizacionAvatar>) => {
    setApariencia((prev) => ({ ...prev, ...cambios }));
  };

  const actualizarCabello = (clave: 'estilo' | 'color', val: string) => {
    setApariencia((prev) => ({
      ...prev,
      estiloCabello: clave === 'estilo' ? (val as any) : estiloCabelloActual,
      colorCabello: clave === 'color' ? val : colorCabelloActual,
      cabello: {
        estilo: clave === 'estilo' ? (val as any) : estiloCabelloActual,
        color: clave === 'color' ? val : colorCabelloActual,
      },
    }));
  };

  const actualizarVello = (clave: 'estilo' | 'color', val: string) => {
    setApariencia((prev) => ({
      ...prev,
      velloFacial: {
        estilo: clave === 'estilo' ? (val as any) : estiloVelloActual,
        color: clave === 'color' ? val : colorVelloActual,
      },
    }));
  };

  const actualizarRopa = (clave: 'colorPrimario' | 'colorSecundario', val: string) => {
    setApariencia((prev) => ({
      ...prev,
      colorRopa: clave === 'colorPrimario' ? val : prev.colorRopa,
      ropa: {
        colorPrimario: clave === 'colorPrimario' ? val : colorPrimarioActual,
        colorSecundario: clave === 'colorSecundario' ? val : colorSecundarioActual,
      },
    }));
  };

  const actualizarAccesorio = (clave: 'sombrero' | 'gafas' | 'mochila', valor: boolean) => {
    setApariencia((prev) => ({
      ...prev,
      accesorios: { ...prev.accesorios, [clave]: valor },
    }));
  };

  return (
    <div className="avatar-customizer-3d-wrapper">
      <div className="customizer-card glass-panel">
        <div className="customizer-header">
          <h2 className="gradient-text">{title}</h2>
          <p className="customizer-subtitle">{subtitle}</p>
        </div>

        <div className="customizer-body">
          {/* LADO IZQUIERDO: Visualizador 3D interactivo con rotación de mouse */}
          <div className="avatar-3d-preview-box">
            <Canvas camera={{ position: [0, 1.1, 3.2], fov: 45 }} style={{ background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)', borderRadius: '14px' }}>
              <ambientLight intensity={0.9} />
              <directionalLight position={[5, 8, 5]} intensity={1.3} castShadow />
              <pointLight position={[-5, 5, -5]} intensity={0.5} />

              <group position={[0, -0.9, 0]}>
                <AvatarModel
                  nombre={nombreVisible || 'Tu Avatar'}
                  personalizacion={apariencia}
                  position={[0, 0, 0]}
                  isLocal={false}
                />
                {/* Plataforma circular */}
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
                  <circleGeometry args={[1.5, 32]} />
                  <meshStandardMaterial color="#334155" roughness={0.6} />
                </mesh>
              </group>

              {/* Control de Órbita / Rotación por Mouse */}
              <OrbitControls
                enableZoom={true}
                minDistance={1.6}
                maxDistance={4.5}
                target={[0, 0.2, 0]}
                maxPolarAngle={Math.PI / 2 + 0.1}
                minPolarAngle={Math.PI / 6}
              />
            </Canvas>

            <div className="orbit-hint-badge">
              <span>🖱️ Haz clic y arrastra para rotar 360°</span>
            </div>
          </div>

          {/* LADO DERECHO: Panel de Control de Personalización */}
          <div className="customizer-controls-panel">
            <div className="customizer-tabs">
              <button
                type="button"
                className={`tab-btn ${pestaña === 'cabello' ? 'active' : ''}`}
                onClick={() => setPestaña('cabello')}
              >
                💇 Cabello
              </button>
              <button
                type="button"
                className={`tab-btn ${pestaña === 'vello' ? 'active' : ''}`}
                onClick={() => setPestaña('vello')}
              >
                🧔 Vello
              </button>
              <button
                type="button"
                className={`tab-btn ${pestaña === 'rostro' ? 'active' : ''}`}
                onClick={() => setPestaña('rostro')}
              >
                😊 Rostro
              </button>
              <button
                type="button"
                className={`tab-btn ${pestaña === 'ropa' ? 'active' : ''}`}
                onClick={() => setPestaña('ropa')}
              >
                👕 Ropa
              </button>
              <button
                type="button"
                className={`tab-btn ${pestaña === 'piel' ? 'active' : ''}`}
                onClick={() => setPestaña('piel')}
              >
                🎨 Piel
              </button>
              <button
                type="button"
                className={`tab-btn ${pestaña === 'accesorios' ? 'active' : ''}`}
                onClick={() => setPestaña('accesorios')}
              >
                🎒 Extras
              </button>
            </div>

            <div className="tab-content-area">
              {/* Cabello */}
              {pestaña === 'cabello' && (
                <div className="control-group-section">
                  <label className="section-label">Estilo de Peinado</label>
                  <div className="options-grid">
                    {ESTILOS_CABELLO.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`option-btn ${estiloCabelloActual === item.id ? 'selected' : ''}`}
                        onClick={() => actualizarCabello('estilo', item.id)}
                      >
                        {item.etiqueta}
                      </button>
                    ))}
                  </div>

                  <label className="section-label" style={{ marginTop: '16px' }}>Color de Cabello</label>
                  <div className="swatches-row">
                    {COLORES_CABELLO.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`color-swatch ${colorCabelloActual === color ? 'selected' : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => actualizarCabello('color', color)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Vello Facial */}
              {pestaña === 'vello' && (
                <div className="control-group-section">
                  <label className="section-label">Vello Facial</label>
                  <div className="options-grid">
                    {ESTILOS_VELLO_FACIAL.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`option-btn ${estiloVelloActual === item.id ? 'selected' : ''}`}
                        onClick={() => actualizarVello('estilo', item.id)}
                      >
                        {item.etiqueta}
                      </button>
                    ))}
                  </div>

                  <label className="section-label" style={{ marginTop: '16px' }}>Color de Barba/Bigote</label>
                  <div className="swatches-row">
                    {COLORES_CABELLO.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`color-swatch ${colorVelloActual === color ? 'selected' : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => actualizarVello('color', color)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Rostro */}
              {pestaña === 'rostro' && (
                <div className="control-group-section">
                  <label className="section-label">Expresión Facial (UV Atlas)</label>
                  <div className="options-grid">
                    {EXPRESIONES_ROSTRO.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`option-btn ${apariencia.expresionRostro === item.id ? 'selected' : ''}`}
                        onClick={() => actualizar({ expresionRostro: item.id })}
                      >
                        {item.emoji} {item.etiqueta}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Ropa */}
              {pestaña === 'ropa' && (
                <div className="control-group-section">
                  <label className="section-label">Color Primario (Shader)</label>
                  <div className="swatches-row">
                    {COLORES_ROPA.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`color-swatch ${colorPrimarioActual === color ? 'selected' : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => actualizarRopa('colorPrimario', color)}
                      />
                    ))}
                  </div>

                  <label className="section-label" style={{ marginTop: '14px' }}>Color Secundario / Acentos</label>
                  <div className="swatches-row">
                    {COLORES_ROPA.map((color) => (
                      <button
                        key={`sec-${color}`}
                        type="button"
                        className={`color-swatch ${colorSecundarioActual === color ? 'selected' : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => actualizarRopa('colorSecundario', color)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Piel */}
              {pestaña === 'piel' && (
                <div className="control-group-section">
                  <label className="section-label">Tono de Piel</label>
                  <div className="swatches-row">
                    {TONOS_PIEL.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`color-swatch ${apariencia.colorPiel === color ? 'selected' : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => actualizar({ colorPiel: color })}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Accesorios */}
              {pestaña === 'accesorios' && (
                <div className="control-group-section">
                  <label className="section-label">Accesorios 3D</label>
                  <div className="checkboxes-list">
                    {[
                      { clave: 'sombrero' as const, etiqueta: '🤠 Sombrero Vaquero' },
                      { clave: 'gafas' as const, etiqueta: '🕶️ Gafas de Sol' },
                      { clave: 'mochila' as const, etiqueta: '🎒 Mochila Estudiantil' },
                    ].map(({ clave, etiqueta }) => (
                      <label key={clave} className="checkbox-card">
                        <input
                          type="checkbox"
                          checked={!!apariencia.accesorios?.[clave]}
                          onChange={(e) => actualizarAccesorio(clave, e.target.checked)}
                        />
                        <span>{etiqueta}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Acciones Inferiores */}
        <div className="customizer-actions">
          {onCancel && (
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Cancelar
            </button>
          )}

          {showSkipButton && onSkip && (
            <button type="button" className="btn-secondary" onClick={onSkip} style={{ background: 'rgba(255,255,255,0.06)' }}>
              Omitir por ahora ⏩
            </button>
          )}

          <button
            type="button"
            className="btn-primary"
            onClick={() => onSave(apariencia)}
            style={{ marginLeft: 'auto' }}
          >
            {saveButtonText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AvatarCustomizer3D;
