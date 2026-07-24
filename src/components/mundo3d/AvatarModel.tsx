import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useKeyboardControls } from './useKeyboardControls.js';
import { crearTexturaTexto } from './texto3d.js';

const VELOCIDAD = 4;
const ROTACION_LERP = 10;
const FRECUENCIA_CAMINAR = 9;
const AMPLITUD_CAMINAR = 0.6;

export interface PersonalizacionAvatar {
  colorRopa: string;
  colorPiel: string;
  escala: number;
  accesorios: {
    sombrero?: boolean;
    gafas?: boolean;
    mochila?: boolean;
  };
}

export const PERSONALIZACION_POR_DEFECTO: PersonalizacionAvatar = {
  colorRopa: '#3498db',
  colorPiel: '#e0ac69',
  escala: 1,
  accesorios: { sombrero: false, gafas: false, mochila: false },
};

interface AvatarModelProps {
  nombre: string;
  personalizacion?: PersonalizacionAvatar;
  position?: [number, number, number];
  rotation?: [number, number, number];
  isLocal?: boolean;
  onUpdatePosicion?: (posicion: THREE.Vector3, angulo: number) => void;
}

export const AvatarModel: React.FC<AvatarModelProps> = ({
  nombre,
  personalizacion = PERSONALIZACION_POR_DEFECTO,
  position = [0, 0, 5],
  rotation = [0, 0, 0],
  isLocal = false,
  onUpdatePosicion,
}) => {
  const grupoRef = useRef<THREE.Group>(null);
  const controles = useKeyboardControls();
  const { camera } = useThree();
  const direccionActual = useRef(new THREE.Vector3(0, 0, -1));
  const tiempoAnimRef = useRef(0);

  const forwardCamara = useRef(new THREE.Vector3());
  const rightCamara = useRef(new THREE.Vector3());

  const brazoIzqRef = useRef<THREE.Group>(null);
  const brazoDerRef = useRef<THREE.Group>(null);
  const piernaIzqRef = useRef<THREE.Group>(null);
  const piernaDerRef = useRef<THREE.Group>(null);

  const { colorRopa, colorPiel, escala, accesorios } = personalizacion;

  useFrame((_state, delta) => {
    if (!grupoRef.current) return;

    if (isLocal) {
      const { adelante, atras, izquierda, derecha } = controles.current;

      const entradaAdelante = (adelante ? 1 : 0) - (atras ? 1 : 0);
      const entradaLateral = (derecha ? 1 : 0) - (izquierda ? 1 : 0);

      const mover = new THREE.Vector3();
      const estaCaminando = entradaAdelante !== 0 || entradaLateral !== 0;

      if (estaCaminando) {
        camera.getWorldDirection(forwardCamara.current);
        forwardCamara.current.y = 0;
        forwardCamara.current.normalize();

        rightCamara.current.set(-forwardCamara.current.z, 0, forwardCamara.current.x);

        mover
          .addScaledVector(forwardCamara.current, entradaAdelante)
          .addScaledVector(rightCamara.current, entradaLateral)
          .normalize()
          .multiplyScalar(VELOCIDAD * delta);

        grupoRef.current.position.add(mover);

        direccionActual.current.lerp(mover.clone().normalize(), 0.3);
        const angulo = Math.atan2(direccionActual.current.x, direccionActual.current.z);
        grupoRef.current.rotation.y = THREE.MathUtils.lerp(
          grupoRef.current.rotation.y,
          angulo,
          Math.min(1, delta * ROTACION_LERP)
        );

        tiempoAnimRef.current += delta;
      }

      const objetivoSwing = estaCaminando
        ? Math.sin(tiempoAnimRef.current * FRECUENCIA_CAMINAR) * AMPLITUD_CAMINAR
        : 0;
      const suavizado = Math.min(1, delta * 12);

      if (brazoDerRef.current) {
        brazoDerRef.current.rotation.x = THREE.MathUtils.lerp(brazoDerRef.current.rotation.x, objetivoSwing, suavizado);
      }
      if (brazoIzqRef.current) {
        brazoIzqRef.current.rotation.x = THREE.MathUtils.lerp(brazoIzqRef.current.rotation.x, -objetivoSwing, suavizado);
      }
      if (piernaDerRef.current) {
        piernaDerRef.current.rotation.x = THREE.MathUtils.lerp(piernaDerRef.current.rotation.x, -objetivoSwing, suavizado);
      }
      if (piernaIzqRef.current) {
        piernaIzqRef.current.rotation.x = THREE.MathUtils.lerp(piernaIzqRef.current.rotation.x, objetivoSwing, suavizado);
      }

      onUpdatePosicion?.(grupoRef.current.position, grupoRef.current.rotation.y);
    } else {
      // Para usuarios remotos, animar suavemente hacia la posición y rotación recibidas
      grupoRef.current.position.lerp(new THREE.Vector3(...position), 0.2);
      grupoRef.current.rotation.y = THREE.MathUtils.lerp(grupoRef.current.rotation.y, rotation[1] || 0, 0.2);
    }
  });

  return (
    <group ref={grupoRef} position={position} rotation={rotation}>
      <group scale={escala}>
        {/* Piernas */}
        <group ref={piernaDerRef} position={[-0.16, 0.9, 0]}>
          <mesh castShadow position={[0, -0.4, 0]}>
            <boxGeometry args={[0.22, 0.8, 0.24]} />
            <meshStandardMaterial color="#2c3e50" />
          </mesh>
          <mesh castShadow position={[0, -0.85, 0.05]}>
            <boxGeometry args={[0.24, 0.12, 0.32]} />
            <meshStandardMaterial color="#1b1b1b" />
          </mesh>
        </group>
        <group ref={piernaIzqRef} position={[0.16, 0.9, 0]}>
          <mesh castShadow position={[0, -0.4, 0]}>
            <boxGeometry args={[0.22, 0.8, 0.24]} />
            <meshStandardMaterial color="#2c3e50" />
          </mesh>
          <mesh castShadow position={[0, -0.85, 0.05]}>
            <boxGeometry args={[0.24, 0.12, 0.32]} />
            <meshStandardMaterial color="#1b1b1b" />
          </mesh>
        </group>

        {/* Torso */}
        <mesh castShadow position={[0, 1.35, 0]}>
          <boxGeometry args={[0.55, 0.7, 0.32]} />
          <meshStandardMaterial color={colorRopa || '#3498db'} />
        </mesh>

        {/* Brazos */}
        <group ref={brazoDerRef} position={[-0.38, 1.65, 0]}>
          <mesh castShadow position={[0, -0.35, 0]}>
            <boxGeometry args={[0.18, 0.7, 0.18]} />
            <meshStandardMaterial color={colorRopa || '#3498db'} />
          </mesh>
          <mesh castShadow position={[0, -0.72, 0]}>
            <sphereGeometry args={[0.1, 10, 10]} />
            <meshStandardMaterial color={colorPiel || '#e0ac69'} />
          </mesh>
        </group>
        <group ref={brazoIzqRef} position={[0.38, 1.65, 0]}>
          <mesh castShadow position={[0, -0.35, 0]}>
            <boxGeometry args={[0.18, 0.7, 0.18]} />
            <meshStandardMaterial color={colorRopa || '#3498db'} />
          </mesh>
          <mesh castShadow position={[0, -0.72, 0]}>
            <sphereGeometry args={[0.1, 10, 10]} />
            <meshStandardMaterial color={colorPiel || '#e0ac69'} />
          </mesh>
        </group>

        {/* Cabeza */}
        <mesh castShadow position={[0, 2.05, 0]}>
          <sphereGeometry args={[0.26, 20, 20]} />
          <meshStandardMaterial color={colorPiel || '#e0ac69'} />
        </mesh>
        {/* Cabello simple */}
        <mesh castShadow position={[0, 2.18, -0.02]}>
          <sphereGeometry args={[0.27, 20, 20, 0, Math.PI * 2, 0, Math.PI / 1.7]} />
          <meshStandardMaterial color="#2b1d12" />
        </mesh>

        {accesorios?.sombrero && <Sombrero />}
        {accesorios?.gafas && <Gafas />}
        {accesorios?.mochila && <Mochila color={oscurecer(colorRopa || '#3498db')} />}
      </group>

      <Etiqueta nombre={nombre} />
    </group>
  );
};

function Sombrero() {
  return (
    <group position={[0, 2.42, 0]}>
      <mesh castShadow>
        <coneGeometry args={[0.3, 0.36, 16]} />
        <meshStandardMaterial color="#7a3b12" />
      </mesh>
      <mesh position={[0, -0.16, 0]} castShadow>
        <cylinderGeometry args={[0.4, 0.4, 0.06, 16]} />
        <meshStandardMaterial color="#7a3b12" />
      </mesh>
    </group>
  );
}

function Gafas() {
  return (
    <mesh castShadow position={[0, 2.07, 0.24]}>
      <boxGeometry args={[0.42, 0.1, 0.05]} />
      <meshStandardMaterial color="#111111" />
    </mesh>
  );
}

function Mochila({ color }: { color: THREE.Color }) {
  return (
    <mesh castShadow position={[0, 1.4, -0.24]}>
      <boxGeometry args={[0.4, 0.5, 0.2]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function oscurecer(hex: string): THREE.Color {
  const color = new THREE.Color(hex);
  color.multiplyScalar(0.6);
  return color;
}

function Etiqueta({ nombre }: { nombre: string }) {
  return (
    <sprite position={[0, 2.75, 0]} scale={[1.5, 0.4, 1]}>
      <spriteMaterial attach="material" map={crearTexturaTexto(nombre)} transparent />
    </sprite>
  );
}

export default AvatarModel;
