import { useRef } from 'react'

/**
 * Puerta visual simple. La lógica del trigger (distancia, cooldown,
 * llamada a la API) vive en World.jsx para tener un solo lugar
 * de verdad sobre la posición del avatar y de la puerta.
 */
export default function Door({ position = [0, 0, -5] }) {
  const ref = useRef()

  return (
    <group ref={ref} position={position}>
      <mesh castShadow position={[0, 1.25, 0]}>
        <boxGeometry args={[1.2, 2.5, 0.15]} />
        <meshStandardMaterial color="#8b5a2b" />
      </mesh>
      {/* Marco */}
      <mesh position={[0, 1.25, 0.1]}>
        <ringGeometry args={[0, 0.05, 4]} />
        <meshStandardMaterial color="#4a2f18" />
      </mesh>
    </group>
  )
}
