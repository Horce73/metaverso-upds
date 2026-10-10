// Pruebas unitarias de la relevancia de posicion en el campus (3D-04).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RADIO_RELEVANCIA_CAMPUS, debeRecibirMovimiento } from '../../server/src/relevanciaPosicion.ts';

test('en el aula nunca se filtra, sin importar la distancia', () => {
  assert.equal(debeRecibirMovimiento('aula', [0, 0, 0], [100, 0, 100]), true);
});

test('en el campus, cerca del radio de relevancia se reenvia', () => {
  const a = [0, 0, 0];
  const b = [RADIO_RELEVANCIA_CAMPUS - 1, 0, 0];
  assert.equal(debeRecibirMovimiento('campus', a, b), true);
});

test('en el campus, mas alla del radio de relevancia no se reenvia', () => {
  const a = [0, 0, 0];
  const b = [RADIO_RELEVANCIA_CAMPUS + 1, 0, 0];
  assert.equal(debeRecibirMovimiento('campus', a, b), false);
});

test('justo en el borde del radio, se reenvia (<=)', () => {
  const a = [0, 0, 0];
  const b = [RADIO_RELEVANCIA_CAMPUS, 0, 0];
  assert.equal(debeRecibirMovimiento('campus', a, b), true);
});

test('la separacion entre la plaza y la isla de aulas (27) queda fuera del radio', () => {
  // Mismo valor que ISLA_2_OFFSET_Z en src/components/mundo3d/Campus.tsx:
  // el filtro tiene que cortar trafico entre esas dos areas, no solo entre
  // puntos arbitrarios.
  const enLaPlaza = [0, 0, 0];
  const enLaIslaDeAulas = [0, 0, -27];
  assert.equal(debeRecibirMovimiento('campus', enLaPlaza, enLaIslaDeAulas), false);
});

test('la altura (eje Y) no cuenta para la distancia: solo importa el plano horizontal', () => {
  const a = [0, 0, 0];
  const b = [0, 50, 0]; // mismo punto en XZ, muy distinto en Y
  assert.equal(debeRecibirMovimiento('campus', a, b), true);
});

test('sin posicion conocida del receptor (recien unido) se envia igual', () => {
  assert.equal(debeRecibirMovimiento('campus', [0, 0, 0], null), true);
});
