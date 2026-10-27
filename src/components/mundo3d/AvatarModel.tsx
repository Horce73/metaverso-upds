import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useKeyboardControls } from './useKeyboardControls.js';
import { estadoJoystick } from './touchControls.js';
import { posicionEn, VELOCIDAD_CAMINAR } from './interpolacion.js';
import { estadoRemoto, registrarMovimiento } from './posicionesRemotas.js';
import { Letrero } from './Letrero.js';
import { useCalidad } from './useCalidad.js';
import { type PersonalizacionAvatar, PERSONALIZACION_POR_DEFECTO, normalizarApariencia, claveApariencia } from './personalizacion.js';
import { CuerpoAvatar } from './CuerpoAvatar.js';
import { texturaRostro } from './rostroAvatar.js';
import { esTransitable, type PlanoCampus } from './planoCampus.js';

export { type PersonalizacionAvatar, PERSONALIZACION_POR_DEFECTO };

const VELOCIDAD = VELOCIDAD_CAMINAR;
const ROTACION_LERP = 10;
const FRECUENCIA_CAMINAR = 9;
const AMPLITUD_CAMINAR = 0.6;


interface AvatarModelProps {
  nombre: string;
  personalizacion?: PersonalizacionAvatar;
  position?: [number, number, number];
  rotation?: [number, number, number];
  isLocal?: boolean;
  isAula?: boolean;
  estaSentado?: boolean;
  posicionSentado?: { x: number; y: number; z: number; angulo: number } | null;
  /** Plano del campus (CAMPUS-01): por dónde se puede caminar fuera del aula. */
  planoCampus?: PlanoCampus;
  onUpdatePosicion?: (posicion: THREE.Vector3, angulo: number) => void;
  /** Nivel de voz actual (0..1) de esta persona; enciende el anillo de "está hablando". */
  nivelVoz?: () => number;
  /** Avatar remoto: su socket, para leer la posición en posicionesRemotas. */
  socketId?: string;
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
  planoCampus,
  onUpdatePosicion,
  nivelVoz,
  socketId,
}) => {
  const grupoRef = useRef<THREE.Group>(null);
  // Avatar remoto: posición interpolada del frame anterior, para saber si
  // está caminando (las muestras viven en posicionesRemotas).
  const posPreviaRemotaRef = useRef<THREE.Vector3 | null>(null);
  // Nivel de detalle (3D-02) de un avatar remoto: lejos de la cámara se
  // ocultan las piezas marcadas userData.detalle y no proyecta sombra.
  const lodRef = useRef<{ lejos: boolean | null; detalles: THREE.Object3D[]; conSombra: THREE.Mesh[] } | null>(null);
  const { distanciaDetalle } = useCalidad();
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

  // Apariencia completa y válida (AVATAR-01), venga de la versión que venga.
  // La clave evita recalcular cuando llega el mismo objeto con otra identidad.
  const clave = claveApariencia(normalizarApariencia(personalizacion));
  const apariencia = useMemo(() => normalizarApariencia(JSON.parse(clave)), [clave]);
  const escala = apariencia.cuerpo.altura;

  // Cara: la textura se comparte entre avatares iguales; el clon permite que
  // cada uno mueva su offset para pestañear por su cuenta
  const rostro = useMemo(() => {
    const t = texturaRostro(apariencia).clone();
    t.needsUpdate = true;
    return t;
  }, [apariencia]);
  useEffect(() => () => rostro.dispose(), [rostro]);

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

  // Avatar remoto que todavía no se movió desde que entramos: su posición de
  // llegada sirve de punto de partida, sin hora (3D-03).
  useEffect(() => {
    if (isLocal || !socketId || estadoRemoto(socketId)) return;
    registrarMovimiento(socketId, [position[0], position[1], position[2]], rotation[1] || 0, estaSentado, undefined, performance.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cabello y accesorios se remontan al cambiar la apariencia
  useEffect(() => {
    lodRef.current = null;
  }, [personalizacion]);

  // Teletransportación inmediata a la silla al sentarse
  useEffect(() => {
    if (estaSentado && posicionSentado && grupoRef.current) {
      grupoRef.current.position.set(posicionSentado.x, posicionSentado.y, posicionSentado.z);
      grupoRef.current.rotation.y = posicionSentado.angulo;
      direccionActual.current.set(Math.sin(posicionSentado.angulo), 0, Math.cos(posicionSentado.angulo));
      onUpdatePosicion?.(grupoRef.current.position, posicionSentado.angulo);
    }
  }, [estaSentado, posicionSentado, onUpdatePosicion]);

  const aplicarNivelDetalle = (grupo: THREE.Group, lejos: boolean) => {
    if (!lodRef.current) {
      const detalles: THREE.Object3D[] = [];
      const conSombra: THREE.Mesh[] = [];
      grupo.traverse((o) => {
        if (o.userData.detalle) detalles.push(o);
        // Se anota la primera vez: al volver a recorrer (cambio de apariencia
        // estando lejos) las mallas viejas ya tienen castShadow apagado.
        if (o.userData.sombra === undefined) o.userData.sombra = o.castShadow;
        if ((o as THREE.Mesh).isMesh && o.userData.sombra) conSombra.push(o as THREE.Mesh);
      });
      lodRef.current = { lejos: null, detalles, conSombra };
    }
    const lod = lodRef.current;
    if (lod.lejos === lejos) return;
    lod.lejos = lejos;
    lod.detalles.forEach((o) => (o.visible = !lejos));
    lod.conSombra.forEach((m) => (m.castShadow = !lejos));
  };

  useFrame((state, delta) => {
    if (!grupoRef.current) return;
    const remoto = isLocal || !socketId ? undefined : estadoRemoto(socketId);
    const sentado = remoto ? remoto.estaSentado : estaSentado;
    const tiempoGlobal = state.clock.getElapsedTime();

    // 1. Pestañeo Aleatorio
    if (tiempoGlobal > proximoPestaneoRef.current) {
      estaPestaneandoRef.current = true;
      duracionPestaneoRef.current = tiempoGlobal + 0.12;
      proximoPestaneoRef.current = tiempoGlobal + 4 + Math.random() * 3.5;
    } else if (estaPestaneandoRef.current && tiempoGlobal > duracionPestaneoRef.current) {
      estaPestaneandoRef.current = false;
    }

    rostro.offset.x = estaPestaneandoRef.current ? 0.5 : 0;

    let estaCaminando = false;

    if (isLocal) {
      if (!sentado) {
        const k = controles.current;
        const j = estadoJoystick;
        const adelante = k.adelante || j.adelante;
        const atras = k.atras || j.atras;
        const izquierda = k.izquierda || j.izquierda;
        const derecha = k.derecha || j.derecha;
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

          if (esPosicionValida(posDeseada, isAula, planoCampus)) {
            grupoRef.current.position.copy(posDeseada);
          } else {
            const posPruebaX = posActual.clone().add(new THREE.Vector3(mover.x, 0, 0));
            if (esPosicionValida(posPruebaX, isAula, planoCampus)) {
              grupoRef.current.position.copy(posPruebaX);
            } else {
              const posPruebaZ = posActual.clone().add(new THREE.Vector3(0, 0, mover.z));
              if (esPosicionValida(posPruebaZ, isAula, planoCampus)) {
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
      // 3D-03: se dibuja un poco en el pasado, entre las dos muestras que
      // rodean ese instante (ver interpolacion.ts), en vez de perseguir el
      // último paquete. El ángulo ya viene interpolado por el camino corto.
      const muestra = remoto ? posicionEn(remoto.interpolacion, performance.now()) : null;
      const posActual = grupoRef.current.position;
      if (muestra) {
        posActual.set(muestra.pos[0], muestra.pos[1], muestra.pos[2]);
        grupoRef.current.rotation.y = muestra.angulo;
      }

      aplicarNivelDetalle(grupoRef.current, posActual.distanceTo(camera.position) > distanciaDetalle);

      // Caminando = se desplazó este frame a más de 0,5 u/s (camina a 4)
      const previa = posPreviaRemotaRef.current;
      const desplazamiento = previa ? Math.hypot(posActual.x - previa.x, posActual.z - previa.z) : 0;
      if (previa) previa.copy(posActual);
      else posPreviaRemotaRef.current = posActual.clone();
      estaCaminando = delta > 0 && desplazamiento / delta > 0.5 && !sentado;

      if (estaCaminando) {
        tiempoAnimRef.current += delta;
        const objetivoSwing = Math.sin(tiempoAnimRef.current * FRECUENCIA_CAMINAR) * AMPLITUD_CAMINAR;
        const suavizado = Math.min(1, delta * 12);

        if (brazoDerRef.current) brazoDerRef.current.rotation.x = THREE.MathUtils.lerp(brazoDerRef.current.rotation.x, objetivoSwing, suavizado);
        if (brazoIzqRef.current) brazoIzqRef.current.rotation.x = THREE.MathUtils.lerp(brazoIzqRef.current.rotation.x, -objetivoSwing, suavizado);
        if (piernaDerRef.current) piernaDerRef.current.rotation.x = THREE.MathUtils.lerp(piernaDerRef.current.rotation.x, -objetivoSwing, suavizado);
        if (piernaIzqRef.current) piernaIzqRef.current.rotation.x = THREE.MathUtils.lerp(piernaIzqRef.current.rotation.x, objetivoSwing, suavizado);
      } else if (sentado) {
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
      if (sentado) {
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
        <CuerpoAvatar
          a={apariencia}
          rostro={rostro}
          refs={{ brazoDer: brazoDerRef, brazoIzq: brazoIzqRef, piernaDer: piernaDerRef, piernaIzq: piernaIzqRef }}
        />
      </group>

      {nivelVoz && <AnilloVoz nivelVoz={nivelVoz} />}
      <Etiqueta nombre={nombre} />
    </group>
  );
};

// Anillo en el piso que se enciende mientras la persona habla (VOZ-02). Lee el
// nivel en cada cuadro directo del AudioClient, sin pasar por el estado de
// React: con 30 avatares, un setState por cada cambio de nivel re-renderizaría
// la escena decenas de veces por segundo.
const UMBRAL_HABLA = 0.02;
// Mantener el anillo encendido un poco después de cada sílaba: sin esto
// parpadea en las pausas naturales del habla.
const RETENCION_HABLA_S = 0.35;

function AnilloVoz({ nivelVoz }: { nivelVoz: () => number }) {
  const mallaRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const retencionRef = useRef(0);
  const intensidadRef = useRef(0);

  useFrame((_, delta) => {
    const malla = mallaRef.current;
    const material = materialRef.current;
    if (!malla || !material) return;

    const nivel = nivelVoz();
    retencionRef.current = nivel > UMBRAL_HABLA ? RETENCION_HABLA_S : Math.max(0, retencionRef.current - delta);
    const objetivo = retencionRef.current > 0 ? 1 : 0;
    intensidadRef.current += (objetivo - intensidadRef.current) * Math.min(1, delta * 12);

    material.opacity = 0.85 * intensidadRef.current;
    malla.visible = intensidadRef.current > 0.01;
    malla.scale.setScalar(1 + Math.min(nivel * 2, 0.3));
  });

  return (
    <mesh ref={mallaRef} visible={false} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
      <ringGeometry args={[0.5, 0.62, 48]} />
      <meshBasicMaterial ref={materialRef} color="#22c55e" transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

function Etiqueta({ nombre }: { nombre: string }) {
  return <Letrero texto={nombre} position={[0, 2.8, 0]} scale={[1.5, 0.4, 1]} />;
}

function esPosicionValida(
  pos: THREE.Vector3,
  isAula: boolean = false,
  planoCampus?: PlanoCampus
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

  // Campus: dentro de lo transitable del plano (vereda, patio, cancha…) y
  // fuera de edificios, escalera, columnas y vehículos
  return !planoCampus || esTransitable(planoCampus, x, z);
}

export default AvatarModel;
