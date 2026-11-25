import React from 'react';
import { Bloque, Piso, TechoDosAguas, type Cara } from './piezas.js';
import { textura } from './texturasCampus.js';
import { NIVEL_BLOQUE, NIVEL_ESPARCIMIENTO, NIVEL_PATIO, type PlanoCampus, type Rect } from './planoCampus.js';

const X_INICIO_CALLE = -60;

// Lo que rodea a la universidad (CAMPUS-01): la calle con sus veredas,
// árboles, faroles y vehículos estacionados; las casas coloniales de
// enfrente y de los costados y los cerros de Sucre a lo lejos. Y lo que se
// mueve poco dentro (CAMPUS-04): la fuente y los árboles del patio, las mesas
// de la cafetería y la cancha sobre el auditorio. Estilo low-poly: pocas
// caras y sombreado plano.

const Arbol: React.FC<{ x: number; z: number; escala?: number }> = ({ x, z, escala = 1 }) => (
  <group position={[x, 0, z]} scale={escala}>
    <mesh position={[0, 1.3, 0]} castShadow>
      <cylinderGeometry args={[0.14, 0.2, 2.6, 6]} />
      <meshStandardMaterial color="#6b4a2f" flatShading />
    </mesh>
    <mesh position={[0, 3.3, 0]} castShadow>
      <icosahedronGeometry args={[1.5, 0]} />
      <meshStandardMaterial color="#5b8c3e" flatShading />
    </mesh>
    <mesh position={[0.6, 2.8, 0.3]} castShadow>
      <icosahedronGeometry args={[1.0, 0]} />
      <meshStandardMaterial color="#4c7a33" flatShading />
    </mesh>
    <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[0.55, 8]} />
      <meshStandardMaterial color="#5a4632" />
    </mesh>
  </group>
);

const Farol: React.FC<{ x: number; z: number }> = ({ x, z }) => (
  <group position={[x, 0, z]}>
    <mesh position={[0, 3, 0]} castShadow>
      <cylinderGeometry args={[0.07, 0.1, 6, 6]} />
      <meshStandardMaterial color="#9ca3af" />
    </mesh>
    <mesh position={[0, 6, -0.5]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.05, 0.05, 1, 6]} />
      <meshStandardMaterial color="#9ca3af" />
    </mesh>
    <mesh position={[0, 5.9, -1]}>
      <boxGeometry args={[0.35, 0.12, 0.6]} />
      <meshStandardMaterial color="#f8fafc" emissive="#fff7d6" emissiveIntensity={0.6} />
    </mesh>
  </group>
);

const COLORES_AUTO = ['#1d4ed8', '#e5e7eb', '#b91c1c', '#374151'];

const Auto: React.FC<{ x: number; z: number; color: string }> = ({ x, z, color }) => (
  <group position={[x, 0, z]}>
    <Bloque x={[-2.1, 2.1]} y={[0.35, 1.05]} z={[-0.85, 0.85]} todas={{ color, rugosidad: 0.35, metalicidad: 0.4 }} />
    <Bloque x={[-1.1, 1.2]} y={[1.05, 1.6]} z={[-0.75, 0.75]} todas={{ color: '#1f2937', rugosidad: 0.1, metalicidad: 0.6 }} />
    {[-1.35, 1.35].flatMap((wx) =>
      [-0.85, 0.85].map((wz) => (
        <mesh key={`${wx}:${wz}`} position={[wx, 0.35, wz]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.35, 0.35, 0.25, 10]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
      ))
    )}
  </group>
);

const Moto: React.FC<{ x: number; z: number; color: string }> = ({ x, z, color }) => (
  <group position={[x, 0, z]} rotation={[0, Math.PI / 2 - 0.35, 0]}>
    <Bloque x={[-0.12, 0.12]} y={[0.45, 0.85]} z={[-0.5, 0.5]} todas={{ color, rugosidad: 0.4, metalicidad: 0.3 }} />
    <Bloque x={[-0.13, 0.13]} y={[0.85, 0.95]} z={[-0.45, 0.1]} todas={{ color: '#111827' }} />
    {[-0.6, 0.6].map((wz) => (
      <mesh key={wz} position={[0, 0.32, wz]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.32, 0.32, 0.12, 10]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
    ))}
  </group>
);

/** Casa colonial: muro blanco con ventanas de madera y techo de teja. */
const Casa: React.FC<{ x: [number, number]; z: [number, number]; alto: number; color?: string; frenteHacia: 1 | -1 }> = ({
  x,
  z,
  alto,
  color = '#ffffff',
  frenteHacia,
}) => {
  const muro = { textura: 'casaColonial' as const, modulo: [7, 7] as [number, number], color };
  return (
    <group>
      <Bloque x={x} y={[0, alto]} z={z} todas={{ color: '#ece6da' }} frente={frenteHacia === 1 ? muro : undefined} fondo={frenteHacia === -1 ? muro : undefined} pared />
      <Bloque x={[x[0] - 0.15, x[1] + 0.15]} y={[alto, alto + 0.2]} z={[z[0] - 0.2, z[1] + 0.2]} todas={{ color: '#f4f1ea' }} />
      <TechoDosAguas x={x} z={z} y={alto + 0.2} alto={2.2} />
    </group>
  );
};

/** Cerros alrededor de la ciudad, a lo lejos: conos achatados con niebla encima. */
const Cerros: React.FC = () => {
  const cerros = React.useMemo(() => {
    const lista: { x: number; z: number; r: number; h: number; color: string }[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + (i % 3) * 0.13;
      const d = 170 + (i % 4) * 25;
      lista.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r: 45 + (i % 5) * 10, h: 28 + (i % 3) * 16, color: i % 2 ? '#7b8f55' : '#8d8a5c' });
    }
    return lista;
  }, []);
  return (
    <group>
      {cerros.map((c, i) => (
        <mesh key={i} position={[c.x, c.h / 2 - 2, c.z]}>
          <coneGeometry args={[c.r, c.h, 7]} />
          <meshStandardMaterial color={c.color} flatShading />
        </mesh>
      ))}
    </group>
  );
};

const Aro: React.FC<{ x: number; z: number; sentido: 1 | -1 }> = ({ x, z, sentido }) => (
  <group position={[x, 0, z]} rotation={[0, sentido === 1 ? Math.PI / 2 : -Math.PI / 2, 0]}>
    <mesh position={[0, 1.6, -0.6]} castShadow>
      <cylinderGeometry args={[0.08, 0.08, 3.2, 8]} />
      <meshStandardMaterial color="#334155" />
    </mesh>
    <Bloque x={[-0.9, 0.9]} y={[2.9, 3.95]} z={[-0.45, -0.4]} todas={{ color: '#f8fafc' }} />
    <mesh position={[0, 3.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.23, 0.02, 6, 16]} />
      <meshStandardMaterial color="#ea580c" />
    </mesh>
  </group>
);

// Los muros de la cancha comparten color (también con la fuente y los rellenos del patio): un material menos
const MURO_CANCHA: Cara = { color: '#d8d4cb' };
const MACETERO: Cara = { color: '#8a4b2d' };
const MADERA_MESA: Cara = { color: '#8b6a4a', rugosidad: 0.6 };
const SILLA: Cara = { color: '#3a3f46' };
const ALTO_MALLA = 2.6;

/** Cancha en el techo del auditorio, girada con él: piso, muros del lindero y de las puntas, y aros. */
const Cancha: React.FC<{ c: Rect }> = ({ c }) => {
  const l = (c.x1 - c.x0) / 2;
  const a = (c.z1 - c.z0) / 2;
  const y = NIVEL_ESPARCIMIENTO;
  return (
    <group position={[(c.x0 + c.x1) / 2, 0, (c.z0 + c.z1) / 2]} rotation={[0, c.giro ?? 0, 0]}>
      <Piso x={[-l, l]} z={[-a, a]} y={y + 0.02} cara={{ mapa: textura('cancha') }} />
      {/* Del lado del lindero (z propio negativo) y en las dos puntas; hacia el área de esparcimiento queda abierta */}
      <Bloque x={[-l, l]} y={[y, y + ALTO_MALLA]} z={[-a - 0.3, -a]} todas={MURO_CANCHA} pared />
      <Bloque x={[-l - 0.3, -l]} y={[y, y + ALTO_MALLA]} z={[-a - 0.3, a]} todas={MURO_CANCHA} pared />
      <Bloque x={[l, l + 0.3]} y={[y, y + ALTO_MALLA]} z={[-a - 0.3, a]} todas={MURO_CANCHA} pared />
      <group position={[0, y, 0]}>
        <Aro x={-l + 1.2} z={0} sentido={1} />
        <Aro x={l - 1.2} z={0} sentido={-1} />
      </group>
    </group>
  );
};

/** Fuente de agua del patio: taza baja de piedra con el agua y un pilar al centro. */
const Fuente: React.FC<{ x: number; z: number; radio: number }> = ({ x, z, radio }) => (
  <group position={[x, NIVEL_PATIO, z]}>
    <mesh position={[0, 0.27, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[radio, radio + 0.05, 0.55, 20]} />
      <meshStandardMaterial color="#d8d4cb" roughness={0.85} />
    </mesh>
    <mesh position={[0, 0.5, 0]}>
      <cylinderGeometry args={[radio - 0.12, radio - 0.12, 0.06, 20]} />
      <meshStandardMaterial color="#4f9cc0" roughness={0.15} metalness={0.2} />
    </mesh>
    <mesh position={[0, 0.85, 0]} castShadow>
      <cylinderGeometry args={[0.12, 0.16, 0.8, 8]} />
      <meshStandardMaterial color="#d8d4cb" roughness={0.85} />
    </mesh>
    <mesh position={[0, 1.25, 0]} castShadow>
      <cylinderGeometry args={[0.4, 0.2, 0.15, 12]} />
      <meshStandardMaterial color="#d8d4cb" roughness={0.85} />
    </mesh>
  </group>
);

/** Mesa redonda de la cafetería con cuatro sillas. */
const Mesa: React.FC<{ x: number; z: number }> = ({ x, z }) => (
  <group position={[x, NIVEL_BLOQUE, z]}>
    <mesh position={[0, 0.74, 0]} castShadow>
      <cylinderGeometry args={[0.5, 0.5, 0.04, 16]} />
      <meshStandardMaterial color={MADERA_MESA.color} roughness={MADERA_MESA.rugosidad} />
    </mesh>
    <Bloque x={[-0.04, 0.04]} y={[0, 0.72]} z={[-0.04, 0.04]} todas={SILLA} sombra={false} />
    {[0, 1, 2, 3].map((i) => {
      const [sx, sz] = [Math.cos((i * Math.PI) / 2) * 0.75, Math.sin((i * Math.PI) / 2) * 0.75];
      return <Bloque key={i} x={[sx - 0.2, sx + 0.2]} y={[0.42, 0.46]} z={[sz - 0.2, sz + 0.2]} todas={SILLA} />;
    })}
  </group>
);

export const DecoradoCampus: React.FC<{ plano: PlanoCampus }> = ({ plano }) => {
  const { xFin, calleAncho, cancha, arboles, autos, motos, fuente, arbolesPatio, mesas } = plano;
  const xIni = X_INICIO_CALLE;
  const xFinCalle = xFin + 50;
  const zCalle0 = 3;
  const zCalle1 = 11;
  // Casas de enfrente en tramos de distinto ancho y alto
  const casasEnfrente = React.useMemo(() => {
    const lista: { x: [number, number]; alto: number; color: string }[] = [];
    const anchos = [12, 9, 14, 10, 13, 8, 11];
    const altos = [7, 10, 6.5, 9, 7.5, 11, 8];
    const colores = ['#ffffff', '#f6e7c8', '#ffffff', '#f3d9c4', '#fffaf0', '#e9eef2', '#ffffff'];
    let x = X_INICIO_CALLE;
    for (let i = 0; x < xFinCalle; i++) {
      const w = anchos[i % anchos.length];
      lista.push({ x: [x, x + w - 0.3], alto: altos[i % altos.length], color: colores[i % colores.length] });
      x += w;
    }
    return lista;
  }, [xFinCalle]);

  return (
    <group>
      {/* Terreno, calzada, veredas y línea central */}
      <Piso x={[-260, 260]} z={[-260, 260]} y={-0.01} cara={{ textura: 'pasto', modulo: [6, 6] }} />
      <Piso x={[xIni, xFinCalle]} z={[zCalle0, zCalle1]} y={0.01} cara={{ textura: 'asfalto', modulo: [4, 4] }} />
      <Piso x={[xIni, xFinCalle]} z={[0, zCalle0]} y={0.02} cara={{ textura: 'vereda', modulo: [2, 2] }} />
      <Piso x={[xIni, xFinCalle]} z={[zCalle1, calleAncho]} y={0.02} cara={{ textura: 'vereda', modulo: [2, 2] }} />
      <Bloque x={[xIni, xFinCalle]} y={[0, 0.12]} z={[zCalle0 - 0.15, zCalle0]} todas={{ color: '#d4d4d4' }} sombra={false} />
      <Bloque x={[xIni, xFinCalle]} y={[0, 0.12]} z={[zCalle1, zCalle1 + 0.15]} todas={{ color: '#d4d4d4' }} sombra={false} />
      {Array.from({ length: Math.floor((xFinCalle - xIni) / 6) }, (_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[xIni + 3 + i * 6, 0.025, (zCalle0 + zCalle1) / 2]}>
          <planeGeometry args={[2.6, 0.15]} />
          <meshBasicMaterial color="#f5f5f4" />
        </mesh>
      ))}

      {arboles.map(([x, z]) => (
        <Arbol key={x} x={x} z={z} escala={0.9 + ((x * 7) % 3) * 0.08} />
      ))}
      {[-26, -6, 12, xFin + 4].map((x) => (
        <Farol key={x} x={x} z={zCalle0 - 0.4} />
      ))}
      {autos.map(([x, z], i) => (
        <Auto key={x} x={x} z={z} color={COLORES_AUTO[i % COLORES_AUTO.length]} />
      ))}
      {motos.map(([x, z], i) => (
        <Moto key={x} x={x} z={z} color={['#dc2626', '#111827', '#2563eb', '#f8fafc'][i % 4]} />
      ))}

      {/* Casas de enfrente (frente hacia la calle, -z) y vecinas a los costados */}
      {casasEnfrente.map((c) => (
        <Casa key={c.x[0]} x={c.x} z={[calleAncho + 0.2, calleAncho + 10]} alto={c.alto} color={c.color} frenteHacia={-1} />
      ))}
      <Casa x={[-38, -24.2]} z={[-14, 0]} alto={11} frenteHacia={1} />
      {/* Del otro lado del lindero del oeste, que se va abriendo hacia el fondo */}
      <Casa x={[xFin + 0.5, xFin + 14]} z={[-4, 0]} alto={9} color="#f3d9c4" frenteHacia={1} />

      <Cancha c={cancha} />
      <Fuente {...fuente} />
      {arbolesPatio.map(([x, z]) => (
        <group key={`${x}:${z}`}>
          <Bloque x={[x - 0.6, x + 0.6]} y={[NIVEL_PATIO, NIVEL_PATIO + 0.5]} z={[z - 0.6, z + 0.6]} todas={MACETERO} pared />
          <group position={[0, NIVEL_PATIO + 0.5, 0]}>
            <Arbol x={x} z={z} escala={0.75} />
          </group>
        </group>
      ))}
      {mesas.map(([x, z]) => (
        <Mesa key={`${x}:${z}`} x={x} z={z} />
      ))}

      <Cerros />
    </group>
  );
};

