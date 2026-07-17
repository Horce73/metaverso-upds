import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

interface Avatar3DProps {
  position: [number, number, number];
  rotation: [number, number, number];
  nombreVisible: string;
  apariencia: {
    colorCabello?: string;
    colorCamisa?: string;
    colorPantalon?: string;
    escala?: number;
  };
  isLocal?: boolean;
}

export const Avatar3D: React.FC<Avatar3DProps> = ({
  position,
  rotation,
  nombreVisible,
  apariencia,
  isLocal = false
}) => {
  const groupRef = useRef<THREE.Group>(null);

  // Obtener colores de apariencia o valores por defecto
  const hairColor = apariencia?.colorCabello || '#2a1a0a';
  const shirtColor = apariencia?.colorCamisa || '#1a5ba8';
  const pantsColor = apariencia?.colorPantalon || '#333333';
  const scale = apariencia?.escala || 1.0;

  // Interpolar suavemente las posiciones de avatares remotos (Interpolation)
  useFrame(() => {
    if (!groupRef.current) return;

    if (!isLocal) {
      // Interpolar posición para avatares de otros usuarios (suaviza el lag de sockets)
      groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, position[0], 0.2);
      groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, position[1], 0.2);
      groupRef.current.position.z = THREE.MathUtils.lerp(groupRef.current.position.z, position[2], 0.2);

      // Interpolar rotación
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, rotation[1], 0.2);
    } else {
      // Para el avatar local, aplicamos posición directamente
      groupRef.current.position.set(position[0], position[1], position[2]);
      groupRef.current.rotation.y = rotation[1];
    }
  });

  return (
    <group ref={groupRef} scale={[scale, scale, scale]}>
      {/* 1. Nombre Flotante */}
      <Html distanceFactor={8} position={[0, 2.1, 0]} center>
        <div style={{
          background: isLocal ? 'rgba(18, 59, 182, 0.85)' : 'rgba(0,0,0,0.75)',
          color: 'white',
          padding: '2px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          fontWeight: 'bold',
          whiteSpace: 'nowrap',
          border: isLocal ? '1px solid #5b82f6' : '1px solid rgba(255,255,255,0.1)',
          pointerEvents: 'none'
        }}>
          {nombreVisible} {isLocal && ' (Tú)'}
        </div>
      </Html>

      {/* 2. Cabeza (Esfera) */}
      <mesh position={[0, 1.6, 0]} castShadow>
        <sphereGeometry args={[0.25, 32, 32]} />
        <meshStandardMaterial color="#fcd34d" roughness={0.6} /> {/* Tono piel */}
      </mesh>

      {/* 3. Cabello */}
      <mesh position={[0, 1.8, -0.05]} castShadow>
        <sphereGeometry args={[0.26, 16, 16]} />
        <meshStandardMaterial color={hairColor} roughness={0.8} />
      </mesh>

      {/* 4. Ojos (Detalle premium simple) */}
      <mesh position={[-0.08, 1.65, 0.2]} castShadow>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
      <mesh position={[0.08, 1.65, 0.2]} castShadow>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshStandardMaterial color="#000000" />
      </mesh>

      {/* 5. Tronco / Camisa (Cápsula) */}
      <mesh position={[0, 1.0, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.25, 0.8, 16]} />
        <meshStandardMaterial color={shirtColor} roughness={0.5} />
      </mesh>

      {/* 6. Extremidades inferiores / Pantalón (Cilindros) */}
      <mesh position={[-0.12, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.08, 0.7, 16]} />
        <meshStandardMaterial color={pantsColor} roughness={0.7} />
      </mesh>
      <mesh position={[0.12, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.08, 0.7, 16]} />
        <meshStandardMaterial color={pantsColor} roughness={0.7} />
      </mesh>
    </group>
  );
};
