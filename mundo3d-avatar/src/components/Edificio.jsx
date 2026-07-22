import { crearTexturaTexto } from '../utils/texto3d'

/**
 * Edificio genérico de una sola planta, con 3 paredes + techo + piso
 * (el frente queda abierto para que el avatar pueda entrar caminando,
 * sin necesidad de un sistema de colisiones con puertas).
 *
 * Se orienta automáticamente para que el frente (lado abierto) mire
 * hacia `mirarHacia` (normalmente el centro del patio/plaza).
 */
export default function Edificio({
  posicion,
  mirarHacia,
  ancho = 8,
  profundidad = 8,
  alto = 3.2,
  colorPared = '#e8dcc8',
  colorTecho = '#a34b3f',
  colorPiso = '#c9b78f',
  nombre,
  children,
}) {
  const dx = mirarHacia[0] - posicion[0]
  const dz = mirarHacia[2] - posicion[2]
  const rotacionY = Math.atan2(dx, dz)

  const espesor = 0.2

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

      {/* Letrero con el nombre, sobre la entrada (lado abierto = +z local) */}
      {nombre && (
        <sprite position={[0, alto + 0.6, profundidad / 2 + 0.3]} scale={[3, 0.75, 1]}>
          <spriteMaterial attach="material" map={crearTexturaTexto(nombre)} transparent />
        </sprite>
      )}

      {children}
    </group>
  )
}
