import * as THREE from 'three';

interface OpcionesTexto {
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
  textura.needsUpdate = true;
  return textura;
}
