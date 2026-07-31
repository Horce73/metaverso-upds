import React from 'react';
import * as THREE from 'three';
import { Edificio } from './Edificio.js';
import {
  Pupitre,
  Pizarra,
  EscritorioProfesor,
  Sofa,
  MesaRedonda,
  MaquinaExpendedora,
  EscritorioDecano,
  SillaOficina,
  Estanteria,
} from './Mobiliario.js';
import { crearTexturaTexto } from './texto3d.js';

// Genera una grilla de pupitres (3 columnas x 3 filas) para las aulas
function generarPupitres(): [number, number, number][] {
  const pupitres: [number, number, number][] = [];
  for (let fila = 0; fila < 3; fila++) {
    for (let col = 0; col < 3; col++) {
      pupitres.push([col * 1.1 - 1.1, 0, fila * 1.1 - 0.8]);
    }
  }
  return pupitres;
}
const POSICIONES_PUPITRES = generarPupitres();

export interface AulaCampus {
  id: number | string;
  nombre: string;
  sesion_activa?: { tema?: string; docente?: string | null } | null;
}

interface CampusProps {
  aulas?: AulaCampus[];
  onInteractuarAula?: (aula: AulaCampus) => void;
}

// Distribuye las aulas en una grilla (4 por fila) sobre la Isla 2, empezando
// en la misma fila frontal que antes ocupaban las 2 aulas fijas (z=6) y
// avanzando hacia el fondo de la isla por cada fila adicional.
export const AULAS_POR_FILA = 4;
export const ESPACIADO_COLUMNA = 9;
export const ESPACIADO_FILA = 11;
export const Z_PRIMERA_FILA = 6;

export function posicionAula(indice: number): [number, number, number] {
  const columna = indice % AULAS_POR_FILA;
  const fila = Math.floor(indice / AULAS_POR_FILA);
  const x = (columna - (AULAS_POR_FILA - 1) / 2) * ESPACIADO_COLUMNA;
  const z = Z_PRIMERA_FILA - fila * ESPACIADO_FILA;
  return [x, 0, z];
}

export const Campus: React.FC<CampusProps> = ({ aulas = [], onInteractuarAula }) => {
  const filasDeAulas = Math.ceil(aulas.length / AULAS_POR_FILA);
  // Los edificios de servicio se ubican siempre después de la última fila de
  // aulas para que nunca se superpongan, sin importar cuántas aulas existan.
  const zEdificiosServicio = Z_PRIMERA_FILA - filasDeAulas * ESPACIADO_FILA - 8;

  return (
    <group>
      {/* 🏝️ 1. ISLA 1: PLAZA SOCIAL Y BIENVENIDA (Límites z: -1 a 15, x: -11 a 11) */}
      <group position={[0, 0, 7]}>
        {/* Base Rocosa 3D Flotante Bajo Isla 1 */}
        <mesh position={[0, -0.6, 0]} receiveShadow castShadow>
          <boxGeometry args={[22, 1.2, 16]} />
          <meshStandardMaterial color="#1e293b" roughness={0.9} />
        </mesh>
        <mesh position={[0, -2.0, 0]} receiveShadow castShadow>
          <boxGeometry args={[17, 1.8, 12]} />
          <meshStandardMaterial color="#0f172a" roughness={0.95} />
        </mesh>
        <mesh position={[0, -4.2, 0]} rotation={[Math.PI, 0, 0]} castShadow>
          <coneGeometry args={[5.5, 3.8, 6]} />
          <meshStandardMaterial color="#020617" roughness={1.0} />
        </mesh>

        {/* Césped Isla 1 */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
          <planeGeometry args={[21.6, 15.6]} />
          <meshStandardMaterial color="#166534" roughness={0.7} />
        </mesh>

        {/* Plaza Central de Mármol/Piedra */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} receiveShadow>
          <circleGeometry args={[6.2, 32]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.4} />
        </mesh>

        {/* Fuente Central de Agua Iluminada */}
        <FuenteAgua position={[0, 0.04, 0]} />

        {/* Zona Social de Sofás */}
        <Sofa position={[-4.2, 0.04, 2]} color="#0284c7" />
        <Sofa position={[4.2, 0.04, 2]} rotation={[0, Math.PI, 0]} color="#0d9488" />
        <MesaRedonda position={[-4.2, 0.04, 0]} />
        <MesaRedonda position={[4.2, 0.04, 0]} />

        {/* Árboles Decorativos Isla Social */}
        <ArbolEstilizado position={[-8, 0.04, -5]} />
        <ArbolEstilizado position={[8, 0.04, -5]} />
        <ArbolEstilizado position={[-8, 0.04, 5]} />
        <ArbolEstilizado position={[8, 0.04, 5]} />

        {/* Letrero de Bienvenida al Campus */}
        <sprite position={[0, 4.2, -4]} scale={[9, 1.8, 1]}>
          <spriteMaterial
            attach="material"
            map={crearTexturaTexto('🏫 Campus UPDS', { ancho: 1000, alto: 180, fuente: 'bold 64px sans-serif' })}
            transparent
          />
        </sprite>
      </group>

      {/* 🌉 2. PUENTE CONECTOR ALINEADO ENTRE ISLAS (z: -1 a -12) */}
      <PuenteConector />

      {/* 🎓 3. ISLA 2: ZONA ACADÉMICA Y AULAS (Límites z: -12 a -42, x: -19 a 19) */}
      <group position={[0, 0, -27]}>
        {/* Base Rocosa 3D Flotante Bajo Isla 2 */}
        <mesh position={[0, -0.6, 0]} receiveShadow castShadow>
          <boxGeometry args={[38, 1.2, 30]} />
          <meshStandardMaterial color="#1e293b" roughness={0.9} />
        </mesh>
        <mesh position={[0, -2.4, 0]} receiveShadow castShadow>
          <boxGeometry args={[30, 2.4, 23]} />
          <meshStandardMaterial color="#0f172a" roughness={0.95} />
        </mesh>
        <mesh position={[0, -5.5, 0]} rotation={[Math.PI, 0, 0]} castShadow>
          <coneGeometry args={[9.5, 5.2, 7]} />
          <meshStandardMaterial color="#020617" roughness={1.0} />
        </mesh>

        {/* Césped Isla 2 */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
          <planeGeometry args={[37.6, 29.6]} />
          <meshStandardMaterial color="#15803d" roughness={0.7} />
        </mesh>

        {/* Caminos de Adoquines hacia Edificios */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} receiveShadow>
          <planeGeometry args={[5, 26]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.5} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 6]} receiveShadow>
          <planeGeometry args={[28, 4.5]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.5} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, -10]} receiveShadow>
          <planeGeometry args={[28, 4.5]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.5} />
        </mesh>

        {/* Árboles Isla Académica */}
        <ArbolEstilizado position={[-16, 0.04, 12]} />
        <ArbolEstilizado position={[16, 0.04, 12]} />
        <ArbolEstilizado position={[-16, 0.04, -12]} />
        <ArbolEstilizado position={[16, 0.04, -12]} />

        {/* Edificios de Aula: uno por cada espacio tipo 'aula' que exista en este momento */}
        {aulas.map((aula, i) => {
          const posicion = posicionAula(i);
          return (
            <Edificio
              key={aula.id}
              posicion={posicion}
              mirarHacia={[0, 0, posicion[2]]}
              ancho={8}
              profundidad={8}
              nombre={aula.nombre}
              tieneClaseEnCurso={!!aula.sesion_activa}
              temaClase={aula.sesion_activa?.tema}
              docenteClase={aula.sesion_activa?.docente ?? undefined}
              onInteractuar={onInteractuarAula ? () => onInteractuarAula(aula) : undefined}
            >
              <Pizarra position={[0, 1.3, -3.8]} />
              <EscritorioProfesor position={[0, 0, -2.8]} />
              {POSICIONES_PUPITRES.map((pos, j) => (
                <Pupitre key={j} position={pos} />
              ))}
            </Edificio>
          );
        })}

        {/* Edificio: Sala de Descanso */}
        <Edificio
          posicion={[-12, 0, zEdificiosServicio]}
          mirarHacia={[0, 0, zEdificiosServicio]}
          ancho={8}
          profundidad={8}
          colorPared="#f1f5f9"
          colorTecho="#0f766e"
          nombre="Sala de Descanso"
        >
          <Sofa position={[-2.5, 0, -3]} color="#e11d48" />
          <Sofa position={[2.5, 0, -3]} rotation={[0, Math.PI, 0]} color="#2563eb" />
          <MesaRedonda position={[0, 0, -1.8]} />
          <MaquinaExpendedora position={[3.2, 0.85, 3]} />
        </Edificio>

        {/* Edificio: Sala de Decanos */}
        <Edificio
          posicion={[12, 0, zEdificiosServicio]}
          mirarHacia={[0, 0, zEdificiosServicio]}
          ancho={8}
          profundidad={8}
          colorPared="#e2e8f0"
          colorTecho="#7c2d12"
          colorPiso="#a16207"
          nombre="Sala de Decanos"
        >
          <EscritorioDecano position={[0, 0, -2.6]} />
          <SillaOficina position={[0, 0, -1.8]} rotation={[0, Math.PI, 0]} />
          <SillaOficina position={[-1.2, 0, -0.8]} />
          <SillaOficina position={[1.2, 0, -0.8]} />
          <Estanteria position={[0, 0, -3.6]} />
        </Edificio>
      </group>

      {/* 🌌 4. ISLOTES ROCOSOS MENORES DECORATIVOS EN EL VACÍO */}
      <IsloteDecorativo position={[-22, -3, 2]} escala={0.8} />
      <IsloteDecorativo position={[22, -4, -4]} escala={1.1} />
      <IsloteDecorativo position={[-28, -5, -30]} escala={1.3} />
      <IsloteDecorativo position={[28, -3, -24]} escala={0.9} />
    </group>
  );
};

// Componente del Puente Conector Alineado entre Isla 1 (z = -1) e Isla 2 (z = -12)
function PuenteConector() {
  return (
    <group position={[0, 0, -6.5]}>
      {/* Tablero Principal de Madera del Puente */}
      <mesh position={[0, 0.08, 0]} receiveShadow castShadow>
        <boxGeometry args={[4.2, 0.25, 11]} />
        <meshStandardMaterial color="#78350f" roughness={0.6} />
      </mesh>

      {/* Vigas de Soporte Estructural Bajo el Puente */}
      {[-4, 0, 4].map((zPos, i) => (
        <group key={i} position={[0, -1.0, zPos]}>
          <mesh position={[-1.9, 0, 0]} castShadow>
            <cylinderGeometry args={[0.18, 0.18, 2.2, 10]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
          <mesh position={[1.9, 0, 0]} castShadow>
            <cylinderGeometry args={[0.18, 0.18, 2.2, 10]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
        </group>
      ))}

      {/* Barandillas Laterales */}
      <mesh position={[-2.0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.1, 0.6, 11]} />
        <meshStandardMaterial color="#451a03" />
      </mesh>
      <mesh position={[2.0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.1, 0.6, 11]} />
        <meshStandardMaterial color="#451a03" />
      </mesh>

      {/* Farolas Iluminadas a lo largo del puente */}
      {[-4.5, 0, 4.5].map((zPos, idx) => (
        <group key={`farola-${idx}`} position={[0, 0, zPos]}>
          <Farola position={[-2.0, 0.8, 0]} />
          <Farola position={[2.0, 0.8, 0]} />
        </group>
      ))}
    </group>
  );
}

// Componente de Farola con luz cálida
function Farola({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow>
        <cylinderGeometry args={[0.04, 0.06, 1.2, 8]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      <mesh position={[0, 0.65, 0]}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshStandardMaterial color="#fef08a" emissive="#fef08a" emissiveIntensity={0.8} />
      </mesh>
      <pointLight position={[0, 0.65, 0]} intensity={0.6} distance={6} color="#fef08a" />
    </group>
  );
}

// Componente de Fuente de Agua (Estructura Monumental con Agua Elevada 3D)
function FuenteAgua({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* 1. Muro Hueco Exterior de Piedra (Pared de Contención del Estanque) */}
      <mesh castShadow receiveShadow position={[0, 0.3, 0]}>
        <cylinderGeometry args={[2.45, 2.65, 0.6, 48, 1, true]} />
        <meshStandardMaterial color="#475569" roughness={0.4} side={THREE.DoubleSide} />
      </mesh>

      {/* Borde redondeado superior del muro (Remate de Piedra) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.6, 0]} castShadow receiveShadow>
        <torusGeometry args={[2.45, 0.12, 16, 64]} />
        <meshStandardMaterial color="#64748b" roughness={0.4} />
      </mesh>

      {/* 2. Fondo Interior Oscuro del Estanque */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} receiveShadow>
        <circleGeometry args={[2.42, 48]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </mesh>

      {/* 3. Superficie de Agua Azul Cristalina Resplandeciente */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.54, 0]}>
        <circleGeometry args={[2.42, 64]} />
        <meshStandardMaterial
          color="#38bdf8"
          emissive="#0284c7"
          emissiveIntensity={0.5}
          roughness={0.05}
          metalness={0.2}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* 4. Pedestal Central Escalonado y Columna de Fuente */}
      <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.7, 0.85, 0.5, 32]} />
        <meshStandardMaterial color="#334155" roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.35, 0]} castShadow>
        <cylinderGeometry args={[0.38, 0.48, 0.8, 24]} />
        <meshStandardMaterial color="#1e293b" roughness={0.4} />
      </mesh>

      {/* 5. Cúspide Resplandeciente con Chorro de Agua */}
      <mesh position={[0, 1.9, 0]}>
        <sphereGeometry args={[0.35, 32, 32]} />
        <meshStandardMaterial color="#e0f2fe" emissive="#38bdf8" emissiveIntensity={0.95} transparent opacity={0.85} />
      </mesh>
      <pointLight position={[0, 1.9, 0]} intensity={0.8} distance={6} color="#38bdf8" />
    </group>
  );
}

// Árbol geométrico estilizado
function ArbolEstilizado({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Tronco */}
      <mesh castShadow position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.15, 0.25, 1.4, 8]} />
        <meshStandardMaterial color="#78350f" roughness={0.8} />
      </mesh>
      {/* Copa del Árbol (Niveles Cónicos) */}
      <mesh castShadow position={[0, 1.8, 0]}>
        <coneGeometry args={[1.2, 1.5, 7]} />
        <meshStandardMaterial color="#15803d" roughness={0.6} />
      </mesh>
      <mesh castShadow position={[0, 2.6, 0]}>
        <coneGeometry args={[0.9, 1.3, 7]} />
        <meshStandardMaterial color="#16a34a" roughness={0.6} />
      </mesh>
    </group>
  );
}

// Islote rocoso decorativo flotando en el vacío
function IsloteDecorativo({ position, escala = 1 }: { position: [number, number, number]; escala?: number }) {
  return (
    <group position={position} scale={escala}>
      <mesh position={[0, 0, 0]} receiveShadow castShadow>
        <boxGeometry args={[4, 1, 4]} />
        <meshStandardMaterial color="#334155" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI, 0, 0]} position={[0, -1.8, 0]} castShadow>
        <coneGeometry args={[2.2, 2.6, 5]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.51, 0]} receiveShadow>
        <planeGeometry args={[3.8, 3.8]} />
        <meshStandardMaterial color="#166534" roughness={0.7} />
      </mesh>
    </group>
  );
}

export default Campus;
