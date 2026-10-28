import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { AvatarModel } from './mundo3d/AvatarModel.js';
import { normalizarApariencia, type Apariencia, type PersonalizacionAvatar } from './mundo3d/personalizacion.js';
import { EditorApariencia } from './mundo3d/EditorApariencia.js';

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
  const [apariencia, setApariencia] = useState<Apariencia>(() => normalizarApariencia(aparienciaInicial));

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
            <Canvas camera={{ position: [0, 1.15, 2.8], fov: 42 }} style={{ background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)', borderRadius: '14px' }}>
              <ambientLight intensity={0.9} />
              <directionalLight position={[5, 8, 5]} intensity={1.3} castShadow />
              <hemisphereLight args={['#dbeafe', '#334155', 0.6]} />

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
                target={[0, 0.3, 0]}
                maxPolarAngle={Math.PI / 2 + 0.1}
                minPolarAngle={Math.PI / 6}
              />
            </Canvas>

            <div className="orbit-hint-badge">
              <span>🖱️ Haz clic y arrastra para rotar 360°</span>
            </div>
          </div>

          {/* LADO DERECHO: las opciones del editor compartido */}
          <div className="customizer-controls-panel">
            <EditorApariencia apariencia={apariencia} onCambiar={setApariencia} />
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
