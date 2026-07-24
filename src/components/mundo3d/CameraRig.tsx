import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const DISTANCIA_MAX = 4.5;
const ALTURA = 2.4;
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

  useFrame((_state, delta) => {
    const estado = avatarEstadoRef.current;
    if (!estado || !estado.posicion) return;

    const { posicion, angulo } = estado;

    const dirX = Math.sin(angulo);
    const dirZ = Math.cos(angulo);

    direccionRayo.current.set(-dirX, 0, -dirZ).normalize();
    origenRayo.current.set(posicion.x, posicion.y + ALTURA, posicion.z);

    let distancia = DISTANCIA_MAX;
    try {
      raycaster.current.set(origenRayo.current, direccionRayo.current);
      raycaster.current.far = DISTANCIA_MAX;
      const intersecciones = raycaster.current.intersectObjects(scene.children, true);
      const golpeAPared = intersecciones.find((i) => i.object.userData?.esPared);
      if (golpeAPared && golpeAPared.distance < DISTANCIA_MAX) {
        distancia = Math.max(1, golpeAPared.distance - MARGEN_PARED);
      }
    } catch (err) {
      console.warn('Error en la colisión de cámara:', err);
    }

    posicionDeseada.current.set(
      posicion.x - dirX * distancia,
      posicion.y + ALTURA,
      posicion.z - dirZ * distancia
    );

    camera.position.lerp(posicionDeseada.current, Math.min(1, delta * LERP_CAMARA));

    puntoMira.current.set(posicion.x, posicion.y + 1.4, posicion.z);
    camera.lookAt(puntoMira.current);
  });

  return null;
};

export default CameraRig;
