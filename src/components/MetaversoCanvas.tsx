import React, { useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { Socket } from 'socket.io-client';
import * as THREE from 'three';
import { Avatar3D } from './Avatar3D.js';
import { AudioClient } from './AudioClient.js';

interface MetaversoCanvasProps {
  socket: Socket;
  audioClient: AudioClient | null;
  isAula: boolean;
  localAvatar: any;
  remoteUsers: { [socketId: string]: any };
}

// Subcomponente de Controles de Movimiento y Cámara del Jugador Local
const PlayerController: React.FC<{
  socket: Socket;
  audioClient: AudioClient | null;
  isAula: boolean;
  localAvatar: any;
  onMove: (pos: [number, number, number], rot: [number, number, number]) => void;
}> = ({ socket, audioClient, isAula, localAvatar, onMove }) => {
  const { camera } = useThree();
  const positionRef = useRef<[number, number, number]>([0, 0, 0]);
  const rotationRef = useRef<[number, number, number]>([0, 0, 0]);
  
  // Teclas presionadas
  const keys = useRef({
    w: false,
    a: false,
    s: false,
    d: false
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') keys.current.w = true;
      if (k === 's' || k === 'arrowdown') keys.current.s = true;
      if (k === 'a' || k === 'arrowleft') keys.current.a = true;
      if (k === 'd' || k === 'arrowright') keys.current.d = true;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') keys.current.w = false;
      if (k === 's' || k === 'arrowdown') keys.current.s = false;
      if (k === 'a' || k === 'arrowleft') keys.current.a = false;
      if (k === 'd' || k === 'arrowright') keys.current.d = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Ubicar la cámara detrás del jugador inicialmente
    camera.position.set(0, 5, 8);
    camera.lookAt(0, 0, 0);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [camera]);

  // Actualizar movimiento cada frame (useFrame corre en el loop de R3F)
  useFrame((_state, delta) => {
    let moved = false;
    const speed = 5 * delta; // Velocidad del avatar
    const rotSpeed = 3 * delta; // Velocidad de rotación de la cámara/avatar

    const currentPos = [...positionRef.current] as [number, number, number];
    const currentRot = [...rotationRef.current] as [number, number, number];

    // Rotar dirección basándonos en la cámara
    if (keys.current.a) {
      currentRot[1] += rotSpeed;
      moved = true;
    }
    if (keys.current.d) {
      currentRot[1] -= rotSpeed;
      moved = true;
    }

    // Avanzar y retroceder en la dirección del ángulo
    if (keys.current.w) {
      currentPos[0] -= Math.sin(currentRot[1]) * speed;
      currentPos[2] -= Math.cos(currentRot[1]) * speed;
      moved = true;
    }
    if (keys.current.s) {
      currentPos[0] += Math.sin(currentRot[1]) * speed;
      currentPos[2] += Math.cos(currentRot[1]) * speed;
      moved = true;
    }

    // Límites del escenario para evitar caer al vacío (Colisión perimetral básica)
    const limit = isAula ? 18 : 45; // El aula es más chica que el campus
    if (currentPos[0] > limit) currentPos[0] = limit;
    if (currentPos[0] < -limit) currentPos[0] = -limit;
    if (currentPos[2] > limit) currentPos[2] = limit;
    if (currentPos[2] < -limit) currentPos[2] = -limit;

    if (moved) {
      positionRef.current = currentPos;
      rotationRef.current = currentRot;

      // Notificar al estado padre
      onMove(currentPos, currentRot);

      // Emitir al servidor mediante Sockets
      socket.emit('move', {
        position: currentPos,
        rotation: currentRot
      });

      // Actualizar posición del listener en el VoIP para el audio espacial
      if (audioClient) {
        audioClient.updateListenerPosition(currentPos, currentRot);
      }
    }

    // Hacer que la cámara siga al jugador local suavemente (Third Person Camera)
    const targetCamX = currentPos[0] + Math.sin(currentRot[1]) * 6;
    const targetCamY = currentPos[1] + 4;
    const targetCamZ = currentPos[2] + Math.cos(currentRot[1]) * 6;

    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetCamX, 0.1);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetCamY, 0.1);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetCamZ, 0.1);
    
    // Enfocar la cámara hacia el avatar del jugador
    camera.lookAt(currentPos[0], currentPos[1] + 1, currentPos[2]);
  });

  return (
    <Avatar3D
      position={positionRef.current}
      rotation={rotationRef.current}
      nombreVisible={localAvatar?.nombre_visible || 'Tú'}
      apariencia={localAvatar?.apariencia || {}}
      isLocal={true}
    />
  );
};

// Componente para renderizar el entorno 3D
const Escenario: React.FC<{ isAula: boolean }> = ({ isAula }) => {
  return (
    <group>
      {/* Luz Ambiental */}
      <ambientLight intensity={0.7} />
      
      {/* Luz Direccional que produce sombras */}
      <directionalLight
        position={[10, 20, 10]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />

      {/* Piso principal */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[isAula ? 40 : 100, isAula ? 40 : 100]} />
        <meshStandardMaterial color={isAula ? '#2b2d35' : '#14341c'} roughness={0.9} />
      </mesh>

      {/* Rejilla decorativa */}
      <gridHelper args={[isAula ? 40 : 100, isAula ? 20 : 50, '#5b82f6', '#26344d']} position={[0, 0.01, 0]} />

      {isAula ? (
        // ELEMENTOS DEL AULA VIRTUAL (Mesas, Sillas, Pizarrón)
        <group>
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

          {/* Paredes del Aula */}
          <mesh position={[0, 4, -20]} receiveShadow>
            <boxGeometry args={[40, 8, 0.5]} />
            <meshStandardMaterial color="#1e2028" />
          </mesh>
          <mesh position={[-20, 4, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
            <boxGeometry args={[40, 8, 0.5]} />
            <meshStandardMaterial color="#1e2028" />
          </mesh>
          <mesh position={[20, 4, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
            <boxGeometry args={[40, 8, 0.5]} />
            <meshStandardMaterial color="#1e2028" />
          </mesh>
        </group>
      ) : (
        // ELEMENTOS DEL CAMPUS CENTRAL
        <group>
          {/* Edificio de la Facultad (Bloque Central) */}
          <mesh position={[0, 8, -35]} castShadow receiveShadow>
            <boxGeometry args={[30, 16, 12]} />
            <meshStandardMaterial color="#0f172a" roughness={0.3} />
          </mesh>
          {/* Letrero UPDS */}
          <mesh position={[0, 14, -28.9]}>
            <boxGeometry args={[8, 2, 0.2]} />
            <meshStandardMaterial color="#123bb6" />
          </mesh>

          {/* Árboles abstractos (Tronco + Esfera) */}
          {[-25, -15, 15, 25].map((x) => 
            [-20, 0, 20].map((z) => (
              <group key={`arbol-${x}-${z}`} position={[x, 0, z]}>
                <mesh position={[0, 1.5, 0]} castShadow>
                  <cylinderGeometry args={[0.2, 0.3, 3, 8]} />
                  <meshStandardMaterial color="#78350f" />
                </mesh>
                <mesh position={[0, 3.5, 0]} castShadow>
                  <sphereGeometry args={[1.5, 16, 16]} />
                  <meshStandardMaterial color="#065f46" roughness={0.8} />
                </mesh>
              </group>
            ))
          )}
        </group>
      )}
    </group>
  );
};

export const MetaversoCanvas: React.FC<MetaversoCanvasProps> = ({
  socket,
  audioClient,
  isAula,
  localAvatar,
  remoteUsers
}) => {
  // Actualizar posiciones de VoIP de otros usuarios a medida que se mueven en 3D
  const handleLocalMove = (_pos: [number, number, number], _rot: [number, number, number]) => {
    // Espacio para lógica adicional si se requiere
  };

  useEffect(() => {
    // Sincronizar las posiciones de audio en el cliente VoIP
    if (audioClient) {
      Object.keys(remoteUsers).forEach((socketId) => {
        const user = remoteUsers[socketId];
        if (user.peerId) {
          audioClient.updateSourcePosition(user.peerId, user.position);
        }
      });
    }
  }, [remoteUsers, audioClient]);

  return (
    <div className="canvas-container">
      <Canvas shadows>
        {/* Fondo del cielo estrellado premium */}
        <color attach="background" args={['#050508']} />
        <Stars radius={100} depth={50} count={2000} factor={4} saturation={0} fade speed={1} />

        {/* Escenario 3D */}
        <Escenario isAula={isAula} />

        {/* Controlador del Jugador Local */}
        <PlayerController
          socket={socket}
          audioClient={audioClient}
          isAula={isAula}
          localAvatar={localAvatar}
          onMove={handleLocalMove}
        />

        {/* Renderizado de los demás Avatares en la escena */}
        {Object.keys(remoteUsers).map((socketId) => {
          const u = remoteUsers[socketId];
          return (
            <Avatar3D
              key={socketId}
              position={u.position}
              rotation={u.rotation}
              nombreVisible={u.nombreVisible}
              apariencia={u.apariencia}
              isLocal={false}
            />
          );
        })}

        {/* Controles para rotar la cámara libremente si se desea (deshabilitado el paneo para mantener el foco en tercera persona) */}
        <OrbitControls
          enableZoom={true}
          enablePan={false}
          maxPolarAngle={Math.PI / 2.1} // Evitar pasar por debajo del suelo
          minDistance={3}
          maxDistance={25}
        />
      </Canvas>
    </div>
  );
};
