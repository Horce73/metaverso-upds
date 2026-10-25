import { test } from 'node:test';
import assert from 'node:assert/strict';
import { celdaDe, Acumulador } from '../../server/src/mapaCalor.ts';

test('cada celda cubre 2×2 unidades, también en negativo', () => {
  assert.deepEqual(celdaDe(0, 0), [0, 0]);
  assert.deepEqual(celdaDe(1.99, 3.5), [0, 1]);
  assert.deepEqual(celdaDe(-0.1, -2), [-1, -1]);
  assert.deepEqual(celdaDe(-2.01, 4), [-2, 2]);
});

test('el acumulador suma por espacio y celda, y se vacía', () => {
  const a = new Acumulador();
  a.sumar(1, 0.5, 0.5, 10);
  a.sumar(1, 1.5, 1.9, 10);
  a.sumar(2, 0.5, 0.5, 10);
  a.sumar(1, 10, 10, 10);
  const filas = a.vaciar().sort((x, y) => x.espacioId - y.espacioId || x.cx - y.cx);
  assert.deepEqual(filas, [
    { espacioId: 1, cx: 0, cz: 0, segundos: 20 },
    { espacioId: 1, cx: 5, cz: 5, segundos: 10 },
    { espacioId: 2, cx: 0, cz: 0, segundos: 10 },
  ]);
  assert.deepEqual(a.vaciar(), []);
});

test('posiciones inválidas o absurdas no se anotan', () => {
  const a = new Acumulador();
  a.sumar(1, NaN, 0, 10);
  a.sumar(1, 5000, 0, 10);
  assert.deepEqual(a.vaciar(), []);
});
