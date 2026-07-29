import React, { type ReactNode } from 'react';
import * as THREE from 'three';
import { crearTexturaTexto } from './texto3d.js';

interface EdificioProps {
  posicion: [number, number, number];
  mirarHacia: [number, number, number];
  ancho?: number;
  profundidad?: number;
  alto?: number;
  colorPared?: string;
  colorTecho?: string;
  colorPiso?: string;
  nombre?: string;
  tieneClaseEnCurso?: boolean;
  temaClase?: string;
  docenteClase?: string;
  onInteractuar?: () => void;
  children?: ReactNode;
}

export const Edificio: React.FC<EdificioProps> = ({
  posicion,
  mirarHacia,
  ancho = 8,
  profundidad = 8,
  alto = 3.2,
  colorPared = '#e8dcc8',
  colorTecho = '#a34b3f',
  colorPiso = '#c9b78f',
  nombre,
  tieneClaseEnCurso = false,
  temaClase,
  docenteClase: _docenteClase,
  onInteractuar,
  children,
}) => {
  const dx = mirarHacia[0] - posicion[0];
  const dz = mirarHacia[2] - posicion[2];
  const rotacionY = Math.atan2(dx, dz);

  const espesor = 0.2;
  const textoEstado = tieneClaseEnCurso
    ? `🟢 CLASE EN CURSO: ${temaClase || 'Software'}`
    : '🔴 SIN CLASE ACTIVA';

  return (
    <group position={posicion} rotation={[0, rotacionY, 0]}>
      {/* Piso */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <planeGeometry args={[ancho, profundidad]} />
        <meshStandardMaterial color={colorPiso} />
      </mesh>

      {/* Pared trasera */}
      <mesh position={[0, alto / 2, -profundidad / 2]} castShadow receiveShadow userData={{ esPared: true }}>
        <boxGeometry args={[ancho, alto, espesor]} />
        <meshStandardMaterial color={colorPared} />
      </mesh>

      {/* Pared izquierda */}
      <mesh position={[-ancho / 2, alto / 2, 0]} castShadow receiveShadow userData={{ esPared: true }}>
        <boxGeometry args={[espesor, alto, profundidad]} />
        <meshStandardMaterial color={colorPared} />
      </mesh>

      {/* Pared derecha */}
      <mesh position={[ancho / 2, alto / 2, 0]} castShadow receiveShadow userData={{ esPared: true }}>
        <boxGeometry args={[espesor, alto, profundidad]} />
        <meshStandardMaterial color={colorPared} />
      </mesh>

      {/* Techo */}
      <mesh position={[0, alto + 0.1, 0]} castShadow>
        <boxGeometry args={[ancho + 0.4, 0.2, profundidad + 0.4]} />
        <meshStandardMaterial color={colorTecho} />
      </mesh>

      {/* Letrero con el nombre del edificio */}
      {nombre && (
        <sprite position={[0, alto + 0.9, profundidad / 2 + 0.3]} scale={[3.4, 0.85, 1]}>
          <spriteMaterial attach="material" map={crearTexturaTexto(nombre, { ancho: 500, alto: 120, fuente: 'bold 42px sans-serif' })} transparent />
        </sprite>
      )}

      {/* Indicador 3D de Estado de Clase en Vivo (Verde / Rojo) */}
      <sprite position={[0, alto + 0.3, profundidad / 2 + 0.3]} scale={[3.8, 0.6, 1]}>
        <spriteMaterial
          attach="material"
          map={crearTexturaTexto(textoEstado, {
            ancho: 600,
            alto: 100,
            fondo: tieneClaseEnCurso ? '#065f46' : '#991b1b',
            color: '#ffffff',
            fuente: 'bold 32px sans-serif',
          })}
          transparent
        />
      </sprite>

      {/* Luz de estado sobre la puerta */}
      <pointLight
        position={[0, alto - 0.2, profundidad / 2 + 0.5]}
        color={tieneClaseEnCurso ? '#10b981' : '#ef4444'}
        intensity={1.5}
        distance={4}
      />

      {/* Zona Interactivas / Botón Puerta de Ingreso al Aula */}
      {onInteractuar && (
        <group
          position={[0, 0.05, profundidad / 2 + 0.8]}
          onClick={(e) => {
            e.stopPropagation();
            onInteractuar();
          }}
        >
          {/* Anillo resplandeciente en el suelo */}
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.8, 1.4, 32]} />
            <meshBasicMaterial
              color={tieneClaseEnCurso ? '#34d399' : '#60a5fa'}
              side={THREE.DoubleSide}
              transparent
              opacity={0.7}
            />
          </mesh>

          {/* Prompt flotante para ingresar con la tecla E */}
          <sprite position={[0, 1.3, 0]} scale={[3.4, 0.7, 1]}>
            <spriteMaterial
              attach="material"
              map={crearTexturaTexto('🚪 Presiona [E] o Toca', {
                ancho: 450,
                alto: 100,
                fondo: '#1e293b',
                color: '#38bdf8',
                fuente: 'bold 34px sans-serif',
              })}
              transparent
            />
          </sprite>
        </group>
      )}

      {children}
    </group>
  );
};

export default Edificio;
