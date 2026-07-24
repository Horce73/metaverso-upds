import React, { useRef } from 'react';
import * as THREE from 'three';

interface DoorProps {
  position?: [number, number, number];
}

export const Door: React.FC<DoorProps> = ({ position = [0, 0, -5] }) => {
  const ref = useRef<THREE.Group>(null);

  return (
    <group ref={ref} position={position}>
      <mesh castShadow position={[0, 1.25, 0]}>
        <boxGeometry args={[1.2, 2.5, 0.15]} />
        <meshStandardMaterial color="#8b5a2b" />
      </mesh>
      {/* Marco */}
      <mesh position={[0, 1.25, 0.1]}>
        <ringGeometry args={[0, 0.05, 4]} />
        <meshStandardMaterial color="#4a2f18" />
      </mesh>
    </group>
  );
};

export default Door;
