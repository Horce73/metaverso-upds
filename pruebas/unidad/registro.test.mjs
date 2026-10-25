import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatear } from '../../server/src/registro.ts';

const ahora = new Date('2026-10-24T19:05:03.000Z');

test('JSON: una línea con hora, nivel, mensaje y campos', () => {
  const linea = formatear('info', 'pedido', { metodo: 'GET', estado: 200 }, undefined, 'json', ahora);
  assert.ok(!linea.includes('\n'));
  assert.deepEqual(JSON.parse(linea), { t: '2026-10-24T19:05:03.000Z', nivel: 'info', msg: 'pedido', metodo: 'GET', estado: 200 });
});

test('JSON: el error va con mensaje, código y pila', () => {
  const err = Object.assign(new Error('se cayó'), { code: 'ECONNREFUSED' });
  const obj = JSON.parse(formatear('error', 'falló la base', undefined, err, 'json', ahora));
  assert.equal(obj.error.mensaje, 'se cayó');
  assert.equal(obj.error.codigo, 'ECONNREFUSED');
  assert.match(obj.error.pila, /se cayó/);
});

test('JSON: algo que no es Error y un bigint no rompen la línea', () => {
  const obj = JSON.parse(formatear('warn', 'x', { n: 10n }, 'texto suelto', 'json', ahora));
  assert.equal(obj.n, '10');
  assert.equal(obj.error.mensaje, 'texto suelto');
});

test('texto: legible, con los campos y la pila en la línea siguiente', () => {
  const linea = formatear('error', 'falló', { espacioId: 2 }, new Error('boom'), 'texto', ahora);
  assert.match(linea, /^19:05:03 ERROR falló espacioId=2\n {2}Error: boom/);
});
