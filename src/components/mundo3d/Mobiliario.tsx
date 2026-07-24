import React from 'react';

export const Pupitre: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.45, 0]}>
        <boxGeometry args={[0.5, 0.06, 0.4]} />
        <meshStandardMaterial color="#8d6e4a" />
      </mesh>
      <mesh castShadow position={[0, 0.22, 0]}>
        <boxGeometry args={[0.06, 0.44, 0.06]} />
        <meshStandardMaterial color="#333333" />
      </mesh>
      <mesh castShadow position={[0, 0.3, -0.16]}>
        <boxGeometry args={[0.42, 0.35, 0.05]} />
        <meshStandardMaterial color="#555555" />
      </mesh>
    </group>
  );
};

export const Pizarra: React.FC<{ position: [number, number, number]; rotation?: [number, number, number] }> = ({
  position,
  rotation = [0, 0, 0],
}) => {
  return (
    <mesh position={position} rotation={rotation} castShadow>
      <boxGeometry args={[2.6, 1.1, 0.06]} />
      <meshStandardMaterial color="#1b3a2f" />
    </mesh>
  );
};

export const EscritorioProfesor: React.FC<{ position: [number, number, number]; rotation?: [number, number, number] }> = ({
  position,
  rotation = [0, 0, 0],
}) => {
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow position={[0, 0.4, 0]}>
        <boxGeometry args={[1.3, 0.08, 0.6]} />
        <meshStandardMaterial color="#6b4a2f" />
      </mesh>
      <mesh castShadow position={[-0.55, 0.2, 0]}>
        <boxGeometry args={[0.08, 0.4, 0.55]} />
        <meshStandardMaterial color="#4a2f18" />
      </mesh>
      <mesh castShadow position={[0.55, 0.2, 0]}>
        <boxGeometry args={[0.08, 0.4, 0.55]} />
        <meshStandardMaterial color="#4a2f18" />
      </mesh>
    </group>
  );
};

export const Sofa: React.FC<{ position: [number, number, number]; rotation?: [number, number, number]; color?: string }> = ({
  position,
  rotation = [0, 0, 0],
  color = '#c0392b',
}) => {
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow position={[0, 0.25, 0]}>
        <boxGeometry args={[1.6, 0.5, 0.6]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh castShadow position={[0, 0.6, -0.26]}>
        <boxGeometry args={[1.6, 0.5, 0.14]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
};

export const MesaRedonda: React.FC<{ position: [number, number, number]; color?: string }> = ({
  position,
  color = '#8d6e4a',
}) => {
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 0.06, 20]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh castShadow position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.4, 12]} />
        <meshStandardMaterial color="#333333" />
      </mesh>
    </group>
  );
};

export const MaquinaExpendedora: React.FC<{ position: [number, number, number]; rotation?: [number, number, number] }> = ({
  position,
  rotation = [0, 0, 0],
}) => {
  return (
    <mesh position={position} rotation={rotation} castShadow>
      <boxGeometry args={[0.8, 1.7, 0.6]} />
      <meshStandardMaterial color="#2980b9" />
    </mesh>
  );
};

export const EscritorioDecano: React.FC<{ position: [number, number, number]; rotation?: [number, number, number] }> = ({
  position,
  rotation = [0, 0, 0],
}) => {
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow position={[0, 0.45, 0]}>
        <boxGeometry args={[1.8, 0.08, 0.8]} />
        <meshStandardMaterial color="#3b2417" />
      </mesh>
      <mesh castShadow position={[-0.75, 0.22, 0]}>
        <boxGeometry args={[0.1, 0.45, 0.75]} />
        <meshStandardMaterial color="#2a1a10" />
      </mesh>
      <mesh castShadow position={[0.75, 0.22, 0]}>
        <boxGeometry args={[0.1, 0.45, 0.75]} />
        <meshStandardMaterial color="#2a1a10" />
      </mesh>
    </group>
  );
};

export const SillaOficina: React.FC<{ position: [number, number, number]; rotation?: [number, number, number] }> = ({
  position,
  rotation = [0, 0, 0],
}) => {
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow position={[0, 0.45, 0]}>
        <boxGeometry args={[0.45, 0.5, 0.08]} />
        <meshStandardMaterial color="#1b1b1b" />
      </mesh>
      <mesh castShadow position={[0, 0.2, 0.15]}>
        <boxGeometry args={[0.42, 0.06, 0.38]} />
        <meshStandardMaterial color="#1b1b1b" />
      </mesh>
      <mesh castShadow position={[0, 0.05, 0.15]}>
        <cylinderGeometry args={[0.04, 0.04, 0.1, 8]} />
        <meshStandardMaterial color="#444444" />
      </mesh>
    </group>
  );
};

export const Estanteria: React.FC<{ position: [number, number, number]; rotation?: [number, number, number] }> = ({
  position,
  rotation = [0, 0, 0],
}) => {
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow position={[0, 0.9, 0]}>
        <boxGeometry args={[1.6, 1.8, 0.3]} />
        <meshStandardMaterial color="#4a2f18" />
      </mesh>
      {[0.4, 0.9, 1.4].map((y) => (
        <mesh key={y} position={[0, y, 0.16]} castShadow>
          <boxGeometry args={[1.5, 0.04, 0.02]} />
          <meshStandardMaterial color="#2a1a10" />
        </mesh>
      ))}
    </group>
  );
};
