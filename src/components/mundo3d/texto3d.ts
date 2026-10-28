import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

export interface OpcionesTexto {
  ancho?: number;
  alto?: number;
  fondo?: string;
  color?: string;
  fuente?: string;
}

/**
 * Crea una textura de canvas con texto, usada para letreros/etiquetas
 * flotantes en el mundo 3D (nombre del avatar, nombres de las salas, etc).
 */
export function crearTexturaTexto(texto: string, opciones: OpcionesTexto = {}): THREE.CanvasTexture {
  const {
    ancho = 512,
    alto = 128,
    fondo = 'rgba(0,0,0,0.7)',
    color = '#ffffff',
    fuente = 'bold 44px sans-serif',
  } = opciones;

  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = fondo;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = fuente;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, canvas.width / 2, canvas.height / 2);
  }

  const textura = new THREE.CanvasTexture(canvas);
  // Los colores del canvas están en sRGB: sin esto el texto y los fondos de
  // los letreros salen lavados, más claros de lo que se pidieron
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.needsUpdate = true;
  return textura;
}

/**
 * Igual que crearTexturaTexto, pero para usar dentro de un componente: crea la
 * textura una sola vez por texto/opciones y la libera de la GPU al cambiar o
 * desmontarse. Llamar a crearTexturaTexto directo en el JSX crea (y sube a la
 * GPU) una textura nueva en cada render sin liberar nunca la anterior; con 30
 * avatares moviéndose eso eran cientos de texturas por segundo.
 */
export function useTexturaTexto(texto: string, opciones: OpcionesTexto = {}): THREE.CanvasTexture {
  const { ancho, alto, fondo, color, fuente } = opciones;
  const textura = useMemo(
    () => crearTexturaTexto(texto, { ancho, alto, fondo, color, fuente }),
    [texto, ancho, alto, fondo, color, fuente]
  );
  useEffect(() => () => textura.dispose(), [textura]);
  return textura;
}
