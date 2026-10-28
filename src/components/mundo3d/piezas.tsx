import React from 'react';
import * as THREE from 'three';
import { textura, type NombreTextura } from './texturasCampus.js';

// Piezas de construcción del campus (CAMPUS-01): un bloque que se define por
// sus límites (como en el plano) con un material por cara, y el techo de teja
// a dos aguas. Los tamaños de módulo dicen cada cuántos metros se repite una
// textura, para que un muro de 30 m no estire una ventana pensada para 4,5 m.

export interface Cara {
  textura?: NombreTextura;
  /** Metros que ocupa una repetición de la textura: [ancho, alto]. */
  modulo?: [number, number];
  color?: string;
  emisivo?: string;
  intensidadEmisiva?: number;
  mapaEmisivo?: THREE.Texture;
  mapa?: THREE.Texture;
  rugosidad?: number;
  metalicidad?: number;
}

export interface BloqueProps {
  x: [number, number];
  y: [number, number];
  z: [number, number];
  /** Cara por defecto para las que no se especifican. */
  todas?: Cara;
  frente?: Cara; // +z
  fondo?: Cara; // -z
  derecha?: Cara; // +x
  izquierda?: Cara; // -x
  arriba?: Cara;
  pared?: boolean;
  sombra?: boolean;
}

const LISO: Cara = { color: '#e5e1d8' };

// Materiales compartidos: dos caras que se ven igual usan el mismo objeto.
// Además de ahorrar memoria y compilaciones, un bloque cuyas seis caras son
// iguales se dibuja con un solo material, en una llamada de dibujo en vez de
// seis (con un material por cara, three hace una llamada por cada grupo).
const materiales = new Map<string, THREE.MeshStandardMaterial>();

function materialDe(cara: Cara, ancho: number, alto: number): THREE.MeshStandardMaterial {
  const rx = cara.textura ? ancho / (cara.modulo?.[0] ?? ancho) : 1;
  const ry = cara.textura ? alto / (cara.modulo?.[1] ?? alto) : 1;
  const clave = [
    cara.mapa?.uuid ?? (cara.textura ? `${cara.textura}:${rx.toFixed(3)}:${ry.toFixed(3)}` : ''),
    cara.color ?? '#ffffff',
    cara.emisivo ?? '#000000',
    cara.intensidadEmisiva ?? 1,
    cara.mapaEmisivo?.uuid ?? '',
    cara.rugosidad ?? 0.85,
    cara.metalicidad ?? 0,
  ].join('|');
  let m = materiales.get(clave);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      map: cara.mapa ?? (cara.textura ? textura(cara.textura, rx, ry) : null),
      color: cara.color ?? '#ffffff',
      emissive: cara.emisivo ?? '#000000',
      emissiveMap: cara.mapaEmisivo ?? null,
      emissiveIntensity: cara.intensidadEmisiva ?? 1,
      roughness: cara.rugosidad ?? 0.85,
      metalness: cara.metalicidad ?? 0,
    });
    materiales.set(clave, m);
  }
  return m;
}

export const Bloque: React.FC<BloqueProps> = ({ x, y, z, todas = LISO, frente, fondo, derecha, izquierda, arriba, pared, sombra = true }) => {
  const w = x[1] - x[0];
  const h = y[1] - y[0];
  const d = z[1] - z[0];
  // Orden de caras de BoxGeometry: +x, -x, +y, -y, +z, -z
  const porCara = [
    materialDe(derecha ?? todas, d, h),
    materialDe(izquierda ?? todas, d, h),
    materialDe(arriba ?? todas, w, d),
    materialDe(todas, w, d),
    materialDe(frente ?? todas, w, h),
    materialDe(fondo ?? todas, w, h),
  ];
  const material = porCara.every((m) => m === porCara[0]) ? porCara[0] : porCara;
  return (
    <mesh
      position={[(x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2]}
      castShadow={sombra}
      receiveShadow
      material={material}
      userData={pared ? { esPared: true } : undefined}
    >
      <boxGeometry args={[w, h, d]} />
    </mesh>
  );
};

/** Piso texturado a ras del suelo (y apenas sobre 0 para no titilar con el terreno). */
export const Piso: React.FC<{ x: [number, number]; z: [number, number]; y?: number; cara: Cara }> = ({ x, z, y = 0.02, cara }) => {
  const w = x[1] - x[0];
  const d = z[1] - z[0];
  const mapa =
    cara.mapa ?? (cara.textura ? textura(cara.textura, w / (cara.modulo?.[0] ?? w), d / (cara.modulo?.[1] ?? d)) : undefined);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(x[0] + x[1]) / 2, y, (z[0] + z[1]) / 2]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial map={mapa} color={cara.color ?? '#ffffff'} roughness={cara.rugosidad ?? 0.9} />
    </mesh>
  );
};

/**
 * Techo a dos aguas a lo largo de x, sobre el rectángulo dado. La teja se
 * repite cada 4 m (las UV de ExtrudeGeometry van en las unidades del perfil).
 */
export const TechoDosAguas: React.FC<{ x: [number, number]; z: [number, number]; y: number; alto: number; alero?: number }> = ({
  x,
  z,
  y,
  alto,
  alero = 0.4,
}) => {
  const geometria = React.useMemo(() => {
    const prof = z[1] - z[0] + alero * 2;
    const perfil = new THREE.Shape();
    perfil.moveTo(-prof / 2, 0);
    perfil.lineTo(prof / 2, 0);
    perfil.lineTo(0, alto);
    perfil.closePath();
    const g = new THREE.ExtrudeGeometry(perfil, { depth: x[1] - x[0] + alero * 2, bevelEnabled: false });
    return g;
  }, [x, z, alto, alero]);
  React.useEffect(() => () => geometria.dispose(), [geometria]);
  const mapa = textura('teja', 0.25, 0.25);
  return (
    <mesh
      geometry={geometria}
      // El perfil está en (z, y) y se extruye por +z local: girado, la extrusión corre por +x
      position={[x[0] - alero, y, (z[0] + z[1]) / 2]}
      rotation={[0, Math.PI / 2, 0]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial map={mapa} roughness={0.8} flatShading />
    </mesh>
  );
};

/** Buhardilla: ventana a dos aguas que asoma del techo hacia la calle (o hacia `sentido`). */
export const Buhardilla: React.FC<{ x: number; z: number; y: number; sentido?: 1 | -1 }> = ({ x, z, y, sentido = 1 }) => {
  const frontal = React.useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-1.4, 0);
    s.lineTo(1.4, 0);
    s.lineTo(0, 1.6);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  }, []);
  React.useEffect(() => () => frontal.dispose(), [frontal]);
  return (
    <group position={[x, y, z]} rotation={[0, sentido === 1 ? 0 : Math.PI, 0]}>
      {/* Muro de la buhardilla */}
      <Bloque x={[-1.5, 1.5]} y={[0, 1.4]} z={[-2.4, 0]} todas={{ textura: 'terracota', modulo: [2, 2] }} frente={{ color: '#f4f1ea' }} />
      {/* Vidriado triangular con marco blanco */}
      <mesh geometry={frontal} position={[0, 1.4, 0.01]}>
        <meshStandardMaterial color="#f4f1ea" />
      </mesh>
      <mesh geometry={frontal} position={[0, 1.55, 0.03]} scale={[0.82, 0.78, 1]}>
        <meshStandardMaterial color="#26303d" roughness={0.2} metalness={0.4} />
      </mesh>
      <Bloque x={[-1.1, 1.1]} y={[0.25, 1.25]} z={[0.0, 0.04]} todas={{ color: '#26303d', rugosidad: 0.2, metalicidad: 0.4 }} sombra={false} />
      {/* Cumbrera perpendicular a la fachada: el techo (que corre por x) girado 90° */}
      <group rotation={[0, Math.PI / 2, 0]}>
        <TechoDosAguas x={[-0.2, 2.4]} z={[-1.55, 1.55]} y={1.4} alto={1.75} alero={0.15} />
      </group>
    </group>
  );
};
