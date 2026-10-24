import React from 'react';
import { useTexturaTexto, type OpcionesTexto } from './texto3d.js';

interface LetreroProps extends OpcionesTexto {
  texto: string;
  position: [number, number, number];
  scale: [number, number, number];
}

/** Sprite con texto que siempre mira a la cámara (nombres, carteles, avisos). */
export const Letrero: React.FC<LetreroProps> = ({ texto, position, scale, ...opciones }) => {
  const textura = useTexturaTexto(texto, opciones);
  return (
    <sprite position={position} scale={scale}>
      <spriteMaterial attach="material" map={textura} transparent />
    </sprite>
  );
};
