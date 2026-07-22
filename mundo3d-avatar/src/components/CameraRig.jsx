import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const DISTANCIA_MAX = 4.5 // qué tan atrás queda la cámara como máximo
const ALTURA = 2.4 // qué tan alto queda la cámara
const LERP_CAMARA = 5
const MARGEN_PARED = 0.35 // separación mínima entre la cámara y una pared

/**
 * Cámara en tercera persona: se posiciona detrás del avatar en la
 * dirección hacia la que está mirando/caminando (no un offset fijo del
 * mundo), así que al girar y entrar a una sala, la cámara entra también
 * en vez de quedarse afuera mirando una pared.
 *
 * Además evita atravesar paredes: lanza un rayo desde el avatar hacia
 * atrás (hacia donde iría la cámara) y, si encuentra una pared antes de
 * llegar a la distancia máxima, acerca la cámara para quedar justo antes
 * de esa pared.
 *
 * `avatarEstadoRef` es { posicion: THREE.Vector3, angulo: number } — lo
 * actualiza Avatar.jsx en cada frame.
 */
export default function CameraRig({ avatarEstadoRef }) {
  const { camera, scene } = useThree()
  const posicionDeseada = useRef(new THREE.Vector3())
  const puntoMira = useRef(new THREE.Vector3())
  const raycaster = useRef(new THREE.Raycaster())
  const origenRayo = useRef(new THREE.Vector3())
  const direccionRayo = useRef(new THREE.Vector3())

  useFrame((state, delta) => {
    const estado = avatarEstadoRef.current
    if (!estado) return

    const { posicion, angulo } = estado

    // Dirección hacia la que camina/mira el avatar (ver Avatar.jsx)
    const dirX = Math.sin(angulo)
    const dirZ = Math.cos(angulo)

    // La cámara va detrás del avatar: dirección opuesta a hacia donde mira
    direccionRayo.current.set(-dirX, 0, -dirZ).normalize()

    // Punto de partida del rayo: un poco elevado, a la altura de la cámara,
    // ligeramente adelantado para no chocar con el propio cuerpo del avatar
    origenRayo.current.set(posicion.x, posicion.y + ALTURA, posicion.z)

    let distancia = DISTANCIA_MAX
    try {
      raycaster.current.set(origenRayo.current, direccionRayo.current)
      raycaster.current.far = DISTANCIA_MAX
      const intersecciones = raycaster.current.intersectObjects(scene.children, true)
      const golpeAPared = intersecciones.find((i) => i.object.userData?.esPared)
      if (golpeAPared && golpeAPared.distance < DISTANCIA_MAX) {
        distancia = Math.max(1, golpeAPared.distance - MARGEN_PARED)
      }
    } catch (err) {
      // Si el raycasting falla por algún motivo, no queremos romper el
      // resto del render: seguimos usando la distancia máxima normal.
      console.warn('Error en la colisión de cámara:', err)
    }

    posicionDeseada.current.set(
      posicion.x - dirX * distancia,
      posicion.y + ALTURA,
      posicion.z - dirZ * distancia
    )

    camera.position.lerp(posicionDeseada.current, Math.min(1, delta * LERP_CAMARA))

    puntoMira.current.set(posicion.x, posicion.y + 1.4, posicion.z)
    camera.lookAt(puntoMira.current)
  })

  return null
}
