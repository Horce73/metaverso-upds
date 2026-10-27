import * as THREE from 'three';
import type { Apariencia } from './personalizacion.js';

// Cara del avatar (AVATAR-01): ojos, cejas, boca y rubor dibujados en un
// canvas que se pega al frente de la cabeza. Dos celdas lado a lado: la cara
// con su expresión y la misma con los ojos cerrados, para pestañear moviendo
// el offset de la textura sin redibujar. Una textura por combinación,
// compartida por todos los avatares que la usan; cada avatar se queda con un
// clon (comparte la imagen en la GPU) para mover su propio offset.

const CELDA = 128;
const cache = new Map<string, THREE.CanvasTexture>();

function oscurecer(hex: string, f: number): string {
  const c = new THREE.Color(hex).multiplyScalar(f);
  return `#${c.getHexString()}`;
}

type Rostro = Apariencia['rostro'];

function ojo(ctx: CanvasRenderingContext2D, x: number, y: number, r: Rostro, cerrado: boolean) {
  const grande = r.ojos === 'grandes' || r.expresion === 'sorprendido';
  const rx = r.ojos === 'almendrados' ? 13 : grande ? 13 : 10.5;
  const ry = r.ojos === 'almendrados' ? 7.5 : grande ? 15 : 12;
  if (cerrado) {
    ctx.strokeStyle = '#2a1a12';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y - 2, rx, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    return;
  }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  const iris = Math.min(rx, ry) * 0.8;
  ctx.fillStyle = r.colorOjos;
  ctx.beginPath();
  ctx.arc(x, y + 1, iris, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0b0b0b';
  ctx.beginPath();
  ctx.arc(x, y + 1, iris * 0.48, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.arc(x - iris * 0.35, y - iris * 0.35, iris * 0.28, 0, Math.PI * 2);
  ctx.fill();
  // Párpado superior: da forma y mirada
  ctx.strokeStyle = '#2a1a12';
  ctx.lineWidth = r.ojos === 'almendrados' ? 3.5 : 2.5;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
}

function ceja(ctx: CanvasRenderingContext2D, x: number, y: number, lado: 1 | -1, r: Rostro, color: string) {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = r.cejas === 'gruesas' ? 7 : r.cejas === 'arqueadas' ? 4.5 : 3.5;
  const sube = r.expresion === 'sorprendido' ? -6 : r.expresion === 'serio' ? 2 : 0;
  ctx.beginPath();
  if (r.cejas === 'arqueadas') {
    ctx.moveTo(x - 12 * lado, y + 4 + sube);
    ctx.quadraticCurveTo(x, y - 7 + sube, x + 13 * lado, y + 2 + sube);
  } else {
    const inclinacion = r.expresion === 'serio' ? 3 : 0;
    ctx.moveTo(x - 12 * lado, y + 2 + sube + inclinacion);
    ctx.quadraticCurveTo(x, y - 2 + sube, x + 12 * lado, y + 1 + sube);
  }
  ctx.stroke();
}

function boca(ctx: CanvasRenderingContext2D, r: Rostro) {
  const x = CELDA / 2;
  const y = 92;
  ctx.lineCap = 'round';
  if (r.expresion === 'sorprendido') {
    ctx.fillStyle = '#5b1e1e';
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 7, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (r.expresion === 'serio') {
    ctx.strokeStyle = '#6b2a24';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x - 11, y);
    ctx.lineTo(x + 11, y);
    ctx.stroke();
    return;
  }
  // Sonrisa abierta con un poco de dientes
  ctx.fillStyle = '#7a2a25';
  ctx.beginPath();
  ctx.moveTo(x - 15, y - 3);
  ctx.quadraticCurveTo(x, y + 17, x + 15, y - 3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 10, y - 3, 20, 4);
}

function dibujar(ctx: CanvasRenderingContext2D, r: Rostro, colorCejas: string, offsetX: number, cerrados: boolean) {
  ctx.save();
  ctx.translate(offsetX, 0);
  if (r.rubor) {
    ctx.fillStyle = 'rgba(232, 106, 106, 0.32)';
    for (const x of [26, CELDA - 26]) {
      ctx.beginPath();
      ctx.ellipse(x, 80, 11, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ceja(ctx, 40, 34, 1, r, colorCejas);
  ceja(ctx, CELDA - 40, 34, -1, r, colorCejas);
  ojo(ctx, 40, 56, r, cerrados);
  // Guiño: el ojo derecho (de quien mira) cerrado aunque no pestañee
  ojo(ctx, CELDA - 40, 56, r, cerrados || r.expresion === 'guiño');
  boca(ctx, r);
  ctx.restore();
}

/** Textura de la cara (celda izquierda: ojos abiertos; derecha: cerrados). */
export function texturaRostro(a: Apariencia): THREE.CanvasTexture {
  const colorCejas = a.cabello.estilo === 'calvo' ? '#3a2618' : oscurecer(a.cabello.color, 0.8);
  const clave = `${JSON.stringify(a.rostro)}|${colorCejas}`;
  let t = cache.get(clave);
  if (!t) {
    const canvas = document.createElement('canvas');
    canvas.width = CELDA * 2;
    canvas.height = CELDA;
    const ctx = canvas.getContext('2d')!;
    dibujar(ctx, a.rostro, colorCejas, 0, false);
    dibujar(ctx, a.rostro, colorCejas, CELDA, true);
    t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.repeat.set(0.5, 1);
    cache.set(clave, t);
  }
  return t;
}
