import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const LERP_CAMARA = 5;
const MARGEN_PARED = 0.35;

export interface AvatarEstadoRef {
  posicion: THREE.Vector3;
  angulo: number;
}

interface CameraRigProps {
  avatarEstadoRef: React.MutableRefObject<AvatarEstadoRef>;
}

export const CameraRig: React.FC<CameraRigProps> = ({ avatarEstadoRef }) => {
  const { camera, scene } = useThree();
  const posicionDeseada = useRef(new THREE.Vector3());
  const puntoMira = useRef(new THREE.Vector3());
  const raycaster = useRef(new THREE.Raycaster());
  const origenRayo = useRef(new THREE.Vector3());
  const direccionRayo = useRef(new THREE.Vector3());
  
  const pitchRef = useRef(0.22); // Ángulo vertical inicial (~12.6 grados)
  const distanciaRef = useRef(7.5); // Distancia por defecto más alejada (solicitado: ver mejor el entorno)

  // Efecto para controlar la rotación mediante arrastre (Pointer Events en window)
  useEffect(() => {
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;

    const onPointerDown = (e: PointerEvent) => {
      // Registrar arrastre solo con click izquierdo o toque
      if (e.button !== 0 && e.pointerType === 'mouse') return;

      // Solo arrastrar si el click inicial fue en el Canvas 3D
      const target = e.target as HTMLElement;
      if (!target || target.tagName !== 'CANVAS') return;

      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      prevX = e.clientX;
      prevY = e.clientY;

      const sensibilidad = 0.005;
      avatarEstadoRef.current.angulo -= dx * sensibilidad;
      // Limitar el ángulo vertical (pitch) para evitar giros imposibles
      pitchRef.current = Math.max(-0.15, Math.min(1.1, pitchRef.current + dy * sensibilidad));
    };

    const onPointerUp = () => {
      isDragging = false;
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [avatarEstadoRef]);

  // Efecto para controlar el Zoom con la rueda del ratón (Wheel Event en window)
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      // Sensibilidad del zoom
      const zoomSensibilidad = 0.005;
      // Limitar la distancia entre 3.0 (cerca) y 12.0 (lejos)
      distanciaRef.current = Math.max(3.0, Math.min(12.0, distanciaRef.current + e.deltaY * zoomSensibilidad));
    };

    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => {
      window.removeEventListener('wheel', handleWheel);
    };
  }, []);

  useFrame((_state, delta) => {
    const estado = avatarEstadoRef.current;
    if (!estado || !estado.posicion) return;

    const { posicion, angulo } = estado;
    const pitch = pitchRef.current;
    const distanciaObjetivo = distanciaRef.current;

    // Dirección esférica en 3D
    const dirX = Math.sin(angulo) * Math.cos(pitch);
    const dirY = Math.sin(pitch);
    const dirZ = Math.cos(angulo) * Math.cos(pitch);

    // El rayo va desde el centro del avatar (cabeza/pecho) hacia la cámara
    direccionRayo.current.set(-dirX, dirY, -dirZ).normalize();
    origenRayo.current.set(posicion.x, posicion.y + 1.4, posicion.z);

    let distancia = distanciaObjetivo;
    try {
      raycaster.current.camera = camera;
      raycaster.current.set(origenRayo.current, direccionRayo.current);
      raycaster.current.far = distanciaObjetivo;

      const paredes: THREE.Object3D[] = [];
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh && obj.userData?.esPared) {
          paredes.push(obj);
        }
      });

      if (paredes.length > 0) {
        const intersecciones = raycaster.current.intersectObjects(paredes, false);
        if (intersecciones.length > 0 && intersecciones[0].distance < distanciaObjetivo) {
          distancia = Math.max(1.5, intersecciones[0].distance - MARGEN_PARED);
        }
      }
    } catch (err) {
      console.warn('Error en la colisión de cámara:', err);
    }

    posicionDeseada.current.set(
      posicion.x - dirX * distancia,
      posicion.y + 1.4 + dirY * distancia,
      posicion.z - dirZ * distancia
    );

    camera.position.lerp(posicionDeseada.current, Math.min(1, delta * LERP_CAMARA));

    puntoMira.current.set(posicion.x, posicion.y + 1.4, posicion.z);
    camera.lookAt(puntoMira.current);
  });

  return null;
};

export default CameraRig;
