import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarEncuesta, contarVotos } from '../../server/src/encuestas.ts';

test('una encuesta válida queda saneada y sin opciones vacías', () => {
  const r = validarEncuesta({ pregunta: '  ¿Entendieron?  ', opciones: ['Sí', '', '  No ', 'Más o menos'] });
  assert.deepEqual(r, { ok: true, pregunta: '¿Entendieron?', opciones: ['Sí', 'No', 'Más o menos'] });
});

test('entre 2 y 6 opciones', () => {
  assert.equal(validarEncuesta({ pregunta: 'p', opciones: ['a'] }).ok, false);
  assert.equal(validarEncuesta({ pregunta: 'p', opciones: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }).ok, false);
  assert.equal(validarEncuesta({ pregunta: 'p', opciones: ['a', 'b'] }).ok, true);
});

test('sin pregunta, opciones repetidas o tipos raros se rechaza', () => {
  assert.equal(validarEncuesta({ pregunta: '   ', opciones: ['a', 'b'] }).ok, false);
  assert.equal(validarEncuesta({ pregunta: 'p', opciones: ['Sí', 'sí'] }).ok, false);
  assert.equal(validarEncuesta({ pregunta: 'p', opciones: 'a,b' }).ok, false);
  assert.equal(validarEncuesta({ pregunta: { x: 1 }, opciones: ['a', 'b'] }).ok, false);
});

test('contar votos por opción, ignorando los fuera de rango', () => {
  assert.deepEqual(contarVotos([0, 1, 1, 2, 5, -1, 1.5], 3), [1, 2, 1]);
  assert.deepEqual(contarVotos([], 2), [0, 0]);
});
