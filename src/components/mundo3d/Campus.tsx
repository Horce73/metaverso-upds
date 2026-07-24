import React from 'react';
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

const CENTRO_PATIO: [number, number, number] = [0, 0, -20];

// Genera una grilla de pupitres (3 columnas x 3 filas) para un aula
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

export const Campus: React.FC = () => {
  return (
    <group>
      {/* Césped general del campus */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, -12]} receiveShadow>
        <planeGeometry args={[70, 70]} />
        <meshStandardMaterial color="#5c9e5c" />
      </mesh>

      {/* Camino principal desde la entrada hasta el patio central */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -12]} receiveShadow>
        <planeGeometry args={[3, 20]} />
        <meshStandardMaterial color="#b7ada0" />
      </mesh>

      {/* Patio / plaza central */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={CENTRO_PATIO} receiveShadow>
        <planeGeometry args={[16, 16]} />
        <meshStandardMaterial color="#c9c2b4" />
      </mesh>

      <LetreroCampus />

      {/* Aula 101 */}
      <Edificio
        posicion={[-13, 0, -12]}
        mirarHacia={CENTRO_PATIO}
        ancho={7}
        profundidad={7}
        nombre="Aula 101"
      >
        <Pizarra position={[0, 1.3, -3.4]} />
        <EscritorioProfesor position={[0, 0, -2.6]} />
        {POSICIONES_PUPITRES.map((pos, i) => (
          <Pupitre key={i} position={pos} />
        ))}
      </Edificio>

      {/* Aula 102 */}
      <Edificio
        posicion={[13, 0, -12]}
        mirarHacia={CENTRO_PATIO}
        ancho={7}
        profundidad={7}
        nombre="Aula 102"
      >
        <Pizarra position={[0, 1.3, -3.4]} />
        <EscritorioProfesor position={[0, 0, -2.6]} />
        {POSICIONES_PUPITRES.map((pos, i) => (
          <Pupitre key={i} position={pos} />
        ))}
      </Edificio>

      {/* Sala de descanso */}
      <Edificio
        posicion={[-13, 0, -30]}
        mirarHacia={CENTRO_PATIO}
        ancho={7}
        profundidad={7}
        colorPared="#f0e6d2"
        colorTecho="#4f7f6b"
        nombre="Sala de Descanso"
      >
        <Sofa position={[-2, 0, -2.8]} color="#c0392b" />
        <Sofa position={[2, 0, -2.8]} rotation={[0, Math.PI, 0]} color="#2980b9" />
        <MesaRedonda position={[0, 0, -1.5]} />
        <MaquinaExpendedora position={[3, 0.85, 2.8]} />
      </Edificio>

      {/* Sala de decanos */}
      <Edificio
        posicion={[13, 0, -30]}
        mirarHacia={CENTRO_PATIO}
        ancho={7}
        profundidad={7}
        colorPared="#e5dccb"
        colorTecho="#5b3a29"
        colorPiso="#8a6b4a"
        nombre="Sala de Decanos"
      >
        <EscritorioDecano position={[0, 0, -2.4]} />
        <SillaOficina position={[0, 0, -1.6]} rotation={[0, Math.PI, 0]} />
        <SillaOficina position={[-1, 0, -0.6]} />
        <SillaOficina position={[1, 0, -0.6]} />
        <Estanteria position={[0, 0, -3.35]} />
      </Edificio>
    </group>
  );
};

function LetreroCampus() {
  return (
    <sprite position={[0, 4.5, -20]} scale={[8, 1.6, 1]}>
      <spriteMaterial
        attach="material"
        map={crearTexturaTexto('Campus Virtual UPDS', { ancho: 900, alto: 180, fuente: 'bold 70px sans-serif' })}
        transparent
      />
    </sprite>
  );
}

export default Campus;
