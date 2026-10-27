import * as THREE from 'three';

// Texturas del campus (CAMPUS-01), dibujadas en un canvas en vez de bajar
// imágenes: pesan casi nada, se ven igual en cualquier resolución de
// pantalla y se ajustan con código. Cada una se crea una vez por pestaña y se
// comparte entre todas las mallas que la usan; las variantes con distinta
// repetición son clones que comparten la misma imagen en la GPU.

type Dibujo = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

const base = new Map<string, THREE.CanvasTexture>();
const repetidas = new Map<string, THREE.Texture>();

// Variación determinista: la misma textura en cada carga
function aleatorio(semilla: number) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function lienzo(nombre: string, w: number, h: number, dibujar: Dibujo): THREE.CanvasTexture {
  let t = base.get(nombre);
  if (!t) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    dibujar(canvas.getContext('2d')!, w, h);
    t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    base.set(nombre, t);
  }
  return t;
}

/** La textura `nombre` repetida rx × ry veces sobre la cara. */
export function textura(nombre: NombreTextura, rx = 1, ry = 1): THREE.Texture {
  const clave = `${nombre}:${rx.toFixed(3)}:${ry.toFixed(3)}`;
  let t = repetidas.get(clave);
  if (!t) {
    const original = DIBUJOS[nombre]();
    t = original.clone();
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    repetidas.set(clave, t);
  }
  return t;
}

// --- Dibujos ----------------------------------------------------------------

const TERRACOTA = '#b4583a';

function ladrillos(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alto: number, largo: number, color: string, junta: string, semilla: number) {
  const r = aleatorio(semilla);
  ctx.fillStyle = junta;
  ctx.fillRect(x, y, w, h);
  for (let fila = 0, yy = y; yy < y + h; fila++, yy += alto) {
    const desfase = fila % 2 ? largo / 2 : 0;
    for (let xx = x - desfase; xx < x + w; xx += largo) {
      const v = 0.9 + r() * 0.18;
      ctx.fillStyle = sombrear(color, v);
      ctx.fillRect(Math.max(x, xx + 1), yy + 1, Math.min(largo - 2, x + w - xx - 1), alto - 2);
    }
  }
}

function sombrear(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

// Relieve en ladrillo (motivo escalonado andino) con luz de arriba
function relieve(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const claro = sombrear(TERRACOTA, 1.22);
  const oscuro = sombrear(TERRACOTA, 0.62);
  const marco = (xx: number, yy: number, ww: number, hh: number, g: number) => {
    ctx.fillStyle = claro;
    ctx.fillRect(xx, yy, ww, g);
    ctx.fillRect(xx, yy, g, hh);
    ctx.fillStyle = oscuro;
    ctx.fillRect(xx, yy + hh - g, ww, g);
    ctx.fillRect(xx + ww - g, yy, g, hh);
  };
  marco(x, y, w, h, 5);
  marco(x + 14, y + 14, w - 28, h - 28, 4);
  // Escalones en las esquinas y rombo al centro
  const cx = x + w / 2;
  const cy = y + h / 2;
  for (let i = 0; i < 3; i++) {
    const s = 10 + i * 9;
    ctx.fillStyle = i % 2 ? oscuro : claro;
    ctx.fillRect(cx - s - 34, cy - 4 - i * 3, s, 8 + i * 6);
    ctx.fillRect(cx + 34, cy - 4 - i * 3, s, 8 + i * 6);
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = claro;
  ctx.fillRect(-16, -16, 32, 32);
  ctx.fillStyle = oscuro;
  ctx.fillRect(-9, -9, 18, 18);
  ctx.restore();
}

function ventana(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, hojas: number, semilla: number) {
  const r = aleatorio(semilla);
  ctx.fillStyle = '#f1efe9';
  ctx.fillRect(x - 6, y - 6, w + 12, h + 12);
  ctx.fillStyle = '#1e2633';
  ctx.fillRect(x, y, w, h);
  const ancho = w / hojas;
  for (let i = 0; i < hojas; i++) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    const luz = r() < 0.25;
    g.addColorStop(0, luz ? '#cbd5e1' : '#3b4a5e');
    g.addColorStop(1, luz ? '#94a3b8' : '#1f2937');
    ctx.fillStyle = g;
    ctx.fillRect(x + i * ancho + 3, y + 3, ancho - 6, h - 6);
    // Cortina
    if (r() < 0.7) {
      ctx.fillStyle = 'rgba(148,163,184,0.55)';
      ctx.fillRect(x + i * ancho + 3, y + 3, (ancho - 6) * (0.4 + r() * 0.6), h - 6);
    }
    // Reflejo
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(x + i * ancho + 3, y + h * 0.6);
    ctx.lineTo(x + i * ancho + ancho * 0.5, y + 3);
    ctx.lineTo(x + i * ancho + ancho * 0.75, y + 3);
    ctx.lineTo(x + i * ancho + 3, y + h * 0.95);
    ctx.fill();
  }
  ctx.fillStyle = '#111827';
  for (let i = 1; i < hojas; i++) ctx.fillRect(x + i * ancho - 2, y, 4, h);
}

const DIBUJOS = {
  // Un módulo de fachada del edificio antiguo: 4,5 m × 3,2 m (un piso)
  fachadaAntigua: () =>
    lienzo('fachadaAntigua', 512, 364, (ctx, w, h) => {
      ladrillos(ctx, 0, 0, w, h, 12, 34, TERRACOTA, sombrear(TERRACOTA, 1.12), 7);
      ventana(ctx, 40, 22, w - 80, 168, 3, 11);
      // Alféizar blanco
      ctx.fillStyle = '#f5f3ee';
      ctx.fillRect(28, 196, w - 56, 8);
      relieve(ctx, 20, 222, w - 40, 128);
    }),
  // Planta baja del antiguo: revoque blanco con ventanas de cuadrícula
  plantaBaja: () =>
    lienzo('plantaBaja', 512, 410, (ctx, w, h) => {
      const r = aleatorio(3);
      ctx.fillStyle = '#ece9e2';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 1400; i++) {
        ctx.fillStyle = `rgba(0,0,0,${r() * 0.035})`;
        ctx.fillRect(r() * w, r() * h, 2, 2);
      }
      ctx.fillStyle = '#d6d2c8';
      ctx.fillRect(0, h - 26, w, 26);
      const x = 120;
      const y = 70;
      ctx.fillStyle = '#2b2f36';
      ctx.fillRect(x - 6, y - 6, 284, 184);
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(x, y, 272, 172);
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 2; j++) {
          const g = ctx.createLinearGradient(0, y, 0, y + 172);
          g.addColorStop(0, '#5b6b80');
          g.addColorStop(1, '#2a3443');
          ctx.fillStyle = g;
          ctx.fillRect(x + 6 + i * 134, y + 6 + j * 82, 126, 76);
        }
    }),
  // Pared de ladrillo visto del pasillo (como en el bloque C/E)
  ladrillo: () =>
    lienzo('ladrillo', 256, 256, (ctx, w, h) => ladrillos(ctx, 0, 0, w, h, 16, 48, '#bf6a40', '#d9c3ad', 21)),
  // Muro de terracota liso (laterales, culatas)
  terracota: () =>
    lienzo('terracota', 256, 256, (ctx, w, h) => ladrillos(ctx, 0, 0, w, h, 12, 34, TERRACOTA, sombrear(TERRACOTA, 1.12), 5)),
  // Muro curtido del edificio nuevo: 4 m × 4 m de vidrio oscuro con perfiles
  vidrio: () =>
    lienzo('vidrio', 512, 512, (ctx, w, h) => {
      const r = aleatorio(17);
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#1b2330');
      g.addColorStop(1, '#0d1117');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const cols = 4;
      const filas = 4;
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < filas; j++) {
          if (r() < 0.22) {
            ctx.fillStyle = r() < 0.5 ? 'rgba(226,232,240,0.55)' : 'rgba(148,163,184,0.35)';
            ctx.fillRect((i * w) / cols + 4, (j * h) / filas + 4, w / cols - 8, h / filas - 8);
          }
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          ctx.fillRect((i * w) / cols + 4, (j * h) / filas + 4, w / cols - 8, 10);
        }
      ctx.fillStyle = '#9aa3ad';
      for (let i = 0; i <= cols; i++) ctx.fillRect((i * w) / cols - 2, 0, 4, h);
      for (let j = 0; j <= filas; j++) ctx.fillRect(0, (j * h) / filas - 2, w, 4);
    }),
  // Paneles de aluminio compuesto gris del edificio nuevo
  panelGris: () =>
    lienzo('panelGris', 256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#9ca3a9';
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.12)');
      g.addColorStop(1, 'rgba(0,0,0,0.08)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#6b7280';
      ctx.fillRect(0, h / 2 - 2, w, 3);
      ctx.fillRect(w / 2 - 2, 0, 3, h);
      ctx.fillRect(0, 0, w, 3);
      ctx.fillRect(0, 0, 3, h);
    }),
  // Baldosa blanca de 60 cm (patio, pasillos, aulas)
  baldosa: () =>
    lienzo('baldosa', 256, 256, (ctx, w, h) => {
      const r = aleatorio(9);
      const n = 4;
      ctx.fillStyle = '#c9d0d8';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          ctx.fillStyle = sombrear('#eef1f4', 0.97 + r() * 0.04);
          ctx.fillRect((i * w) / n + 1.5, (j * h) / n + 1.5, w / n - 3, h / n - 3);
        }
    }),
  // Teja colonial vista desde la calle
  teja: () =>
    lienzo('teja', 256, 256, (ctx, w, h) => {
      const r = aleatorio(13);
      ctx.fillStyle = '#7a2f1c';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 22)
        for (let x = (y / 22) % 2 ? -16 : 0; x < w; x += 32) {
          const g = ctx.createLinearGradient(x, 0, x + 30, 0);
          const c = sombrear('#b5502e', 0.85 + r() * 0.25);
          g.addColorStop(0, sombrear('#b5502e', 0.6));
          g.addColorStop(0.5, c);
          g.addColorStop(1, sombrear('#b5502e', 0.65));
          ctx.fillStyle = g;
          ctx.fillRect(x + 1, y + 1, 30, 20);
        }
    }),
  asfalto: () =>
    lienzo('asfalto', 256, 256, (ctx, w, h) => {
      const r = aleatorio(29);
      ctx.fillStyle = '#4b4f55';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.1)';
        ctx.fillRect(r() * w, r() * h, 2, 2);
      }
    }),
  // Vereda de losetas de cemento
  vereda: () =>
    lienzo('vereda', 256, 256, (ctx, w, h) => {
      const r = aleatorio(31);
      ctx.fillStyle = '#9ea1a3';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++) {
          ctx.fillStyle = sombrear('#c3c5c4', 0.93 + r() * 0.1);
          ctx.fillRect(i * 64 + 2, j * 64 + 2, 60, 60);
        }
    }),
  // La cancha completa (no se repite): 24 m × 16 m
  cancha: () =>
    lienzo('cancha', 1024, 683, (ctx, w, h) => {
      ctx.fillStyle = '#2f4f8f';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2a63b5';
      ctx.fillRect(40, 40, w - 80, h - 80);
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 6;
      ctx.strokeRect(40, 40, w - 80, h - 80);
      ctx.beginPath();
      ctx.moveTo(w / 2, 40);
      ctx.lineTo(w / 2, h - 40);
      ctx.stroke();
      ctx.fillStyle = '#e8873a';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 70, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (const lado of [1, -1]) {
        const x = lado === 1 ? 40 : w - 40;
        ctx.beginPath();
        ctx.arc(x, h / 2, 230, -Math.PI / 2, Math.PI / 2, lado !== 1);
        ctx.stroke();
        ctx.fillStyle = '#e8873a';
        const ancho = 150;
        ctx.fillRect(lado === 1 ? x : x - ancho, h / 2 - 60, ancho, 120);
        ctx.strokeRect(lado === 1 ? x : x - ancho, h / 2 - 60, ancho, 120);
        ctx.beginPath();
        ctx.arc(lado === 1 ? x + ancho : x - ancho, h / 2, 60, 0, Math.PI * 2);
        ctx.stroke();
      }
    }),
  // Pasto de los alrededores
  pasto: () =>
    lienzo('pasto', 256, 256, (ctx, w, h) => {
      const r = aleatorio(41);
      ctx.fillStyle = '#6f8f3f';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 3000; i++) {
        ctx.fillStyle = r() < 0.5 ? 'rgba(160,190,90,0.35)' : 'rgba(60,80,30,0.3)';
        ctx.fillRect(r() * w, r() * h, 2, 3);
      }
    }),
  // Casas coloniales de enfrente: muro blanco con ventanas y balcones
  casaColonial: () =>
    lienzo('casaColonial', 512, 512, (ctx, w, h) => {
      const r = aleatorio(53);
      ctx.fillStyle = '#f2efe8';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 1500; i++) {
        ctx.fillStyle = `rgba(80,60,40,${r() * 0.04})`;
        ctx.fillRect(r() * w, r() * h, 3, 3);
      }
      ctx.fillStyle = '#c8bfae';
      ctx.fillRect(0, h - 40, w, 40);
      for (const x of [70, 300]) {
        for (const y of [60, 290]) {
          ctx.fillStyle = '#4b3a2a';
          ctx.fillRect(x, y, 140, 170);
          ctx.fillStyle = '#2d3748';
          ctx.fillRect(x + 10, y + 10, 120, 150);
          ctx.fillStyle = '#5a7a4a';
          ctx.fillRect(x + 10, y + 10, 26, 150);
          ctx.fillRect(x + 104, y + 10, 26, 150);
          if (y === 60) {
            ctx.fillStyle = '#3b2a1c';
            ctx.fillRect(x - 12, y + 160, 164, 10);
            for (let b = x - 8; b < x + 150; b += 14) ctx.fillRect(b, y + 120, 4, 42);
          }
        }
      }
    }),
} satisfies Record<string, () => THREE.CanvasTexture>;

export type NombreTextura = keyof typeof DIBUJOS;

/** Letrero de la universidad: letras claras sobre fondo negro, como el del frontis nuevo. */
export function texturaLetreroUPDS(): THREE.CanvasTexture {
  return lienzo('letreroUPDS', 1024, 160, (ctx, w, h) => {
    ctx.fillStyle = '#0b0d10';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(191,219,254,0.9)';
    ctx.shadowBlur = 14;
    ctx.font = '600 44px sans-serif';
    ctx.fillText('UNIVERSIDAD PRIVADA', w / 2, h * 0.3);
    ctx.font = '800 70px sans-serif';
    ctx.fillText('DOMINGO SAVIO', w / 2, h * 0.7);
  });
}
