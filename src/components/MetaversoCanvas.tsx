import React, { useRef, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { Socket } from 'socket.io-client';
import * as THREE from 'three';
import { AudioClient } from './AudioClient.js';

// Componentes 3D unificados
import { Campus } from './mundo3d/Campus.js';
import { CameraRig, type AvatarEstadoRef } from './mundo3d/CameraRig.js';
import { AvatarModel, type PersonalizacionAvatar, PERSONALIZACION_POR_DEFECTO } from './mundo3d/AvatarModel.js';
import { CustomizadorAvatar } from './mundo3d/CustomizadorAvatar.js';
import { Pupitre, EscritorioProfesor, Sofa, Estanteria } from './mundo3d/Mobiliario.js';
import { crearTexturaTexto } from './mundo3d/texto3d.js';

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
  onMove: (pos: [number, number, number], rot: [number, number, number]) => void;
}> = ({ socket, audioClient, localAvatar, personalizacion, avatarEstadoRef, isAula, estaSentado, onMove }) => {
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
      onUpdatePosicion={handleUpdatePosicion}
    />
  );
};

// Elementos del Aula Virtual (Arquitectura moderna luminosa, Ventanales, Mobiliario UPDS)
const EscenarioAula: React.FC = () => {
  return (
    <group>
      {/* 💡 Iluminación Cálida y Luminosa del Aula */}
      <ambientLight intensity={0.95} color="#ffffff" />
      <directionalLight
        position={[15, 25, 12]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[1024, 1024]}
        color="#fffbeb"
      />
      <directionalLight position={[-15, 15, -10]} intensity={0.6} color="#e0f2fe" />

      {/* 🛋️ Piso Parquet de Madera Cálida con Borde UPDS Azul */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#d97706" roughness={0.35} metalness={0.05} />
      </mesh>

      {/* Alfombra / Zócalo Central Elegante */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -2]} receiveShadow>
        <planeGeometry args={[30, 26]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -2]} receiveShadow>
        <planeGeometry args={[28, 24]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.4} />
      </mesh>

      {/* 📋 Pizarra Digital Interactiva 3D con Bisel de Neón */}
      <group position={[0, 3.2, -19.7]}>
        {/* Marco de madera noble */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[16.4, 6.4, 0.3]} />
          <meshStandardMaterial color="#3b2417" roughness={0.5} />
        </mesh>
        {/* Pantalla digital interactiva */}
        <mesh position={[0, 0, 0.16]}>
          <boxGeometry args={[15.8, 5.8, 0.05]} />
          <meshStandardMaterial color="#0f172a" roughness={0.2} emissive="#1e293b" />
        </mesh>
        {/* Título de la Pizarra UPDS */}
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

      {/* 👨‍🏫 Escritorio Moderno del Docente con Laptop 3D */}
      <group position={[0, 0, -13]}>
        <EscritorioProfesor position={[0, 0, 0]} />
        {/* Silla del Docente (Ajustada a escala humana) */}
        <mesh position={[0, 0.9, -1.8]} castShadow>
          <boxGeometry args={[1.2, 1.4, 0.15]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
        <mesh position={[0, 0.5, -1.2]} castShadow>
          <boxGeometry args={[1.2, 0.12, 1.1]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
        {/* Laptop 3D sobre la mesa */}
        <mesh position={[0.6, 0.94, 0.1]} castShadow>
          <boxGeometry args={[0.7, 0.03, 0.5]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.2} />
        </mesh>
        <mesh position={[0.6, 1.25, -0.15]} rotation={[-0.3, 0, 0]} castShadow>
          <boxGeometry args={[0.7, 0.5, 0.03]} />
          <meshStandardMaterial color="#0f172a" emissive="#3b82f6" emissiveIntensity={0.6} />
        </mesh>
      </group>

      {/* 🪑 Filas de Pupitres de Estudiantes Escalados (4 Columnas x 3 Filas = 12 Pupitres Espaciosos) */}
      {[-8.5, -3, 3, 8.5].map((x) =>
        [-5, 0, 5].map((z) => (
          <group key={`pupitre-${x}-${z}`} position={[x, 0, z]}>
            <Pupitre position={[0, 0, 0]} />
            {/* Pequeña notebook / cuaderno sobre la mesa del pupitre */}
            <mesh position={[0.1, 0.99, -0.05]} castShadow>
              <boxGeometry args={[0.4, 0.03, 0.45]} />
              <meshStandardMaterial color={(x + z) % 2 === 0 ? '#2563eb' : '#059669'} />
            </mesh>
          </group>
        ))
      )}

      {/* 🌿 Rincones Sociales y Libreros al fondo */}
      <Sofa position={[-16, 0, 12]} rotation={[0, Math.PI / 4, 0]} color="#0ea5e9" />
      <Sofa position={[16, 0, 12]} rotation={[0, -Math.PI / 4, 0]} color="#10b981" />
      <Estanteria position={[-18, 0, -10]} rotation={[0, Math.PI / 2, 0]} />
      <Estanteria position={[18, 0, -10]} rotation={[0, -Math.PI / 2, 0]} />

      {/* 🏢 Paredes Luminosas y Grandes Ventanales con Vistas al Campus */}
      {/* Pared Frontal */}
      <mesh position={[0, 4, -20]} receiveShadow userData={{ esPared: true }}>
        <boxGeometry args={[40, 8, 0.5]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
      </mesh>
      {/* Zócalo de Madera Frontal */}
      <mesh position={[0, 0.4, -19.7]}>
        <boxGeometry args={[40, 0.8, 0.1]} />
        <meshStandardMaterial color="#78350f" roughness={0.5} />
      </mesh>

      {/* Pared Izquierda con Ventanal Vidriado */}
      <mesh position={[-20, 1.5, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow userData={{ esPared: true }}>
        <boxGeometry args={[40, 3, 0.5]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
      </mesh>
      <mesh position={[-20, 7, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow userData={{ esPared: true }}>
        <boxGeometry args={[40, 2, 0.5]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
      </mesh>
      {/* Cristal Ventana Izquierda */}
      <mesh position={[-19.8, 4.5, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[36, 3]} />
        <meshStandardMaterial color="#38bdf8" transparent opacity={0.35} roughness={0.1} metalness={0.8} />
      </mesh>

      {/* Pared Derecha con Ventanal Vidriado */}
      <mesh position={[20, 1.5, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow userData={{ esPared: true }}>
        <boxGeometry args={[40, 3, 0.5]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
      </mesh>
      <mesh position={[20, 7, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow userData={{ esPared: true }}>
        <boxGeometry args={[40, 2, 0.5]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
      </mesh>
      {/* Cristal Ventana Derecha */}
      <mesh position={[19.8, 4.5, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[36, 3]} />
        <meshStandardMaterial color="#38bdf8" transparent opacity={0.35} roughness={0.1} metalness={0.8} />
      </mesh>

      {/* Pared Trasera */}
      <mesh position={[0, 4, 20]} rotation={[0, Math.PI, 0]} receiveShadow userData={{ esPared: true }}>
        <boxGeometry args={[40, 8, 0.5]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
      </mesh>

      {/* 💡 Luces Paneles LED de Techo (Warm Recessed Ceiling Lights) */}
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
  const [asientoCercano, setAsientoCercano] = useState<{ x: number; y: number; z: number; label: string } | null>(null);

  // Lista de todos los asientos interactivos en el aula (12 pupitres, escritorio docente, sofás)
  const ASIENTOS_AULA = React.useMemo(() => {
    const asientos: { x: number; y: number; z: number; label: string }[] = [];

    // 12 Pupitres de estudiantes (Posición exacta de la silla detrás del pupitre)
    const pupitresX = [-8.5, -3, 3, 8.5];
    const pupitresZ = [-5, 0, 5];
    for (const px of pupitresX) {
      for (const pz of pupitresZ) {
        asientos.push({ x: px, y: 0.1, z: pz + 0.95, label: '🪑 Pupitre' });
      }
    }

    // Escritorio del docente
    asientos.push({ x: 0, y: 0.1, z: -14.2, label: '👨‍🏫 Escritorio Docente' });

    // Sofás del fondo
    asientos.push({ x: -16, y: 0.1, z: 12, label: '🛋️ Sofá' });
    asientos.push({ x: 16, y: 0.1, z: 12, label: '🛋️ Sofá' });

    return asientos;
  }, []);

  // Verificar proximidad a asientos cuando se está en el aula
  useEffect(() => {
    if (!isAula) {
      setAsientoCercano(null);
      setEstaSentado(false);
      return;
    }

    const interval = setInterval(() => {
      const pos = avatarEstadoRef.current.posicion;
      if (!pos || estaSentado) return;

      let mejorAsiento: { x: number; y: number; z: number; label: string } | null = null;
      let minDist = 2.2; // Rango de interacción en metros

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

  // Manejo de la tecla [E] y Teclas de Movimiento para Sentarse / Levantarse
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }

      // Si está sentado y presiona cualquier tecla de movimiento (WASD / Flechas) o [E], se levanta
      if (estaSentado) {
        if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyE'].includes(e.code) || e.key === 'e' || e.key === 'E') {
          setEstaSentado(false);
          avatarEstadoRef.current.posicion.y = 0;
          return;
        }
      }

      // Si presiona [E] dentro del aula y está cerca de un asiento, se sienta
      if ((e.code === 'KeyE' || e.key === 'e' || e.key === 'E') && isAula && asientoCercano && !estaSentado) {
        setEstaSentado(true);
        avatarEstadoRef.current.posicion.set(asientoCercano.x, asientoCercano.y, asientoCercano.z);
        avatarEstadoRef.current.angulo = 0;
        return;
      }

      // Interacción normal con aula desde el campus
      if (e.code === 'KeyE' || e.key === 'e' || e.key === 'E') {
        if (isAula || !onInteractuarAula || !espacios || espacios.length === 0) return;

        const pos = avatarEstadoRef.current.posicion;
        if (!pos) return;

        const aulas = (espacios || []).filter((e) => e.tipo === 'aula');
        if (aulas.length === 0) return;

        const aula101 = aulas.find((e) => e.nombre?.includes('101') || e.nombre?.includes('Software')) || aulas[0];
        const aula102 = aulas.find((e) => e.nombre?.includes('102') || (aula101 && String(e.id) !== String(aula101.id))) || aulas[1] || aula101;

        const distAula101 = Math.hypot(pos.x - (-12), pos.z - (-21));
        const distAula102 = Math.hypot(pos.x - 12, pos.z - (-21));

        const MAX_DISTANCIA = 9.0;

        let aulaCercana: any = null;
        if (distAula101 < MAX_DISTANCIA && distAula101 <= distAula102) {
          aulaCercana = aula101;
        } else if (distAula102 < MAX_DISTANCIA) {
          aulaCercana = aula102;
        } else if (distAula101 < 14.0 || distAula102 < 14.0) {
          aulaCercana = distAula101 <= distAula102 ? aula101 : aula102;
        }

        if (aulaCercana) {
          onInteractuarAula(aulaCercana);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAula, estaSentado, asientoCercano, espacios, onInteractuarAula]);

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

        {/* Luces principales */}
        <ambientLight intensity={isAula ? 0.9 : 0.7} color="#ffffff" />
        <directionalLight
          position={[10, 20, 10]}
          intensity={1.3}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />

        {/* Escenario 3D */}
        {isAula ? (
          <EscenarioAula />
        ) : (
          <group>
            <Campus espacios={espacios} onInteractuarAula={onInteractuarAula} />
          </group>
        )}

        {/* Badge 3D de interacción para Sentarse cerca de un asiento */}
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

        {/* Controlador del Jugador Local */}
        <LocalPlayerController
          socket={socket}
          audioClient={audioClient}
          localAvatar={localAvatar}
          personalizacion={personalizacion}
          avatarEstadoRef={avatarEstadoRef}
          isAula={isAula}
          estaSentado={estaSentado}
          onMove={() => { }}
        />

        {/* Cámara en 3ra Persona con seguimiento suave y colisiones */}
        <CameraRig avatarEstadoRef={avatarEstadoRef} />

        {/* Renderizado de Avatares Remotos */}
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

      {/* UI Flotante de Personalización del Avatar */}
      <CustomizadorAvatar
        personalizacion={personalizacion}
        onCambiar={handleCambiarPersonalizacion}
        abierto={panelCustomizerAbierto}
        onToggle={() => setPanelCustomizerAbierto((v) => !v)}
      />

      {/* Banner flotante de información cuando el avatar está sentado */}
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
