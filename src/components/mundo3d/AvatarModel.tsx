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
  colorCabello?: string;
  estiloCabello?: 'corto' | 'largo' | 'tupe' | 'rizado' | 'bun' | 'calvo';
  expresionRostro?: 'alegre' | 'guiño' | 'serio' | 'sorprendido';
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
  colorCabello: '#2c1d11',
  estiloCabello: 'corto',
  expresionRostro: 'alegre',
  escala: 1,
  accesorios: { sombrero: false, gafas: false, mochila: false },
};

interface AvatarModelProps {
  nombre: string;
  personalizacion?: PersonalizacionAvatar;
  position?: [number, number, number];
  rotation?: [number, number, number];
  isLocal?: boolean;
  isAula?: boolean;
  estaSentado?: boolean;
  onUpdatePosicion?: (posicion: THREE.Vector3, angulo: number) => void;
}

export const AvatarModel: React.FC<AvatarModelProps> = ({
  nombre,
  personalizacion = PERSONALIZACION_POR_DEFECTO,
  position = [0, 0, 11],
  rotation = [0, 0, 0],
  isLocal = false,
  isAula = false,
  estaSentado = false,
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

  const {
    colorRopa = '#3498db',
    colorPiel = '#e0ac69',
    colorCabello = '#2c1d11',
    estiloCabello = 'corto',
    expresionRostro = 'alegre',
    escala = 1,
    accesorios,
  } = personalizacion;

  useFrame((_state, delta) => {
    if (!grupoRef.current) return;

    if (isLocal) {
      if (!estaSentado) {
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

          const posActual = grupoRef.current.position;
          const posDeseada = posActual.clone().add(mover);

          if (esPosicionValida(posDeseada, isAula)) {
            grupoRef.current.position.copy(posDeseada);
          } else {
            // Deslizamiento en colisiones (eje X e Z independientes)
            const posPruebaX = posActual.clone().add(new THREE.Vector3(mover.x, 0, 0));
            if (esPosicionValida(posPruebaX, isAula)) {
              grupoRef.current.position.copy(posPruebaX);
            } else {
              const posPruebaZ = posActual.clone().add(new THREE.Vector3(0, 0, mover.z));
              if (esPosicionValida(posPruebaZ, isAula)) {
                grupoRef.current.position.copy(posPruebaZ);
              }
            }
          }

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
      } else {
        // Postura Animada de Sentado
        const suavizadoSentado = Math.min(1, delta * 15);
        if (brazoDerRef.current) {
          brazoDerRef.current.rotation.x = THREE.MathUtils.lerp(brazoDerRef.current.rotation.x, -Math.PI / 4, suavizadoSentado);
        }
        if (brazoIzqRef.current) {
          brazoIzqRef.current.rotation.x = THREE.MathUtils.lerp(brazoIzqRef.current.rotation.x, -Math.PI / 4, suavizadoSentado);
        }
        if (piernaDerRef.current) {
          piernaDerRef.current.rotation.x = THREE.MathUtils.lerp(piernaDerRef.current.rotation.x, -Math.PI / 2.2, suavizadoSentado);
        }
        if (piernaIzqRef.current) {
          piernaIzqRef.current.rotation.x = THREE.MathUtils.lerp(piernaIzqRef.current.rotation.x, -Math.PI / 2.2, suavizadoSentado);
        }
      }

      onUpdatePosicion?.(grupoRef.current.position, grupoRef.current.rotation.y);
    } else {
      grupoRef.current.position.lerp(new THREE.Vector3(...position), 0.2);
      grupoRef.current.rotation.y = THREE.MathUtils.lerp(grupoRef.current.rotation.y, rotation[1] || 0, 0.2);

      if (estaSentado) {
        if (brazoDerRef.current) brazoDerRef.current.rotation.x = -Math.PI / 4;
        if (brazoIzqRef.current) brazoIzqRef.current.rotation.x = -Math.PI / 4;
        if (piernaDerRef.current) piernaDerRef.current.rotation.x = -Math.PI / 2.2;
        if (piernaIzqRef.current) piernaIzqRef.current.rotation.x = -Math.PI / 2.2;
      }
    }
  });

  return (
    <group ref={grupoRef} position={position} rotation={rotation}>
      <group scale={escala}>
        {/* Piernas y Calzado */}
        <group ref={piernaDerRef} position={[-0.14, 1.05, 0]}>
          <mesh castShadow position={[0, -0.4, 0]}>
            <boxGeometry args={[0.22, 0.8, 0.24]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
          <mesh castShadow position={[0, -0.85, 0.05]}>
            <boxGeometry args={[0.24, 0.12, 0.32]} />
            <meshStandardMaterial color="#0f172a" />
          </mesh>
        </group>
        <group ref={piernaIzqRef} position={[0.14, 1.05, 0]}>
          <mesh castShadow position={[0, -0.4, 0]}>
            <boxGeometry args={[0.22, 0.8, 0.24]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
          <mesh castShadow position={[0, -0.85, 0.05]}>
            <boxGeometry args={[0.24, 0.12, 0.32]} />
            <meshStandardMaterial color="#0f172a" />
          </mesh>
        </group>

        {/* Torso */}
        <mesh castShadow position={[0, 1.35, 0]}>
          <boxGeometry args={[0.55, 0.7, 0.32]} />
          <meshStandardMaterial color={colorRopa} roughness={0.4} />
        </mesh>

        {/* Brazos */}
        <group ref={brazoDerRef} position={[-0.33, 1.62, 0]}>
          <mesh castShadow position={[0, -0.35, 0]}>
            <boxGeometry args={[0.18, 0.7, 0.18]} />
            <meshStandardMaterial color={colorRopa} roughness={0.4} />
          </mesh>
          <mesh castShadow position={[0, -0.72, 0]}>
            <sphereGeometry args={[0.1, 12, 12]} />
            <meshStandardMaterial color={colorPiel} />
          </mesh>
        </group>
        <group ref={brazoIzqRef} position={[0.33, 1.62, 0]}>
          <mesh castShadow position={[0, -0.35, 0]}>
            <boxGeometry args={[0.18, 0.7, 0.18]} />
            <meshStandardMaterial color={colorRopa} roughness={0.4} />
          </mesh>
          <mesh castShadow position={[0, -0.72, 0]}>
            <sphereGeometry args={[0.1, 12, 12]} />
            <meshStandardMaterial color={colorPiel} />
          </mesh>
        </group>

        {/* Cabeza Base */}
        <mesh castShadow position={[0, 2.05, 0]}>
          <sphereGeometry args={[0.26, 24, 24]} />
          <meshStandardMaterial color={colorPiel} roughness={0.5} />
        </mesh>

        {/* Rostro Estilizado (Ojos, Cejas, Boca, Rubor) */}
        <Rostro expresion={expresionRostro} />

        {/* Cabello Dinámico */}
        <Cabello estilo={estiloCabello} color={colorCabello} />

        {/* Accesorios */}
        {accesorios?.sombrero && <Sombrero />}
        {accesorios?.gafas && <Gafas />}
        {accesorios?.mochila && <Mochila color={oscurecer(colorRopa)} />}
      </group>

      <Etiqueta nombre={nombre} />
    </group>
  );
};

// Componente de Rostro Estilizado Xbox / Mii
function Rostro({ expresion = 'alegre' }: { expresion: string }) {
  const esGuinio = expresion === 'guiño';
  const esSerio = expresion === 'serio';
  const esSorprendido = expresion === 'sorprendido';

  return (
    <group position={[0, 2.05, 0]}>
      {/* Ojo Izquierdo (Siempre Abierto) */}
      <group position={[-0.09, 0.03, 0.23]}>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.07, 0.08, 0.02]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0, -0.005, 0.01]}>
          <boxGeometry args={[0.045, 0.055, 0.02]} />
          <meshBasicMaterial color="#0f172a" />
        </mesh>
        {/* Destello de luz en la pupila */}
        <mesh position={[-0.012, 0.012, 0.02]}>
          <boxGeometry args={[0.015, 0.015, 0.02]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </group>

      {/* Ojo Derecho (Normal o Guiño) */}
      {esGuinio ? (
        /* Ojo guiñado (Arco cerrado) */
        <mesh position={[0.09, 0.03, 0.24]} rotation={[0, 0, -0.1]}>
          <boxGeometry args={[0.07, 0.018, 0.02]} />
          <meshBasicMaterial color="#0f172a" />
        </mesh>
      ) : (
        <group position={[0.09, 0.03, 0.23]}>
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[0.07, 0.08, 0.02]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <mesh position={[0, -0.005, 0.01]}>
            <boxGeometry args={[0.045, 0.055, 0.02]} />
            <meshBasicMaterial color="#0f172a" />
          </mesh>
          <mesh position={[-0.012, 0.012, 0.02]}>
            <boxGeometry args={[0.015, 0.015, 0.02]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        </group>
      )}

      {/* Cejas */}
      <mesh position={[-0.09, 0.09, 0.23]} rotation={[0, 0, esSerio ? 0.15 : 0]}>
        <boxGeometry args={[0.08, 0.018, 0.02]} />
        <meshBasicMaterial color="#1e1b18" />
      </mesh>
      <mesh position={[0.09, 0.09, 0.23]} rotation={[0, 0, esSerio ? -0.15 : 0]}>
        <boxGeometry args={[0.08, 0.018, 0.02]} />
        <meshBasicMaterial color="#1e1b18" />
      </mesh>

      {/* Rubor en las mejillas */}
      <mesh position={[-0.14, -0.03, 0.22]}>
        <sphereGeometry args={[0.035, 10, 10]} />
        <meshBasicMaterial color="#f43f5e" transparent opacity={0.5} />
      </mesh>
      <mesh position={[0.14, -0.03, 0.22]}>
        <sphereGeometry args={[0.035, 10, 10]} />
        <meshBasicMaterial color="#f43f5e" transparent opacity={0.5} />
      </mesh>

      {/* Boca */}
      {esSorprendido ? (
        <mesh position={[0, -0.08, 0.24]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.02, 16]} />
          <meshBasicMaterial color="#7f1d1d" />
        </mesh>
      ) : esSerio ? (
        <mesh position={[0, -0.08, 0.24]}>
          <boxGeometry args={[0.08, 0.016, 0.02]} />
          <meshBasicMaterial color="#450a0a" />
        </mesh>
      ) : (
        /* Sonrisa Sonriente */
        <group position={[0, -0.07, 0.23]}>
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[0.1, 0.025, 0.02]} />
            <meshBasicMaterial color="#991b1b" />
          </mesh>
          <mesh position={[0, -0.01, 0.005]}>
            <boxGeometry args={[0.07, 0.015, 0.02]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        </group>
      )}
    </group>
  );
}

// Componente de Cabello Dinámico con varios estilos
function Cabello({ estilo = 'corto', color = '#2c1d11' }: { estilo: string; color: string }) {
  if (estilo === 'calvo') return null;

  return (
    <group position={[0, 2.05, 0]}>
      {estilo === 'corto' && (
        <group>
          <mesh castShadow position={[0, 0.12, -0.02]}>
            <sphereGeometry args={[0.27, 20, 20, 0, Math.PI * 2, 0, Math.PI / 1.7]} />
            <meshStandardMaterial color={color} roughness={0.6} />
          </mesh>
          <mesh castShadow position={[0, 0.2, 0.16]} rotation={[0.4, 0, 0]}>
            <boxGeometry args={[0.34, 0.08, 0.12]} />
            <meshStandardMaterial color={color} roughness={0.6} />
          </mesh>
        </group>
      )}

      {estilo === 'tupe' && (
        <group>
          <mesh castShadow position={[0, 0.12, -0.02]}>
            <sphereGeometry args={[0.27, 20, 20, 0, Math.PI * 2, 0, Math.PI / 1.8]} />
            <meshStandardMaterial color={color} roughness={0.5} />
          </mesh>
          {/* Tupé frontal con volumen */}
          <mesh castShadow position={[0, 0.27, 0.1]} rotation={[-0.2, 0, 0]}>
            <boxGeometry args={[0.3, 0.16, 0.22]} />
            <meshStandardMaterial color={color} roughness={0.5} />
          </mesh>
        </group>
      )}

      {estilo === 'largo' && (
        <group>
          <mesh castShadow position={[0, 0.12, -0.02]}>
            <sphereGeometry args={[0.275, 20, 20, 0, Math.PI * 2, 0, Math.PI / 1.7]} />
            <meshStandardMaterial color={color} roughness={0.6} />
          </mesh>
          {/* Caída lateral derecha */}
          <mesh castShadow position={[-0.22, -0.15, 0.02]}>
            <boxGeometry args={[0.1, 0.42, 0.26]} />
            <meshStandardMaterial color={color} roughness={0.6} />
          </mesh>
          {/* Caída lateral izquierda */}
          <mesh castShadow position={[0.22, -0.15, 0.02]}>
            <boxGeometry args={[0.1, 0.42, 0.26]} />
            <meshStandardMaterial color={color} roughness={0.6} />
          </mesh>
          {/* Caída posterior */}
          <mesh castShadow position={[0, -0.18, -0.16]}>
            <boxGeometry args={[0.44, 0.46, 0.12]} />
            <meshStandardMaterial color={color} roughness={0.6} />
          </mesh>
        </group>
      )}

      {estilo === 'rizado' && (
        <group>
          {/* Racimo de rizos esféricos */}
          {[
            [0, 0.22, 0],
            [-0.14, 0.2, 0.08],
            [0.14, 0.2, 0.08],
            [-0.16, 0.18, -0.1],
            [0.16, 0.18, -0.1],
            [0, 0.24, 0.12],
            [0, 0.22, -0.16],
          ].map((pos, idx) => (
            <mesh key={idx} castShadow position={pos as [number, number, number]}>
              <sphereGeometry args={[0.14, 12, 12]} />
              <meshStandardMaterial color={color} roughness={0.8} />
            </mesh>
          ))}
        </group>
      )}

      {estilo === 'bun' && (
        <group>
          <mesh castShadow position={[0, 0.12, -0.02]}>
            <sphereGeometry args={[0.27, 20, 20, 0, Math.PI * 2, 0, Math.PI / 1.7]} />
            <meshStandardMaterial color={color} roughness={0.5} />
          </mesh>
          {/* Moño / Bun superior posterior */}
          <mesh castShadow position={[0, 0.28, -0.18]}>
            <sphereGeometry args={[0.13, 14, 14]} />
            <meshStandardMaterial color={color} roughness={0.5} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function Sombrero() {
  return (
    <group position={[0, 2.45, 0]}>
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
    <mesh castShadow position={[0, 2.08, 0.24]}>
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
    <sprite position={[0, 2.8, 0]} scale={[1.5, 0.4, 1]}>
      <spriteMaterial attach="material" map={crearTexturaTexto(nombre)} transparent />
    </sprite>
  );
}

function esPosicionValida(pos: THREE.Vector3, isAula: boolean = false): boolean {
  const x = pos.x;
  const z = pos.z;

  if (isAula) {
    // 🏢 COLISIONES DENTRO DEL AULA VIRTUAL 3D (Límites x: ±19.2, z: ±19.2)
    // 1. Límites de las 4 Paredes Reales del Aula
    if (Math.abs(x) > 19.2 || Math.abs(z) > 19.2) {
      return false;
    }

    // 2. Colisión con Escritorio del Docente y Silla (centro x: 0, z: -13)
    if (Math.abs(x) < 2.2 && z >= -14.8 && z <= -11.2) {
      return false;
    }

    // 3. Colisión con los 12 Pupitres de Estudiantes (Solo mesa de trabajo, permitiendo libre paso por pasillos)
    const pupitresX = [-8.5, -3, 3, 8.5];
    const pupitresZ = [-5, 0, 5];
    for (const px of pupitresX) {
      for (const pz of pupitresZ) {
        if (Math.abs(x - px) < 0.65 && z >= pz - 0.45 && z <= pz + 0.35) {
          return false;
        }
      }
    }

    // 4. Colisión con Sofás al fondo (x: -16, z: 12 y x: 16, z: 12)
    if (Math.hypot(x - (-16), z - 12) < 2.2) return false;
    if (Math.hypot(x - 16, z - 12) < 2.2) return false;

    // 5. Colisión con Estanterías de libros (x: -18, z: -10 y x: 18, z: -10)
    if (x <= -16.2 && z >= -12.5 && z <= -7.5) return false;
    if (x >= 16.2 && z >= -12.5 && z <= -7.5) return false;

    return true;
  }

  // 🌳 COLISIONES FUERA EN EL CAMPUS
  // 1. Verificación de Terreno Firme (Límites de Islas Flotantes y Puente)
  const enIslaSocial = Math.abs(x) <= 10.5 && z >= -0.8 && z <= 14.8;
  const enIslaAcademica = Math.abs(x) <= 18.5 && z >= -41.8 && z <= -12.2;
  const enPuente = Math.abs(x) <= 1.9 && z >= -12.2 && z <= -0.8;

  if (!enIslaSocial && !enIslaAcademica && !enPuente) {
    return false; // Impedir que el jugador caiga al vacío de la isla flotante
  }

  // 2. Colisión con Fuente Central (Isla Social z: 7)
  const distFuente = Math.hypot(x - 0, z - 7);
  if (distFuente < 2.3) return false;

  // 3. Colisión con Edificios (Isla Académica)
  // Aula 101: centro x: -12, z: -21
  if (x >= -16.5 && x <= -7.5 && z >= -25.5 && z <= -16.5) return false;

  // Aula 102: centro x: 12, z: -21
  if (x >= 7.5 && x <= 16.5 && z >= -25.5 && z <= -16.5) return false;

  // Sala Descanso: centro x: -12, z: -37
  if (x >= -16.5 && x <= -7.5 && z >= -41.5 && z <= -32.5) return false;

  // Sala Decanos: centro x: 12, z: -37
  if (x >= 7.5 && x <= 16.5 && z >= -41.5 && z <= -32.5) return false;

  return true;
}

export default AvatarModel;
