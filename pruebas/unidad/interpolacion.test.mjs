// Pruebas unitarias de la interpolación del movimiento remoto (3D-03).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  crearEstado,
  recibir,
  posicionEn,
  RETARDO_MIN_MS,
  RETARDO_MAX_MS,
  DISTANCIA_TELETRANSPORTE,
} from '../../src/components/mundo3d/interpolacion.ts';

const cerca = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// Generador determinista: las simulaciones de red dan siempre el mismo resultado
function rng(semilla) {
  let s = semilla;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

test('sin muestras no hay posición', () => {
  assert.equal(posicionEn(crearEstado(), 1000), null);
});

test('con una sola muestra se dibuja ahí', () => {
  const e = crearEstado();
  recibir(e, [3, 0, 4], 1, 1000, 1040);
  const p = posicionEn(e, 2000);
  assert.deepEqual(p.pos, [3, 0, 4]);
  assert.equal(p.angulo, 1);
});

test('dibuja en "ahora - desfase - retardo", entre las dos muestras que lo rodean', () => {
  const e = crearEstado();
  // Ambos paquetes tardan 40 ms: desfase 40, atraso 40 + 100
  recibir(e, [0, 0, 0], 0, 1000, 1040);
  recibir(e, [0.12, 0, 0], 0, 1030, 1070);
  const p = posicionEn(e, 1015 + 40 + RETARDO_MIN_MS); // tRender = 1015, mitad del tramo
  assert.ok(cerca(p.pos[0], 0.06), `x=${p.pos[0]}`);
});

test('sin datos más nuevos queda quieto en la última muestra, sin extrapolar', () => {
  const e = crearEstado();
  recibir(e, [0, 0, 0], 0, 1000, 1040);
  recibir(e, [1, 0, 0], 0, 1030, 1070);
  assert.deepEqual(posicionEn(e, 9999).pos, [1, 0, 0]);
});

test('un salto de teletransporte no se interpola', () => {
  const e = crearEstado();
  recibir(e, [0, 0, 0], 0, 1000, 1040);
  recibir(e, [DISTANCIA_TELETRANSPORTE + 5, 0, 0], 0, 1030, 1070);
  assert.deepEqual(posicionEn(e, 1070).pos, [DISTANCIA_TELETRANSPORTE + 5, 0, 0]);
});

test('tras una pausa del emisor (3D-04 no manda nada quieto) arranca desde donde estaba', () => {
  const e = crearEstado();
  recibir(e, [0, 0, 0], 0, 1000, 1040);
  // Cinco segundos quieto; vuelve a caminar
  recibir(e, [0.12, 0, 0], 0, 6000, 6040);
  // Al llegar el paquete no debe saltar casi hasta el destino
  assert.ok(posicionEn(e, 6040).pos[0] < 0.01, 'saltó al reanudar');
});

test('una posición sin hora del emisor (foto inicial del espacio) sirve de base', () => {
  const e = crearEstado();
  recibir(e, [5, 0, 5], 0, undefined, 500);
  assert.deepEqual(posicionEn(e, 600).pos, [5, 0, 5]);
  recibir(e, [5.12, 0, 5], 0, 1000, 1040);
  const x = posicionEn(e, 1040).pos[0];
  assert.ok(x >= 5 && x < 5.12, `x=${x}: no debe saltar al destino`);
});

test('una muestra repetida o fuera de orden se ignora', () => {
  const e = crearEstado();
  recibir(e, [0, 0, 0], 0, 1000, 1040);
  recibir(e, [1, 0, 0], 0, 1030, 1070);
  recibir(e, [99, 0, 0], 0, 1010, 1080); // llegó tarde, es más vieja que la última
  assert.deepEqual(posicionEn(e, 9999).pos, [1, 0, 0]);
});

test('el ángulo toma el camino corto (de 3.1 a -3.1 cruza por π, no por 0)', () => {
  const e = crearEstado();
  recibir(e, [0, 0, 0], 3.1, 1000, 1040);
  recibir(e, [0.12, 0, 0], -3.1, 1030, 1070);
  const a = posicionEn(e, 1015 + 40 + RETARDO_MIN_MS).angulo;
  assert.ok(Math.abs(Math.abs(a) - Math.PI) < 0.05, `ángulo=${a}`);
});

test('el atraso nunca cambia de golpe: se ajusta como mucho un 10 % del tiempo transcurrido', () => {
  const e = crearEstado();
  recibir(e, [0, 0, 0], 0, 1000, 1040);
  posicionEn(e, 1040);
  const antes = e.atraso;
  // Un paquete muy demorado sube el p95 y, con él, el objetivo
  for (let k = 1; k <= 20; k++) recibir(e, [k * 0.12, 0, 0], 0, 1000 + k * 30, 1040 + k * 30 + (k % 2 ? 250 : 0));
  posicionEn(e, 1056); // 16 ms después
  assert.ok(e.atraso - antes <= 1.6 + 1e-9, `subió ${e.atraso - antes} ms en 16 ms`);
});

// Emisor caminando a 4 u/s, un paquete cada 30 ms, latencia base 40 ms más
// jitter uniforme; el receptor dibuja a 60 fps. Mide qué fracción de frames
// tiene una velocidad visiblemente errónea (fuera de 3..5 u/s).
function framesConVelocidadErronea(jitterMax, semilla = 7) {
  const r = rng(semilla);
  const paquetes = [];
  let prev = 0;
  for (let k = 0; k * 30 <= 4000; k++) {
    const tEnvio = k * 30;
    const llegada = Math.max(prev, tEnvio + 40 + r() * jitterMax); // websocket entrega en orden
    prev = llegada;
    paquetes.push({ llegada, tEmisor: 5000 + tEnvio, x: (4 * tEnvio) / 1000 });
  }
  const e = crearEstado();
  let i = 0;
  let xPrev = 0;
  const velocidades = [];
  for (let t = 0; t <= 4300; t += 1000 / 60) {
    while (i < paquetes.length && paquetes[i].llegada <= t) {
      recibir(e, [paquetes[i].x, 0, 0], 0, paquetes[i].tEmisor, paquetes[i].llegada);
      i++;
    }
    const p = posicionEn(e, t);
    const x = p ? p.pos[0] : 0;
    velocidades.push((x - xPrev) * 60);
    xPrev = x;
  }
  const v = velocidades.slice(30, -30); // sin arranque ni frenado
  return v.filter((s) => s < 3 || s > 5).length / v.length;
}

test('con jitter de red de hasta 60 ms la velocidad no tiembla (regresión: estampar por llegada)', () => {
  // Estampando por hora de llegada esto daba ~75 % de frames erróneos
  assert.ok(framesConVelocidadErronea(60) < 0.02);
});

test('con jitter de 150 ms (túnel, datos móviles) el retardo adaptativo lo absorbe', () => {
  // Con un retardo fijo de 100 ms esto daba ~58 % de frames erróneos
  assert.ok(framesConVelocidadErronea(150) < 0.08);
});

test('un emisor lento (equipo a 4 FPS, un paquete cada 250 ms) camina parejo, no a saltos', () => {
  // Un hueco largo entre paquetes NO siempre es una pausa: si en ese hueco
  // recorrió lo que se recorre caminando, estuvo caminando todo el tiempo.
  const e = crearEstado();
  let xPrev = 0;
  const velocidades = [];
  let k = 0;
  for (let t = 0; t <= 4000; t += 1000 / 60) {
    while (k * 250 + 40 <= t) {
      recibir(e, [(4 * k * 250) / 1000, 0, 0], 0, 9000 + k * 250, k * 250 + 40);
      k++;
    }
    const p = posicionEn(e, t);
    const x = p ? p.pos[0] : 0;
    velocidades.push((x - xPrev) * 60);
    xPrev = x;
  }
  const v = velocidades.slice(40, -40);
  const erroneos = v.filter((s) => s < 3 || s > 5).length / v.length;
  assert.ok(erroneos < 0.05, `${(erroneos * 100).toFixed(1)} % de frames con velocidad errónea`);
});

test('una pausa larga del emisor no deja el atraso crecido sin límite', () => {
  // Quieto, el reloj se congela en la última muestra sumando atraso; tiene
  // que tener techo, o tras un minuto quieto el avatar iría un minuto atrasado.
  const e = crearEstado();
  for (let k = 0; k < 10; k++) recibir(e, [k * 0.12, 0, 0], 0, 1000 + k * 30, 1040 + k * 30);
  for (let t = 1400; t <= 61400; t += 1000 / 60) posicionEn(e, t); // un minuto sin paquetes
  assert.ok(e.atraso <= 40 + RETARDO_MAX_MS + 1e-6, `atraso=${e.atraso}`);
});
