import React, { useRef, useMemo, useEffect, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useKeyboardControls } from './useKeyboardControls.js';
import { crearTexturaTexto } from './texto3d.js';

const VELOCIDAD = 4;
const ROTACION_LERP = 10;
const FRECUENCIA_CAMINAR = 9;
const AMPLITUD_CAMINAR = 0.6;

export interface PersonalizacionAvatar {
  colorRopa?: string;
  colorPiel?: string;
  colorCabello?: string;
  estiloCabello?: 'corto' | 'largo' | 'tupe' | 'rizado' | 'bun' | 'calvo';
  expresionRostro?: 'alegre' | 'guiño' | 'serio' | 'sorprendido';
  escala?: number;
  accesorios?: {
    sombrero?: boolean;
    gafas?: boolean;
    mochila?: boolean;
  };
  ropa?: {
    colorPrimario: string;
    colorSecundario: string;
  };
  cabello?: {
    estilo: 'corto' | 'largo' | 'tupe' | 'rizado' | 'bun' | 'calvo';
    color: string;
  };
  velloFacial?: {
    estilo: 'ninguno' | 'barba' | 'bigote' | 'perilla' | 'candado';
    color: string;
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
  ropa: {
    colorPrimario: '#3498db',
    colorSecundario: '#1d4ed8',
  },
  cabello: {
    estilo: 'corto',
    color: '#2c1d11',
  },
  velloFacial: {
    estilo: 'ninguno',
    color: '#2c1d11',
  },
};

// Rectángulo de colisión (en coordenadas de mundo) que bloquea el paso del
// avatar en el campus — un edificio de aula, por ejemplo.
export interface ZonaBloqueada {
  x: number;
  z: number;
  mitadX: number;
  mitadZ: number;
}

interface AvatarModelProps {
  nombre: string;
  personalizacion?: PersonalizacionAvatar;
  position?: [number, number, number];
  rotation?: [number, number, number];
  isLocal?: boolean;
  isAula?: boolean;
  estaSentado?: boolean;
  posicionSentado?: { x: number; y: number; z: number; angulo: number } | null;
  // Zonas de colisión del campus (edificios de aula) calculadas en vivo a
  // partir del layout real, y mitad del ancho actual de la Isla 2 — ambos
  // acompañan el crecimiento lateral de los bloques de aulas por docente.
  zonasBloqueadasCampus?: ZonaBloqueada[];
  mitadAnchoIslaAcademica?: number;
  onUpdatePosicion?: (posicion: THREE.Vector3, angulo: number) => void;
}

// ---------------------------------------------------------------------
// 📐 HELPER PARA INTERPOLACIÓN SUAVE DE ÁNGULOS (SIN GIROS BRUSCOS DE 360°)
// ---------------------------------------------------------------------
function lerpAngulo(actual: number, objetivo: number, alpha: number): number {
  let diff = (objetivo - actual) % (Math.PI * 2);
  if (diff < -Math.PI) diff += Math.PI * 2;
  if (diff > Math.PI) diff -= Math.PI * 2;
  return actual + diff * alpha;
}

// ---------------------------------------------------------------------
// 🎨 GENERADOR DINÁMICO DE TEXTURE ATLAS PARA ROSTROS
// ---------------------------------------------------------------------
let textureAtlasGlobal: THREE.CanvasTexture | null = null;

function obtenerTextureAtlasRostro(): THREE.CanvasTexture {
  if (textureAtlasGlobal) return textureAtlasGlobal;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, 512, 512);

    const dibujarCelda = (
      col: number,
      row: number,
      tipoOjos: 'abierto' | 'guino' | 'cerrado' | 'sorprendido',
      tipoBoca: 'sonrisa' | 'seria' | 'sorprendida'
    ) => {
      const offsetX = col * 128;
      const offsetY = row * 256;

      ctx.save();
      ctx.translate(offsetX, offsetY);

      if (tipoOjos === 'cerrado') {
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(36, 85, 14, Math.PI * 0.1, Math.PI * 0.9, false);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(36, 85, 14, 18, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.ellipse(36, 87, 9, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(32, 81, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      if (tipoOjos === 'guino' || tipoOjos === 'cerrado') {
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(92, 85, 14, Math.PI * 0.1, Math.PI * 0.9, false);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(92, 85, 14, 18, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.ellipse(92, 87, 9, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(88, 81, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#1e1b18';
      if (tipoBoca === 'seria') {
        ctx.fillRect(22, 58, 28, 6);
        ctx.fillRect(78, 58, 28, 6);
      } else {
        ctx.fillRect(22, 55, 28, 6);
        ctx.fillRect(78, 55, 28, 6);
      }

      ctx.fillStyle = 'rgba(244, 63, 94, 0.45)';
      ctx.beginPath();
      ctx.arc(22, 115, 10, 0, Math.PI * 2);
      ctx.arc(106, 115, 10, 0, Math.PI * 2);
      ctx.fill();

      if (tipoBoca === 'sonrisa') {
        ctx.fillStyle = '#991b1b';
        ctx.beginPath();
        ctx.arc(64, 145, 18, 0, Math.PI, false);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(52, 145, 24, 6);
      } else if (tipoBoca === 'sorprendida') {
        ctx.fillStyle = '#7f1d1d';
        ctx.beginPath();
        ctx.ellipse(64, 150, 10, 14, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#450a0a';
        ctx.fillRect(48, 148, 32, 6);
      }

      ctx.restore();
    };

    dibujarCelda(0, 0, 'abierto', 'sonrisa');
    dibujarCelda(1, 0, 'guino', 'sonrisa');
    dibujarCelda(2, 0, 'abierto', 'seria');
    dibujarCelda(3, 0, 'sorprendido', 'sorprendida');

    dibujarCelda(0, 1, 'cerrado', 'sonrisa');
    dibujarCelda(1, 1, 'cerrado', 'seria');
    dibujarCelda(2, 1, 'cerrado', 'sorprendida');
    dibujarCelda(3, 1, 'abierto', 'sonrisa');
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(0.25, 0.5);
  texture.needsUpdate = true;
  textureAtlasGlobal = texture;
  return textureAtlasGlobal;
}

// ---------------------------------------------------------------------
// 👕 HOOK DE MATERIAL DE ROPA DUAL
// ---------------------------------------------------------------------
function useMaterialRopaDual(colPrimarioHex: string, colSecundarioHex: string) {
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: colPrimarioHex,
      roughness: 0.4,
    });

    const cPrim = new THREE.Color(colPrimarioHex);
    const cSec = new THREE.Color(colSecundarioHex);

    mat.onBeforeCompile = (shader: any) => {
      shader.uniforms.uColorPrimario = { value: cPrim };
      shader.uniforms.uColorSecundario = { value: cSec };
      mat.userData.uniforms = shader.uniforms;

      shader.vertexShader = `
        varying vec3 vPosLocal;
        ${shader.vertexShader}
      `.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vPosLocal = position;
        `
      );

      shader.fragmentShader = `
        varying vec3 vPosLocal;
        uniform vec3 uColorPrimario;
        uniform vec3 uColorSecundario;
        ${shader.fragmentShader}
      `.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        float franja = step(0.12, vPosLocal.y);
        vec3 colResultante = mix(uColorPrimario, uColorSecundario, franja);
        diffuseColor = vec4(colResultante, 1.0);
        `
      );
    };

    return mat;
  }, []);

  useEffect(() => {
    material.color.set(colPrimarioHex);
    if (material.userData.uniforms) {
      material.userData.uniforms.uColorPrimario.value.set(colPrimarioHex);
      material.userData.uniforms.uColorSecundario.value.set(colSecundarioHex);
    }
  }, [material, colPrimarioHex, colSecundarioHex]);

  return material;
}

// ---------------------------------------------------------------------
// 🧍 COMPONENTE PRINCIPAL AVATAR MODEL
// ---------------------------------------------------------------------
export const AvatarModel: React.FC<AvatarModelProps> = ({
  nombre,
  personalizacion = PERSONALIZACION_POR_DEFECTO,
  position = [0, 0, 11],
  rotation = [0, 0, 0],
  isLocal = false,
  isAula = false,
  estaSentado = false,
  posicionSentado,
  zonasBloqueadasCampus,
  mitadAnchoIslaAcademica,
  onUpdatePosicion,
}) => {
  const grupoRef = useRef<THREE.Group>(null);
  const cuerpoRef = useRef<THREE.Group>(null);
  const controles = useKeyboardControls();
  const { camera } = useThree();
  const direccionActual = useRef(new THREE.Vector3(0, 0, -1));
  const tiempoAnimRef = useRef(0);

  const proximoPestaneoRef = useRef(Math.random() * 4 + 3);
  const duracionPestaneoRef = useRef(0);
  const estaPestaneandoRef = useRef(false);

  const forwardCamara = useRef(new THREE.Vector3());
  const rightCamara = useRef(new THREE.Vector3());

  const brazoIzqRef = useRef<THREE.Group>(null);
  const brazoDerRef = useRef<THREE.Group>(null);
  const piernaIzqRef = useRef<THREE.Group>(null);
  const piernaDerRef = useRef<THREE.Group>(null);

  const colorPiel = personalizacion.colorPiel || PERSONALIZACION_POR_DEFECTO.colorPiel!;
  const colorPrimarioRopa = personalizacion.ropa?.colorPrimario || personalizacion.colorRopa || '#3498db';
  const colorSecundarioRopa = personalizacion.ropa?.colorSecundario || oscurecerHex(colorPrimarioRopa, 0.7);

  const estiloCabello = personalizacion.cabello?.estilo || personalizacion.estiloCabello || 'corto';
  const colorCabello = personalizacion.cabello?.color || personalizacion.colorCabello || '#2c1d11';

  const estiloVelloFacial = personalizacion.velloFacial?.estilo || 'ninguno';
  const colorVelloFacial = personalizacion.velloFacial?.color || colorCabello;

  const expresionRostro = personalizacion.expresionRostro || 'alegre';
  const escala = personalizacion.escala ?? 1;
  const accesorios = personalizacion.accesorios;

  const materialTorso = useMaterialRopaDual(colorPrimarioRopa, colorSecundarioRopa);
  const materialPiernas = useMaterialRopaDual('#1e293b', '#0f172a');

  const faceTextureAtlas = useMemo(() => {
    const atlas = obtenerTextureAtlasRostro().clone();
    atlas.needsUpdate = true;
    return atlas;
  }, []);

  // Posición/rotación inicial: se aplica una única vez al montar. A partir de
  // ahí useFrame es la única fuente de verdad (lerp local por teclado, lerp/snap
  // remoto por red). Si se pasaran position/rotation como props reactivos del
  // <group>, react-three-fiber los compara por valor y, apenas cambian (cada
  // paquete de red para un avatar remoto), los reaplica directo sobre el
  // objeto — pisando el lerp del useFrame antes de que corra y dejando
  // "dist" en ~0 siempre, lo que impedía que se detectara el caminar remoto.
  useEffect(() => {
    if (grupoRef.current) {
      grupoRef.current.position.set(...position);
      grupoRef.current.rotation.set(...rotation);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Teletransportación inmediata a la silla al sentarse
  useEffect(() => {
    if (estaSentado && posicionSentado && grupoRef.current) {
      grupoRef.current.position.set(posicionSentado.x, posicionSentado.y, posicionSentado.z);
      grupoRef.current.rotation.y = posicionSentado.angulo;
      direccionActual.current.set(Math.sin(posicionSentado.angulo), 0, Math.cos(posicionSentado.angulo));
      onUpdatePosicion?.(grupoRef.current.position, posicionSentado.angulo);
    }
  }, [estaSentado, posicionSentado, onUpdatePosicion]);

  const aplicarExpresionUV = useCallback(
    (expr: string) => {
      if (!faceTextureAtlas) return;
      let col = 0;
      let row = 0;

      if (expr === 'pestaneo') {
        col = 0;
        row = 1;
      } else if (expr === 'guiño') {
        col = 1;
        row = 0;
      } else if (expr === 'serio') {
        col = 2;
        row = 0;
      } else if (expr === 'sorprendido') {
        col = 3;
        row = 0;
      } else {
        col = 0;
        row = 0;
      }

      faceTextureAtlas.offset.set(col * 0.25, row === 0 ? 0.5 : 0.0);
    },
    [faceTextureAtlas]
  );

  useFrame((state, delta) => {
    if (!grupoRef.current) return;
    const tiempoGlobal = state.clock.getElapsedTime();

    // 1. Pestañeo Aleatorio
    if (tiempoGlobal > proximoPestaneoRef.current) {
      estaPestaneandoRef.current = true;
      duracionPestaneoRef.current = tiempoGlobal + 0.12;
      proximoPestaneoRef.current = tiempoGlobal + 4 + Math.random() * 3.5;
    } else if (estaPestaneandoRef.current && tiempoGlobal > duracionPestaneoRef.current) {
      estaPestaneandoRef.current = false;
    }

    aplicarExpresionUV(estaPestaneandoRef.current ? 'pestaneo' : expresionRostro);

    let estaCaminando = false;

    if (isLocal) {
      if (!estaSentado) {
        const { adelante, atras, izquierda, derecha } = controles.current;
        const entradaAdelante = (adelante ? 1 : 0) - (atras ? 1 : 0);
        const entradaLateral = (derecha ? 1 : 0) - (izquierda ? 1 : 0);

        const mover = new THREE.Vector3();
        estaCaminando = entradaAdelante !== 0 || entradaLateral !== 0;

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

          if (esPosicionValida(posDeseada, isAula, zonasBloqueadasCampus, mitadAnchoIslaAcademica)) {
            grupoRef.current.position.copy(posDeseada);
          } else {
            const posPruebaX = posActual.clone().add(new THREE.Vector3(mover.x, 0, 0));
            if (esPosicionValida(posPruebaX, isAula, zonasBloqueadasCampus, mitadAnchoIslaAcademica)) {
              grupoRef.current.position.copy(posPruebaX);
            } else {
              const posPruebaZ = posActual.clone().add(new THREE.Vector3(0, 0, mover.z));
              if (esPosicionValida(posPruebaZ, isAula, zonasBloqueadasCampus, mitadAnchoIslaAcademica)) {
                grupoRef.current.position.copy(posPruebaZ);
              }
            }
          }

          direccionActual.current.lerp(mover.clone().normalize(), 0.3);
          const anguloObjetivo = Math.atan2(direccionActual.current.x, direccionActual.current.z);
          grupoRef.current.rotation.y = lerpAngulo(
            grupoRef.current.rotation.y,
            anguloObjetivo,
            Math.min(1, delta * ROTACION_LERP)
          );

          tiempoAnimRef.current += delta;
        }

        const objetivoSwing = estaCaminando
          ? Math.sin(tiempoAnimRef.current * FRECUENCIA_CAMINAR) * AMPLITUD_CAMINAR
          : 0;
        const suavizado = Math.min(1, delta * 12);

        if (brazoDerRef.current) brazoDerRef.current.rotation.x = THREE.MathUtils.lerp(brazoDerRef.current.rotation.x, objetivoSwing, suavizado);
        if (brazoIzqRef.current) brazoIzqRef.current.rotation.x = THREE.MathUtils.lerp(brazoIzqRef.current.rotation.x, -objetivoSwing, suavizado);
        if (piernaDerRef.current) piernaDerRef.current.rotation.x = THREE.MathUtils.lerp(piernaDerRef.current.rotation.x, -objetivoSwing, suavizado);
        if (piernaIzqRef.current) piernaIzqRef.current.rotation.x = THREE.MathUtils.lerp(piernaIzqRef.current.rotation.x, objetivoSwing, suavizado);
      } else {
        const suavizadoSentado = Math.min(1, delta * 15);
        if (brazoDerRef.current) brazoDerRef.current.rotation.x = THREE.MathUtils.lerp(brazoDerRef.current.rotation.x, -Math.PI / 4, suavizadoSentado);
        if (brazoIzqRef.current) brazoIzqRef.current.rotation.x = THREE.MathUtils.lerp(brazoIzqRef.current.rotation.x, -Math.PI / 4, suavizadoSentado);
        if (piernaDerRef.current) piernaDerRef.current.rotation.x = THREE.MathUtils.lerp(piernaDerRef.current.rotation.x, -Math.PI / 2.1, suavizadoSentado);
        if (piernaIzqRef.current) piernaIzqRef.current.rotation.x = THREE.MathUtils.lerp(piernaIzqRef.current.rotation.x, -Math.PI / 2.1, suavizadoSentado);
      }

      onUpdatePosicion?.(grupoRef.current.position, grupoRef.current.rotation.y);
    } else {
      const posObjetivo = new THREE.Vector3(...position);
      const posActual = grupoRef.current.position;
      const dist = posActual.distanceTo(posObjetivo);

      // Si la distancia es grande (teletransporte / cambio de espacio), posicionar de inmediato
      if (dist > 12.0) {
        posActual.copy(posObjetivo);
        grupoRef.current.rotation.y = rotation[1] || 0;
      } else {
        const lerpFactor = Math.min(1, delta * 10);
        posActual.lerp(posObjetivo, lerpFactor);

        // Orientar el avatar hacia donde camina si la distancia es apreciable
        let anguloTarget = rotation[1] || 0;
        if (dist > 0.1) {
          const dx = posObjetivo.x - posActual.x;
          const dz = posObjetivo.z - posActual.z;
          anguloTarget = Math.atan2(dx, dz);
        }
        grupoRef.current.rotation.y = lerpAngulo(grupoRef.current.rotation.y, anguloTarget, lerpFactor);
      }

      estaCaminando = dist > 0.04 && !estaSentado;

      if (estaCaminando) {
        tiempoAnimRef.current += delta;
        const objetivoSwing = Math.sin(tiempoAnimRef.current * FRECUENCIA_CAMINAR) * AMPLITUD_CAMINAR;
        const suavizado = Math.min(1, delta * 12);

        if (brazoDerRef.current) brazoDerRef.current.rotation.x = THREE.MathUtils.lerp(brazoDerRef.current.rotation.x, objetivoSwing, suavizado);
        if (brazoIzqRef.current) brazoIzqRef.current.rotation.x = THREE.MathUtils.lerp(brazoIzqRef.current.rotation.x, -objetivoSwing, suavizado);
        if (piernaDerRef.current) piernaDerRef.current.rotation.x = THREE.MathUtils.lerp(piernaDerRef.current.rotation.x, -objetivoSwing, suavizado);
        if (piernaIzqRef.current) piernaIzqRef.current.rotation.x = THREE.MathUtils.lerp(piernaIzqRef.current.rotation.x, objetivoSwing, suavizado);
      } else if (estaSentado) {
        const suavizadoSentado = Math.min(1, delta * 15);
        if (brazoDerRef.current) brazoDerRef.current.rotation.x = THREE.MathUtils.lerp(brazoDerRef.current.rotation.x, -Math.PI / 4, suavizadoSentado);
        if (brazoIzqRef.current) brazoIzqRef.current.rotation.x = THREE.MathUtils.lerp(brazoIzqRef.current.rotation.x, -Math.PI / 4, suavizadoSentado);
        if (piernaDerRef.current) piernaDerRef.current.rotation.x = THREE.MathUtils.lerp(piernaDerRef.current.rotation.x, -Math.PI / 2.1, suavizadoSentado);
        if (piernaIzqRef.current) piernaIzqRef.current.rotation.x = THREE.MathUtils.lerp(piernaIzqRef.current.rotation.x, -Math.PI / 2.1, suavizadoSentado);
      } else {
        const suavizado = Math.min(1, delta * 10);
        if (brazoDerRef.current) brazoDerRef.current.rotation.x = THREE.MathUtils.lerp(brazoDerRef.current.rotation.x, 0, suavizado);
        if (brazoIzqRef.current) brazoIzqRef.current.rotation.x = THREE.MathUtils.lerp(brazoIzqRef.current.rotation.x, 0, suavizado);
        if (piernaDerRef.current) piernaDerRef.current.rotation.x = THREE.MathUtils.lerp(piernaDerRef.current.rotation.x, 0, suavizado);
        if (piernaIzqRef.current) piernaIzqRef.current.rotation.x = THREE.MathUtils.lerp(piernaIzqRef.current.rotation.x, 0, suavizado);
      }
    }

    // 2. Ajuste de Cadera al Sentarse / Respiración Idle / Caminata Waddle
    if (cuerpoRef.current) {
      if (estaSentado) {
        cuerpoRef.current.position.y = THREE.MathUtils.lerp(cuerpoRef.current.position.y, -0.38, delta * 15);
        cuerpoRef.current.rotation.z = 0;
        cuerpoRef.current.scale.set(1, 1, 1);
      } else if (estaCaminando) {
        const waddleZ = Math.sin(tiempoAnimRef.current * FRECUENCIA_CAMINAR) * 0.07;
        const bounceY = Math.abs(Math.sin(tiempoAnimRef.current * FRECUENCIA_CAMINAR)) * 0.04;
        cuerpoRef.current.rotation.z = THREE.MathUtils.lerp(cuerpoRef.current.rotation.z, waddleZ, delta * 12);
        cuerpoRef.current.position.y = bounceY;
        cuerpoRef.current.scale.set(1, 1, 1);
      } else {
        const idleOsc = Math.sin(tiempoGlobal * 2.4);
        const bobY = idleOsc * 0.02;
        const breathScaleY = 1 + idleOsc * 0.012;
        const breathScaleXZ = 1 - idleOsc * 0.006;

        cuerpoRef.current.position.y = THREE.MathUtils.lerp(cuerpoRef.current.position.y, bobY, delta * 10);
        cuerpoRef.current.rotation.z = THREE.MathUtils.lerp(cuerpoRef.current.rotation.z, 0, delta * 8);
        cuerpoRef.current.scale.set(breathScaleXZ, breathScaleY, breathScaleXZ);
      }
    }
  });

  return (
    <group ref={grupoRef}>
      <group ref={cuerpoRef} scale={escala}>
        {/* Piernas y Calzado */}
        <group ref={piernaDerRef} position={[-0.14, 1.05, 0]}>
          <mesh castShadow position={[0, -0.4, 0]} material={materialPiernas}>
            <boxGeometry args={[0.22, 0.8, 0.24]} />
          </mesh>
          <mesh castShadow position={[0, -0.85, 0.05]}>
            <boxGeometry args={[0.24, 0.12, 0.32]} />
            <meshStandardMaterial color="#0f172a" roughness={0.4} />
          </mesh>
        </group>
        <group ref={piernaIzqRef} position={[0.14, 1.05, 0]}>
          <mesh castShadow position={[0, -0.4, 0]} material={materialPiernas}>
            <boxGeometry args={[0.22, 0.8, 0.24]} />
          </mesh>
          <mesh castShadow position={[0, -0.85, 0.05]}>
            <boxGeometry args={[0.24, 0.12, 0.32]} />
            <meshStandardMaterial color="#0f172a" roughness={0.4} />
          </mesh>
        </group>

        {/* Torso */}
        <mesh castShadow position={[0, 1.35, 0]} material={materialTorso}>
          <boxGeometry args={[0.55, 0.7, 0.32]} />
        </mesh>

        {/* Brazos */}
        <group ref={brazoDerRef} position={[-0.33, 1.62, 0]}>
          <mesh castShadow position={[0, -0.35, 0]} material={materialTorso}>
            <boxGeometry args={[0.18, 0.7, 0.18]} />
          </mesh>
          <mesh castShadow position={[0, -0.72, 0]}>
            <sphereGeometry args={[0.1, 12, 12]} />
            <meshStandardMaterial color={colorPiel} />
          </mesh>
        </group>
        <group ref={brazoIzqRef} position={[0.33, 1.62, 0]}>
          <mesh castShadow position={[0, -0.35, 0]} material={materialTorso}>
            <boxGeometry args={[0.18, 0.7, 0.18]} />
          </mesh>
          <mesh castShadow position={[0, -0.72, 0]}>
            <sphereGeometry args={[0.1, 12, 12]} />
            <meshStandardMaterial color={colorPiel} />
          </mesh>
        </group>

        {/* Cabeza Base y Rostro Ultra-Optimizado (1 Draw Call via Atlas UV) */}
        <group>
          <mesh castShadow position={[0, 2.05, 0]}>
            <sphereGeometry args={[0.26, 24, 24]} />
            <meshStandardMaterial color={colorPiel} roughness={0.5} />
          </mesh>

          <mesh position={[0, 2.05, 0.261]}>
            <planeGeometry args={[0.44, 0.44]} />
            <meshBasicMaterial map={faceTextureAtlas} transparent alphaTest={0.05} />
          </mesh>

          <VelloFacial estilo={estiloVelloFacial} color={colorVelloFacial} />
          <Cabello estilo={estiloCabello} color={colorCabello} />
        </group>

        {/* Accesorios */}
        {accesorios?.sombrero && <Sombrero />}
        {accesorios?.gafas && <Gafas />}
        {accesorios?.mochila && <Mochila color={oscurecerColor(colorPrimarioRopa)} />}
      </group>

      <Etiqueta nombre={nombre} />
    </group>
  );
};

// Componente de Vello Facial Low-Poly
function VelloFacial({ estilo, color }: { estilo: string; color: string }) {
  if (!estilo || estilo === 'ninguno') return null;

  return (
    <group position={[0, 2.05, 0]}>
      {(estilo === 'bigote' || estilo === 'candado') && (
        <mesh position={[0, -0.06, 0.25]}>
          <boxGeometry args={[0.16, 0.035, 0.02]} />
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
      )}

      {(estilo === 'perilla' || estilo === 'candado') && (
        <mesh position={[0, -0.16, 0.23]}>
          <boxGeometry args={[0.08, 0.08, 0.03]} />
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
      )}

      {estilo === 'barba' && (
        <group>
          <mesh position={[0, -0.12, 0.12]}>
            <cylinderGeometry args={[0.265, 0.24, 0.18, 16, 1, false, -Math.PI / 1.8, Math.PI * 1.1]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
          <mesh position={[0, -0.06, 0.25]}>
            <boxGeometry args={[0.16, 0.035, 0.02]} />
            <meshStandardMaterial color={color} roughness={0.7} />
          </mesh>
        </group>
      )}
    </group>
  );
}

// Componente de Cabello Dinámico
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
          <mesh castShadow position={[-0.22, -0.15, 0.02]}>
            <boxGeometry args={[0.1, 0.42, 0.26]} />
            <meshStandardMaterial color={color} roughness={0.6} />
          </mesh>
          <mesh castShadow position={[0.22, -0.15, 0.02]}>
            <boxGeometry args={[0.1, 0.42, 0.26]} />
            <meshStandardMaterial color={color} roughness={0.6} />
          </mesh>
          <mesh castShadow position={[0, -0.18, -0.16]}>
            <boxGeometry args={[0.44, 0.46, 0.12]} />
            <meshStandardMaterial color={color} roughness={0.6} />
          </mesh>
        </group>
      )}

      {estilo === 'rizado' && (
        <group>
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

function oscurecerHex(hex: string, factor = 0.6): string {
  try {
    const col = new THREE.Color(hex);
    col.multiplyScalar(factor);
    return `#${col.getHexString()}`;
  } catch {
    return hex;
  }
}

function oscurecerColor(hex: string): THREE.Color {
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

function esPosicionValida(
  pos: THREE.Vector3,
  isAula: boolean = false,
  zonasBloqueadasCampus?: ZonaBloqueada[],
  mitadAnchoIslaAcademica?: number
): boolean {
  const x = pos.x;
  const z = pos.z;

  if (isAula) {
    if (Math.abs(x) > 19.2 || Math.abs(z) > 19.2) return false;
    // 2. Colisión con Escritorio del Docente (Mesa frontal: x: ±1.8, z: -13.8 a -12.2)
    if (Math.abs(x) < 1.8 && z >= -13.8 && z <= -12.2) {
      return false;
    }

    const pupitresX = [-8.5, -3, 3, 8.5];
    const pupitresZ = [-5, 0, 5];
    for (const px of pupitresX) {
      for (const pz of pupitresZ) {
        if (Math.abs(x - px) < 0.65 && z >= pz - 0.45 && z <= pz + 0.35) {
          return false;
        }
      }
    }

    if (Math.hypot(x - (-16), z - 12) < 2.2) return false;
    if (Math.hypot(x - 16, z - 12) < 2.2) return false;
    if (x <= -16.2 && z >= -12.5 && z <= -7.5) return false;
    if (x >= 16.2 && z >= -12.5 && z <= -7.5) return false;

    return true;
  }

  // El límite de la Isla 2 acompaña el ancho real calculado por
  // calcularMitadAnchoIsla (crece junto con los bloques de aulas); si no se
  // provee (avatares remotos, por ejemplo) se usa el ancho mínimo original.
  const mitadIslaAcademica = mitadAnchoIslaAcademica ?? 18.5;
  const enIslaSocial = Math.abs(x) <= 10.5 && z >= -0.8 && z <= 14.8;
  const enIslaAcademica = Math.abs(x) <= mitadIslaAcademica && z >= -41.8 && z <= -12.2;
  const enPuente = Math.abs(x) <= 1.9 && z >= -12.2 && z <= -0.8;

  if (!enIslaSocial && !enIslaAcademica && !enPuente) return false;

  const distFuente = Math.hypot(x - 0, z - 7);
  if (distFuente < 2.3) return false;

  // Cuerpo de cada edificio de aula, calculado en vivo a partir del layout
  // real (agrupado por docente) en vez de rectángulos fijos que asumían la
  // vieja grilla de 4 columnas.
  if (zonasBloqueadasCampus) {
    for (const zona of zonasBloqueadasCampus) {
      if (Math.abs(x - zona.x) < zona.mitadX && Math.abs(z - zona.z) < zona.mitadZ) return false;
    }
  }

  return true;
}

export default AvatarModel;
