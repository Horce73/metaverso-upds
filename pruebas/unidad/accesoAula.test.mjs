import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pases, codigoCoincide, DURACION_PASE_MS } from '../../server/src/accesoAula.ts';

test('el código se compara sin importar mayúsculas ni espacios', () => {
  assert.equal(codigoCoincide('  demo-101 ', 'DEMO-101'), true);
  assert.equal(codigoCoincide('DEMO-102', 'DEMO-101'), false);
});

test('sin código del curso, o sin escribir nada, no hay coincidencia', () => {
  assert.equal(codigoCoincide('123456', null), false);
  assert.equal(codigoCoincide('', ''), false);
  assert.equal(codigoCoincide(undefined, 'DEMO-101'), false);
  assert.equal(codigoCoincide(['DEMO-101'], 'DEMO-101'), false);
});

test('un pase vale para ese usuario y esa aula, y vence', () => {
  const p = new Pases();
  p.otorgar(7, 3, 1000);
  assert.equal(p.tiene(7, 3, 1000 + DURACION_PASE_MS - 1), true);
  assert.equal(p.tiene(7, 4, 1000), false);
  assert.equal(p.tiene(8, 3, 1000), false);
  assert.equal(p.tiene(7, 3, 1000 + DURACION_PASE_MS), false);
});
