import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recibirSubtitulo, vigentes, DURACION_FINAL_MS, DURACION_PARCIAL_MS, MAX_LINEAS } from '../../src/components/transcripcion.ts';

const ev = (socketId, texto, final = false) => ({ socketId, nombre: socketId.toUpperCase(), texto, final });

test('los parciales de una persona reemplazan su línea en vez de apilarse', () => {
  let lineas = recibirSubtitulo([], ev('a', 'hola'), 0);
  lineas = recibirSubtitulo(lineas, ev('a', 'hola a todos'), 300);
  lineas = recibirSubtitulo(lineas, ev('a', 'hola a todos.', true), 600);
  assert.equal(lineas.length, 1);
  assert.equal(lineas[0].texto, 'hola a todos.');
  assert.equal(lineas[0].final, true);
});

test('una frase nueva después de una final abre otra línea', () => {
  let lineas = recibirSubtitulo([], ev('a', 'primera', true), 0);
  lineas = recibirSubtitulo(lineas, ev('a', 'segunda'), 500);
  assert.deepEqual(lineas.map((l) => l.texto), ['primera', 'segunda']);
});

test('dos personas hablando a la vez tienen cada una su línea', () => {
  let lineas = recibirSubtitulo([], ev('a', 'uno'), 0);
  lineas = recibirSubtitulo(lineas, ev('b', 'dos'), 100);
  lineas = recibirSubtitulo(lineas, ev('a', 'uno más'), 200);
  assert.deepEqual(lineas.map((l) => `${l.socketId}:${l.texto}`), ['a:uno más', 'b:dos']);
});

test('las líneas vencen: la final dura más que un parcial abandonado', () => {
  const lineas = [...recibirSubtitulo([], ev('a', 'fin', true), 0), ...recibirSubtitulo([], ev('b', 'cortado'), 0)];
  assert.equal(vigentes(lineas, DURACION_PARCIAL_MS + 1).length, 1);
  assert.equal(vigentes(lineas, DURACION_FINAL_MS + 1).length, 0);
});

test('nunca más de MAX_LINEAS en pantalla', () => {
  let lineas = [];
  for (let i = 0; i < 10; i++) lineas = recibirSubtitulo(lineas, ev(`p${i}`, `frase ${i}`, true), i);
  assert.equal(lineas.length, MAX_LINEAS);
  assert.equal(lineas.at(-1).texto, 'frase 9');
});
