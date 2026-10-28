import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanearApariencia } from '../../server/src/apariencia.ts';

test('una apariencia normal pasa entera', () => {
  const a = {
    version: 2,
    piel: '#d9a066',
    cuerpo: { complexion: 'media', altura: 1 },
    ropa: { superior: 'saco', colorPrimario: '#0033a0' },
    accesorios: { mochila: true, sombrero: 'chullo' },
  };
  assert.deepEqual(sanearApariencia(a), a);
  assert.deepEqual(sanearApariencia(JSON.stringify(a)), a);
});

test('se descarta lo que no es apariencia', () => {
  const a = sanearApariencia({
    piel: 'x'.repeat(500),
    'clave rara': 1,
    __proto__x: 1,
    lista: [1, 2, 3],
    hondo: { a: { b: { c: 1 } } },
    n: Infinity,
    ok: 'si',
  });
  assert.deepEqual(a, { hondo: {}, ok: 'si' });
});

test('basura y textos enormes dan un objeto vacío', () => {
  assert.deepEqual(sanearApariencia(null), {});
  assert.deepEqual(sanearApariencia('no json'), {});
  assert.deepEqual(sanearApariencia('{"a":1}'.padEnd(5000, ' ')), {});
  assert.deepEqual(sanearApariencia(42), {});
});

test('no pasan más de 24 claves', () => {
  const muchas = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`k${'a'.repeat(i % 20)}${String.fromCharCode(97 + (i % 26))}`, i]));
  assert.ok(Object.keys(sanearApariencia(muchas)).length <= 24);
});
