import React, { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';

export const Pupitre: React.FC<{ position: [number, number, number]; rotation?: [number, number, number] }> = ({
  position,
  rotation = [0, 0, 0],
}) => {
  return (
    <group position={position} rotation={rotation} scale={[2.2, 2.2, 2.2]}>
      {/* Mesa de Trabajo */}
      <mesh castShadow position={[0, 0.45, 0]}>
        <boxGeometry args={[0.55, 0.06, 0.42]} />
        <meshStandardMaterial color="#8d6e4a" roughness={0.4} />
      </mesh>
      {/* Patas metálicas */}
      <mesh castShadow position={[-0.22, 0.22, 0]}>
        <boxGeometry args={[0.05, 0.44, 0.35]} />
        <meshStandardMaterial color="#333333" metalness={0.5} />
      </mesh>
      <mesh castShadow position={[0.22, 0.22, 0]}>
        <boxGeometry args={[0.05, 0.44, 0.35]} />
        <meshStandardMaterial color="#333333" metalness={0.5} />
      </mesh>
      {/* Respaldo y Asiento de la Silla */}
      <mesh castShadow position={[0, 0.24, 0.3]}>
        <boxGeometry args={[0.44, 0.05, 0.38]} />
        <meshStandardMaterial color="#555555" />
      </mesh>
      <mesh castShadow position={[0, 0.45, 0.46]}>
        <boxGeometry args={[0.44, 0.35, 0.05]} />
        <meshStandardMaterial color="#555555" />
      </mesh>
    </group>
  );
};

type Vec3 = [number, number, number];

interface CajasInstanciadasProps {
  tamano: Vec3;
  /** Centro de cada caja, ya en las coordenadas del grupo padre. */
  posiciones: Vec3[];
  escala?: number;
  /** Color por instancia; si falta, todas usan el del material. */
  colores?: string[];
  children: React.ReactNode;
}

/**
 * Muchas cajas iguales en una sola llamada de dibujo (3D-02). Las aulas
 * repiten el mismo mueble decenas de veces: como mallas sueltas, cada pieza
 * de cada pupitre era una llamada de dibujo, y otra más por sombra.
 */
export const CajasInstanciadas: React.FC<CajasInstanciadasProps> = ({ tamano, posiciones, escala = 1, colores, children }) => {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const malla = ref.current;
    if (!malla) return;
    const matriz = new THREE.Matrix4();
    const rotacion = new THREE.Quaternion();
    const vectorEscala = new THREE.Vector3(escala, escala, escala);
    const color = new THREE.Color();
    posiciones.forEach((p, i) => {
      malla.setMatrixAt(i, matriz.compose(new THREE.Vector3(...p), rotacion, vectorEscala));
      if (colores) malla.setColorAt(i, color.set(colores[i % colores.length]));
    });
    malla.instanceMatrix.needsUpdate = true;
    if (malla.instanceColor) malla.instanceColor.needsUpdate = true;
    // Sin esto la esfera envolvente es la de una sola caja en el origen y la
    // cámara descarta (frustum culling) el grupo entero al no verla.
    malla.computeBoundingSphere();
  }, [posiciones, escala, colores]);

  return (
    <instancedMesh key={posiciones.length} ref={ref} args={[undefined, undefined, posiciones.length]} castShadow>
      <boxGeometry args={tamano} />
      {children}
    </instancedMesh>
  );
};

// Piezas del Pupitre de arriba, en sus coordenadas sin escalar.
const ESCALA_PUPITRE = 2.2;
const PIEZAS_PUPITRE: { tamano: Vec3; centros: Vec3[]; material: 'mesa' | 'pata' | 'silla' }[] = [
  { tamano: [0.55, 0.06, 0.42], centros: [[0, 0.45, 0]], material: 'mesa' },
  { tamano: [0.05, 0.44, 0.35], centros: [[-0.22, 0.22, 0], [0.22, 0.22, 0]], material: 'pata' },
  { tamano: [0.44, 0.05, 0.38], centros: [[0, 0.24, 0.3]], material: 'silla' },
  { tamano: [0.44, 0.35, 0.05], centros: [[0, 0.45, 0.46]], material: 'silla' },
];

/** Igual que varios <Pupitre> sin rotar, pero en cuatro llamadas de dibujo en total. */
export const PupitresInstanciados: React.FC<{ posiciones: Vec3[] }> = ({ posiciones }) => {
  const piezas = React.useMemo(
    () =>
      PIEZAS_PUPITRE.map((pieza) => ({
        ...pieza,
        posiciones: posiciones.flatMap(([x, y, z]) =>
          pieza.centros.map(([cx, cy, cz]): Vec3 => [x + cx * ESCALA_PUPITRE, y + cy * ESCALA_PUPITRE, z + cz * ESCALA_PUPITRE])
        ),
      })),
    [posiciones]
  );

  return (
    <group>
      {piezas.map((pieza, i) => (
        <CajasInstanciadas key={i} tamano={pieza.tamano} posiciones={pieza.posiciones} escala={ESCALA_PUPITRE}>
          {pieza.material === 'mesa' && <meshStandardMaterial color="#8d6e4a" roughness={0.4} />}
          {pieza.material === 'pata' && <meshStandardMaterial color="#333333" metalness={0.5} />}
          {pieza.material === 'silla' && <meshStandardMaterial color="#555555" />}
        </CajasInstanciadas>
      ))}
    </group>
  );
};

export const Pizarra: React.FC<{ position: [number, number, number]; rotation?: [number, number, number] }> = ({
  position,
  rotation = [0, 0, 0],
}) => {
  return (
    <mesh position={position} rotation={rotation} castShadow scale={[2.2, 2.2, 2.2]}>
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
    <group position={position} rotation={rotation} scale={[2.3, 2.3, 2.3]}>
      <mesh castShadow position={[0, 0.4, 0]}>
        <boxGeometry args={[1.4, 0.08, 0.7]} />
        <meshStandardMaterial color="#6b4a2f" roughness={0.3} />
      </mesh>
      <mesh castShadow position={[-0.6, 0.2, 0]}>
        <boxGeometry args={[0.1, 0.4, 0.65]} />
        <meshStandardMaterial color="#4a2f18" />
      </mesh>
      <mesh castShadow position={[0.6, 0.2, 0]}>
        <boxGeometry args={[0.1, 0.4, 0.65]} />
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
    <group position={position} rotation={rotation} scale={[2.0, 2.0, 2.0]}>
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
    <group position={position} scale={[2.2, 2.2, 2.2]}>
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
    <mesh position={position} rotation={rotation} castShadow scale={[2.2, 2.2, 2.2]}>
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
    <group position={position} rotation={rotation} scale={[2.3, 2.3, 2.3]}>
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
    <group position={position} rotation={rotation} scale={[2.2, 2.2, 2.2]}>
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
    <group position={position} rotation={rotation} scale={[2.2, 2.2, 2.2]}>
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
