import React, { useRef, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { Socket } from 'socket.io-client';
import * as THREE from 'three';
import { AudioClient } from './AudioClient.js';

// Componentes 3D unificados
import { Campus, posicionAula, type AulaCampus } from './mundo3d/Campus.js';
import { CameraRig, type AvatarEstadoRef } from './mundo3d/CameraRig.js';
import { AvatarModel, type PersonalizacionAvatar, PERSONALIZACION_POR_DEFECTO } from './mundo3d/AvatarModel.js';
import { CustomizadorAvatar } from './mundo3d/CustomizadorAvatar.js';
import { Pupitre, EscritorioProfesor, Sofa, Estanteria } from './mundo3d/Mobiliario.js';
import { crearTexturaTexto } from './mundo3d/texto3d.js';

export interface AsientoInteractive {
  x: number;
  y: number;
  z: number;
  angulo: number;
  label: string;
}

interface MetaversoCanvasProps {
  socket: Socket;
  audioClient: AudioClient | null;
  isAula: boolean;
  localAvatar: any;
  remoteUsers: { [socketId: string]: any };
  espacios?: any[];
  onInteractuarAula?: (espacio: any) => void;
  onUpdateAvatarPersonalization?: (nueva: PersonalizacionAvatar) => void;
}

// Subcomponente de Controles de Movimiento y Cámara del Jugador Local
const LocalPlayerController: React.FC<{
  socket: Socket;
  audioClient: AudioClient | null;
  localAvatar: any;
  personalizacion: PersonalizacionAvatar;
  avatarEstadoRef: React.MutableRefObject<AvatarEstadoRef>;
  isAula: boolean;
  estaSentado: boolean;
  posicionSentadoTarget: AsientoInteractive | null;
  onMove: (pos: [number, number, number], rot: [number, number, number]) => void;
}> = ({
  socket,
  audioClient,
  localAvatar,
  personalizacion,
  avatarEstadoRef,
  isAula,
  estaSentado,
  posicionSentadoTarget,
  onMove,
}) => {
  const handleUpdatePosicion = (posicion: THREE.Vector3, anguloAvatar: number) => {
    avatarEstadoRef.current.posicion.copy(posicion);

    const posArray: [number, number, number] = [posicion.x, posicion.y, posicion.z];
    const rotArray: [number, number, number] = [0, anguloAvatar, 0];

    onMove(posArray, rotArray);

    socket.emit('move', {
      position: posArray,
      rotation: rotArray,
      estaSentado,
    });

    if (audioClient) {
      audioClient.updateListenerPosition(posArray, rotArray);
    }
  };

  const initialPos: [number, number, number] = isAula ? [0, 0, 3] : [0, 0, 11];

  return (
    <AvatarModel
      nombre={localAvatar?.nombre_visible || 'Tú'}
      personalizacion={personalizacion}
      position={initialPos}
      isLocal={true}
      isAula={isAula}
      estaSentado={estaSentado}
      posicionSentado={posicionSentadoTarget}
      onUpdatePosicion={handleUpdatePosicion}
    />
  );
};

// Elementos del Aula Virtual
const EscenarioAula: React.FC = () => {
  return (
    <group>
      <ambientLight intensity={0.95} color="#ffffff" />
      <directionalLight
        position={[15, 25, 12]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[1024, 1024]}
        color="#fffbeb"
      />
      <directionalLight position={[-15, 15, -10]} intensity={0.6} color="#e0f2fe" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#d97706" roughness={0.35} metalness={0.05} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -2]} receiveShadow>
        <planeGeometry args={[30, 26]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -2]} receiveShadow>
        <planeGeometry args={[28, 24]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.4} />
      </mesh>

      <group position={[0, 3.2, -19.7]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[16.4, 6.4, 0.3]} />
          <meshStandardMaterial color="#3b2417" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0, 0.16]}>
          <boxGeometry args={[15.8, 5.8, 0.05]} />
          <meshStandardMaterial color="#0f172a" roughness={0.2} emissive="#1e293b" />
        </mesh>
        <sprite position={[0, 3.7, 0.3]} scale={[6.5, 1.2, 1]}>
          <spriteMaterial
            attach="material"
            map={crearTexturaTexto('💻 Pizarra Digital UPDS — Aula Virtual', {
              ancho: 800,
              alto: 150,
              fondo: '#1e3a8a',
              color: '#ffffff',
              fuente: 'bold 44px sans-serif',
            })}
            transparent
          />
        </sprite>
      </group>

      <group position={[0, 0, -13]}>
        <EscritorioProfesor position={[0, 0, 0]} />
        <mesh position={[0, 0.9, -1.8]} castShadow>
          <boxGeometry args={[1.2, 1.4, 0.15]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
        <mesh position={[0, 0.5, -1.2]} castShadow>
          <boxGeometry args={[1.2, 0.12, 1.1]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
        <mesh position={[0.6, 0.94, 0.1]} castShadow>
          <boxGeometry args={[0.7, 0.03, 0.5]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.2} />
        </mesh>
        <mesh position={[0.6, 1.25, -0.15]} rotation={[-0.3, 0, 0]} castShadow>
          <boxGeometry args={[0.7, 0.5, 0.03]} />
          <meshStandardMaterial color="#0f172a" emissive="#3b82f6" emissiveIntensity={0.6} />
        </mesh>
      </group>

      {[-8.5, -3, 3, 8.5].map((x) =>
        [-5, 0, 5].map((z) => (
          <group key={`pupitre-${x}-${z}`} position={[x, 0, z]}>
            <Pupitre position={[0, 0, 0]} />
            <mesh position={[0.1, 0.99, -0.05]} castShadow>
              <boxGeometry args={[0.4, 0.03, 0.45]} />
              <meshStandardMaterial color={(x + z) % 2 === 0 ? '#2563eb' : '#059669'} />
            </mesh>
          </group>
        ))
      )}

      <Sofa position={[-16, 0, 12]} rotation={[0, Math.PI / 4, 0]} color="#0ea5e9" />
      <Sofa position={[16, 0, 12]} rotation={[0, -Math.PI / 4, 0]} color="#10b981" />
      <Estanteria position={[-18, 0, -10]} rotation={[0, Math.PI / 2, 0]} />
      <Estanteria position={[18, 0, -10]} rotation={[0, -Math.PI / 2, 0]} />

      <mesh position={[0, 4, -20]} receiveShadow userData={{ esPared: true }}>
        <boxGeometry args={[40, 8, 0.5]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.4, -19.7]}>
        <boxGeometry args={[40, 0.8, 0.1]} />
        <meshStandardMaterial color="#78350f" roughness={0.5} />
      </mesh>

      <mesh position={[-20, 1.5, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow userData={{ esPared: true }}>
        <boxGeometry args={[40, 3, 0.5]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
      </mesh>
      <mesh position={[-20, 7, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow userData={{ esPared: true }}>
        <boxGeometry args={[40, 2, 0.5]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
      </mesh>
      <mesh position={[-19.8, 4.5, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[36, 3]} />
        <meshStandardMaterial color="#38bdf8" transparent opacity={0.35} roughness={0.1} metalness={0.8} />
      </mesh>

      <mesh position={[20, 1.5, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow userData={{ esPared: true }}>
        <boxGeometry args={[40, 3, 0.5]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
      </mesh>
      <mesh position={[20, 7, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow userData={{ esPared: true }}>
        <boxGeometry args={[40, 2, 0.5]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
      </mesh>
      <mesh position={[19.8, 4.5, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[36, 3]} />
        <meshStandardMaterial color="#38bdf8" transparent opacity={0.35} roughness={0.1} metalness={0.8} />
      </mesh>

      <mesh position={[0, 4, 20]} rotation={[0, Math.PI, 0]} receiveShadow userData={{ esPared: true }}>
        <boxGeometry args={[40, 8, 0.5]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
      </mesh>

      {[-10, 0, 10].map((x) =>
        [-12, -4, 4, 12].map((z) => (
          <group key={`luz-${x}-${z}`} position={[x, 7.8, z]}>
            <mesh>
              <boxGeometry args={[3, 0.1, 3]} />
              <meshStandardMaterial color="#ffffff" emissive="#fef08a" emissiveIntensity={0.8} />
            </mesh>
            <pointLight intensity={0.3} distance={10} color="#fef08a" />
          </group>
        ))
      )}
    </group>
  );
};

export const MetaversoCanvas: React.FC<MetaversoCanvasProps> = ({
  socket,
  audioClient,
  isAula,
  localAvatar,
  remoteUsers,
  espacios,
  onInteractuarAula,
  onUpdateAvatarPersonalization,
}) => {
  const aulas = React.useMemo<AulaCampus[]>(
    () =>
      (espacios || [])
        .filter((e) => e.tipo === 'aula')
        .map((e) => ({ id: e.id, nombre: e.nombre, sesion_activa: e.sesion_activa })),
    [espacios]
  );

  // Campus/E-key solo conocen la forma recortada (AulaCampus); al interactuar
  // resolvemos de vuelta el espacio completo para que el padre (SolicitudAccesoModal, etc.)
  // reciba el objeto Espacio real con tipo/asignatura/capacidad.
  const handleInteractuarAula = React.useCallback(
    (aula: AulaCampus) => {
      const espacioCompleto = (espacios || []).find((e) => String(e.id) === String(aula.id));
      onInteractuarAula?.(espacioCompleto || aula);
    },
    [espacios, onInteractuarAula]
  );

  const avatarEstadoRef = useRef<AvatarEstadoRef>({
    posicion: new THREE.Vector3(0, 0, isAula ? 3 : 11),
    angulo: 0,
  });

  useEffect(() => {
    avatarEstadoRef.current.posicion.set(0, 0, isAula ? 3 : 11);
    avatarEstadoRef.current.angulo = 0;
  }, [isAula]);

  const [panelCustomizerAbierto, setPanelCustomizerAbierto] = useState(false);
  const [personalizacion, setPersonalizacion] = useState<PersonalizacionAvatar>(() => {
    if (localAvatar?.apariencia && Object.keys(localAvatar.apariencia).length > 0) {
      return { ...PERSONALIZACION_POR_DEFECTO, ...localAvatar.apariencia };
    }
    return PERSONALIZACION_POR_DEFECTO;
  });

  const handleCambiarPersonalizacion = (nueva: PersonalizacionAvatar) => {
    setPersonalizacion(nueva);
    onUpdateAvatarPersonalization?.(nueva);
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

  const [estaSentado, setEstaSentado] = useState(false);
  const [asientoCercano, setAsientoCercano] = useState<AsientoInteractive | null>(null);
  const [posicionSentadoTarget, setPosicionSentadoTarget] = useState<AsientoInteractive | null>(null);

  const ASIENTOS_AULA = React.useMemo(() => {
    const asientos: AsientoInteractive[] = [];

    const pupitresX = [-8.5, -3, 3, 8.5];
    const pupitresZ = [-5, 0, 5];
    for (const px of pupitresX) {
      for (const pz of pupitresZ) {
        asientos.push({
          x: px,
          y: 0,
          z: pz + 0.62,
          angulo: Math.PI,
          label: '🪑 Pupitre',
        });
      }
    }

    asientos.push({
      x: 0,
      y: 0,
      z: -14.2,
      angulo: 0,
      label: '👨‍🏫 Escritorio Docente',
    });

    asientos.push({
      x: -15.4,
      y: 0,
      z: 11.4,
      angulo: Math.PI / 4,
      label: '🛋️ Sofá',
    });
    asientos.push({
      x: 15.4,
      y: 0,
      z: 11.4,
      angulo: -Math.PI / 4,
      label: '🛋️ Sofá',
    });

    return asientos;
  }, []);

  useEffect(() => {
    if (!isAula) {
      setAsientoCercano(null);
      setEstaSentado(false);
      setPosicionSentadoTarget(null);
      return;
    }

    const interval = setInterval(() => {
      const pos = avatarEstadoRef.current.posicion;
      if (!pos || estaSentado) return;

      let mejorAsiento: AsientoInteractive | null = null;
      let minDist = 2.2;

      for (const asiento of ASIENTOS_AULA) {
        const d = Math.hypot(pos.x - asiento.x, pos.z - asiento.z);
        if (d < minDist) {
          minDist = d;
          mejorAsiento = asiento;
        }
      }

      setAsientoCercano(mejorAsiento);
    }, 150);

    return () => clearInterval(interval);
  }, [isAula, estaSentado, ASIENTOS_AULA]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }

      if (estaSentado) {
        if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyE'].includes(e.code) || e.key === 'e' || e.key === 'E') {
          setEstaSentado(false);
          setPosicionSentadoTarget(null);
          avatarEstadoRef.current.posicion.y = 0;
          return;
        }
      }

      if ((e.code === 'KeyE' || e.key === 'e' || e.key === 'E') && isAula && asientoCercano && !estaSentado) {
        setEstaSentado(true);
        setPosicionSentadoTarget(asientoCercano);
        avatarEstadoRef.current.posicion.set(asientoCercano.x, asientoCercano.y, asientoCercano.z);
        avatarEstadoRef.current.angulo = asientoCercano.angulo;
        avatarEstadoRef.current.solicitarSnapCamara = true;
        return;
      }

      if (e.code === 'KeyE' || e.key === 'e' || e.key === 'E') {
        if (isAula || !onInteractuarAula || aulas.length === 0) return;

        const pos = avatarEstadoRef.current.posicion;
        if (!pos) return;

        // Las aulas se ubican en la Isla 2, desplazada [0,0,-27] respecto al
        // origen del mundo (ver <group position={[0, 0, -27]}> en Campus.tsx).
        const ISLA_2_OFFSET_Z = -27;
        let aulaCercana: AulaCampus | null = null;
        let distMin = Infinity;
        aulas.forEach((aula, i) => {
          const [x, , z] = posicionAula(i);
          const d = Math.hypot(pos.x - x, pos.z - (z + ISLA_2_OFFSET_Z));
          if (d < distMin) {
            distMin = d;
            aulaCercana = aula;
          }
        });

        const MAX_DISTANCIA = 9.0;
        if (aulaCercana && distMin < MAX_DISTANCIA) {
          handleInteractuarAula(aulaCercana);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAula, estaSentado, asientoCercano, aulas, onInteractuarAula, handleInteractuarAula]);

  return (
    <div className="canvas-container" style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <Canvas
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, 1.5]}
        gl={{ powerPreference: 'high-performance', antialias: true }}
        camera={{ fov: 60, position: [0, 3, 10] }}
      >
        <color attach="background" args={['#87ceeb']} />
        <Stars radius={100} depth={50} count={1200} factor={4} saturation={0} fade speed={1} />

        <ambientLight intensity={isAula ? 0.9 : 0.7} color="#ffffff" />
        <directionalLight
          position={[10, 20, 10]}
          intensity={1.3}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />

        {isAula ? (
          <EscenarioAula />
        ) : (
          <group>
            <Campus aulas={aulas} onInteractuarAula={handleInteractuarAula} />
          </group>
        )}

        {isAula && asientoCercano && !estaSentado && (
          <sprite position={[asientoCercano.x, asientoCercano.y + 1.8, asientoCercano.z]} scale={[3.6, 0.8, 1]}>
            <spriteMaterial
              attach="material"
              map={crearTexturaTexto('🪑 Presiona [E] para Sentarse', {
                ancho: 500,
                alto: 100,
                fondo: '#0284c7',
                color: '#ffffff',
                fuente: 'bold 32px sans-serif',
              })}
              transparent
            />
          </sprite>
        )}

        <LocalPlayerController
          socket={socket}
          audioClient={audioClient}
          localAvatar={localAvatar}
          personalizacion={personalizacion}
          avatarEstadoRef={avatarEstadoRef}
          isAula={isAula}
          estaSentado={estaSentado}
          posicionSentadoTarget={posicionSentadoTarget}
          onMove={() => { }}
        />

        <CameraRig avatarEstadoRef={avatarEstadoRef} />

        {Object.keys(remoteUsers)
          .filter((sId) => {
            const u = remoteUsers[sId];
            if (sId === socket.id) return false;
            const localId = localAvatar?.usuario_id || localAvatar?.id;
            if (localId && u && String(u.userId) === String(localId)) return false;
            return true;
          })
          .map((socketId) => {
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
                estaSentado={u.estaSentado}
              />
            );
          })}
      </Canvas>

      <CustomizadorAvatar
        personalizacion={personalizacion}
        onCambiar={handleCambiarPersonalizacion}
        abierto={panelCustomizerAbierto}
        onToggle={() => setPanelCustomizerAbierto((v) => !v)}
      />

      {isAula && estaSentado && (
        <div
          style={{
            position: 'absolute',
            bottom: '36px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.88)',
            border: '1px solid rgba(56, 189, 248, 0.5)',
            color: '#f8fafc',
            padding: '10px 22px',
            borderRadius: '30px',
            fontSize: '0.95rem',
            fontWeight: 600,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            zIndex: 1000,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>🪑 Sentado en la Silla</span>
          <span style={{ opacity: 0.7, fontSize: '0.85rem' }}>• Presiona [E] o [WASD] para levantarte</span>
        </div>
      )}
    </div>
  );
};

export default MetaversoCanvas;
