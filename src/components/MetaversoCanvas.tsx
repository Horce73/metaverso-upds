import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { Socket } from 'socket.io-client';
import * as THREE from 'three';
import { AudioClient } from './AudioClient.js';

// Componentes 3D unificados
import { Campus } from './mundo3d/Campus.js';
import { Door } from './mundo3d/Door.js';
import { CameraRig, type AvatarEstadoRef } from './mundo3d/CameraRig.js';
import { AvatarModel, type PersonalizacionAvatar, PERSONALIZACION_POR_DEFECTO } from './mundo3d/AvatarModel.js';
import { CustomizadorAvatar } from './mundo3d/CustomizadorAvatar.js';

interface MetaversoCanvasProps {
  socket: Socket;
  audioClient: AudioClient | null;
  isAula: boolean;
  localAvatar: any;
  remoteUsers: { [socketId: string]: any };
  onUpdateAvatarPersonalization?: (nueva: PersonalizacionAvatar) => void;
}

// Subcomponente de Controles de Movimiento y Cámara del Jugador Local
const LocalPlayerController: React.FC<{
  socket: Socket;
  audioClient: AudioClient | null;
  localAvatar: any;
  personalizacion: PersonalizacionAvatar;
  avatarEstadoRef: React.MutableRefObject<AvatarEstadoRef>;
  onMove: (pos: [number, number, number], rot: [number, number, number]) => void;
}> = ({ socket, audioClient, localAvatar, personalizacion, avatarEstadoRef, onMove }) => {
  const handleUpdatePosicion = (posicion: THREE.Vector3, anguloAvatar: number) => {
    avatarEstadoRef.current.posicion.copy(posicion);
    // El angulo de la camara (avatarEstadoRef.current.angulo) se mantiene y controla mediante el arrastre de mouse en CameraRig

    const posArray: [number, number, number] = [posicion.x, posicion.y, posicion.z];
    const rotArray: [number, number, number] = [0, anguloAvatar, 0];

    onMove(posArray, rotArray);

    // Emitir socket
    socket.emit('move', {
      position: posArray,
      rotation: rotArray,
    });

    // Actualizar VoIP listener
    if (audioClient) {
      audioClient.updateListenerPosition(posArray, rotArray);
    }
  };

  return (
    <AvatarModel
      nombre={localAvatar?.nombre_visible || 'Tú'}
      personalizacion={personalizacion}
      position={[0, 0, 5]}
      isLocal={true}
      onUpdatePosicion={handleUpdatePosicion}
    />
  );
};

// Detector de cercanía al portón de asistencia
const DetectorPuerta: React.FC<{
  avatarEstadoRef: React.MutableRefObject<AvatarEstadoRef>;
  posicionPuerta: THREE.Vector3;
  onTrigger: () => void;
}> = ({ avatarEstadoRef, posicionPuerta, onTrigger }) => {
  const ultimoTriggerRef = useRef(0);

  useFrame(() => {
    if (!avatarEstadoRef.current?.posicion) return;
    const distancia = avatarEstadoRef.current.posicion.distanceTo(posicionPuerta);
    const ahora = Date.now();
    if (distancia <= 2.5 && ahora - ultimoTriggerRef.current > 10000) {
      ultimoTriggerRef.current = ahora;
      onTrigger();
    }
  });

  return null;
};

// Elementos del Aula Virtual (Mesas, Pizarra 3D, Paredes)
const EscenarioAula: React.FC = () => {
  return (
    <group>
      <ambientLight intensity={0.7} />
      <directionalLight position={[10, 20, 10]} intensity={1.2} castShadow />

      {/* Piso */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#2b2d35" roughness={0.9} />
      </mesh>
      <gridHelper args={[40, 20, '#5b82f6', '#26344d']} position={[0, 0.01, 0]} />

      {/* Pizarrón del aula (3D) */}
      <mesh position={[0, 2, -19]}>
        <boxGeometry args={[12, 5, 0.2]} />
        <meshStandardMaterial color="#0f172a" roughness={0.5} />
      </mesh>
      <mesh position={[0, 2, -18.89]}>
        <boxGeometry args={[11.6, 4.6, 0.02]} />
        <meshStandardMaterial color="#0b0f19" roughness={0.1} emissive="#111" />
      </mesh>

      {/* Escritorio del docente */}
      <mesh position={[0, 0.5, -14]} castShadow receiveShadow>
        <boxGeometry args={[4, 1, 1.5]} />
        <meshStandardMaterial color="#475569" />
      </mesh>

      {/* Sillas / Cubos para estudiantes */}
      {[-6, -2, 2, 6].map((x) =>
        [-8, -4, 0, 4].map((z) => (
          <mesh key={`silla-${x}-${z}`} position={[x, 0.3, z]} castShadow>
            <boxGeometry args={[0.7, 0.6, 0.7]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
        ))
      )}

      {/* Paredes */}
      <mesh position={[0, 4, -20]} receiveShadow userData={{ esPared: true }}>
        <boxGeometry args={[40, 8, 0.5]} />
        <meshStandardMaterial color="#1e2028" />
      </mesh>
      <mesh position={[-20, 4, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow userData={{ esPared: true }}>
        <boxGeometry args={[40, 8, 0.5]} />
        <meshStandardMaterial color="#1e2028" />
      </mesh>
      <mesh position={[20, 4, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow userData={{ esPared: true }}>
        <boxGeometry args={[40, 8, 0.5]} />
        <meshStandardMaterial color="#1e2028" />
      </mesh>
    </group>
  );
};

export const MetaversoCanvas: React.FC<MetaversoCanvasProps> = ({
  socket,
  audioClient,
  isAula,
  localAvatar,
  remoteUsers,
  onUpdateAvatarPersonalization,
}) => {
  const avatarEstadoRef = useRef<AvatarEstadoRef>({
    posicion: new THREE.Vector3(0, 0, 5),
    angulo: 0,
  });

  const [panelCustomizerAbierto, setPanelCustomizerAbierto] = useState(false);
  const [personalizacion, setPersonalizacion] = useState<PersonalizacionAvatar>(() => {
    if (localAvatar?.apariencia && Object.keys(localAvatar.apariencia).length > 0) {
      return { ...PERSONALIZACION_POR_DEFECTO, ...localAvatar.apariencia };
    }
    return PERSONALIZACION_POR_DEFECTO;
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleCambiarPersonalizacion = (nueva: PersonalizacionAvatar) => {
    setPersonalizacion(nueva);
    onUpdateAvatarPersonalization?.(nueva);
  };

  const POSICION_PUERTA = new THREE.Vector3(0, 0, -5);

  const handleTriggerPuerta = () => {
    setToastMessage('📍 ¡Has llegado al portón principal del Campus UPDS!');
    setTimeout(() => setToastMessage(null), 4000);
  };

  useEffect(() => {
    if (audioClient) {
      Object.keys(remoteUsers).forEach((socketId) => {
        const user = remoteUsers[socketId];
        if (user.peerId && user.position) {
          audioClient.updateSourcePosition(user.peerId, user.position);
        }
      });
    }
  }, [remoteUsers, audioClient]);

  return (
    <div className="canvas-container" style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <Canvas shadows camera={{ fov: 60, position: [0, 3, 10] }}>
        <color attach="background" args={[isAula ? '#050508' : '#87ceeb']} />
        {!isAula && <Stars radius={100} depth={50} count={1500} factor={4} saturation={0} fade speed={1} />}

        {/* Luces principales */}
        <ambientLight intensity={isAula ? 0.6 : 0.7} />
        <directionalLight
          position={[10, 20, 10]}
          intensity={1.2}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />

        {/* Escenario 3D */}
        {isAula ? (
          <EscenarioAula />
        ) : (
          <group>
            <Campus />
            <Door position={[POSICION_PUERTA.x, POSICION_PUERTA.y, POSICION_PUERTA.z]} />
            <DetectorPuerta
              avatarEstadoRef={avatarEstadoRef}
              posicionPuerta={POSICION_PUERTA}
              onTrigger={handleTriggerPuerta}
            />
          </group>
        )}

        {/* Controlador del Jugador Local */}
        <LocalPlayerController
          socket={socket}
          audioClient={audioClient}
          localAvatar={localAvatar}
          personalizacion={personalizacion}
          avatarEstadoRef={avatarEstadoRef}
          onMove={() => {}}
        />

        {/* Cámara en 3ra Persona con seguimiento suave y colisiones */}
        <CameraRig avatarEstadoRef={avatarEstadoRef} />

        {/* Renderizado de Avatares Remotos */}
        {Object.keys(remoteUsers).map((socketId) => {
          const u = remoteUsers[socketId];
          const aparienciaRemota: PersonalizacionAvatar = u.apariencia && Object.keys(u.apariencia).length > 0
            ? { ...PERSONALIZACION_POR_DEFECTO, ...u.apariencia }
            : PERSONALIZACION_POR_DEFECTO;

          return (
            <AvatarModel
              key={socketId}
              nombre={u.nombreVisible || 'Estudiante'}
              personalizacion={aparienciaRemota}
              position={u.position || [0, 0, 0]}
              rotation={u.rotation || [0, 0, 0]}
              isLocal={false}
            />
          );
        })}
      </Canvas>

      {/* UI Flotante de Personalización del Avatar */}
      <CustomizadorAvatar
        personalizacion={personalizacion}
        onCambiar={handleCambiarPersonalizacion}
        abierto={panelCustomizerAbierto}
        onToggle={() => setPanelCustomizerAbierto((v) => !v)}
      />

      {/* Toast Notificación */}
      {toastMessage && (
        <div
          style={{
            position: 'absolute',
            top: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(30, 41, 59, 0.95)',
            color: '#fff',
            padding: '10px 20px',
            borderRadius: '10px',
            border: '1px solid #3b82f6',
            fontWeight: 600,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            zIndex: 100,
          }}
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
};

export default MetaversoCanvas;
