import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarApariencia, APARIENCIA_POR_DEFECTO } from '../../src/components/mundo3d/personalizacion.ts';

test('sin nada guardado, la apariencia por defecto', () => {
  assert.deepEqual(normalizarApariencia(undefined), APARIENCIA_POR_DEFECTO);
  assert.deepEqual(normalizarApariencia('no es json'), APARIENCIA_POR_DEFECTO);
  assert.deepEqual(normalizarApariencia([1, 2]), APARIENCIA_POR_DEFECTO);
});

test('una apariencia de la versión 1 conserva colores, peinado, expresión y accesorios', () => {
  const a = normalizarApariencia({
    colorRopa: '#E74C3C',
    colorPiel: '#8d5524',
    colorCabello: '#eab308',
    estiloCabello: 'rizado',
    expresionRostro: 'guiño',
    escala: 1.05,
    accesorios: { sombrero: true, gafas: true, mochila: true },
    velloFacial: { estilo: 'barba', color: '#5a3d28' },
  });
  assert.equal(a.ropa.colorPrimario, '#e74c3c');
  assert.equal(a.piel, '#8d5524');
  assert.deepEqual(a.cabello, { estilo: 'rizado', color: '#eab308' });
  assert.equal(a.rostro.expresion, 'guiño');
  assert.equal(a.cuerpo.altura, 1.05);
  assert.equal(a.accesorios.sombrero, 'sombrero');
  assert.equal(a.accesorios.gafas, 'cuadradas');
  assert.equal(a.accesorios.mochila, true);
  assert.deepEqual(a.velloFacial, { estilo: 'barba', color: '#5a3d28' });
});

test('el vello facial sin color toma el del cabello', () => {
  const a = normalizarApariencia({ cabello: { estilo: 'corto', color: '#a0673a' }, velloFacial: { estilo: 'bigote' } });
  assert.equal(a.velloFacial.color, '#a0673a');
});

test('una apariencia nueva pasa tal cual', () => {
  const nueva = {
    ...APARIENCIA_POR_DEFECTO,
    cuerpo: { complexion: 'robusta', altura: 0.95 },
    ropa: { ...APARIENCIA_POR_DEFECTO.ropa, superior: 'saco', inferior: 'falda', calzado: 'botas' },
    accesorios: { ...APARIENCIA_POR_DEFECTO.accesorios, sombrero: 'chullo', gafas: 'sol', bufanda: true },
  };
  assert.deepEqual(normalizarApariencia(nueva), nueva);
  assert.deepEqual(normalizarApariencia(JSON.stringify(nueva)), nueva);
});

test('valores inválidos o fuera de rango caen en el valor por defecto', () => {
  const a = normalizarApariencia({
    piel: 'red; background:url(x)',
    cuerpo: { complexion: 'gigante', altura: 7 },
    cabello: { estilo: '<script>', color: '#12345' },
    ropa: { superior: 42, colorPrimario: 'javascript:' },
    accesorios: { gafas: 'monóculo', mochila: 'sí' },
  });
  assert.equal(a.piel, APARIENCIA_POR_DEFECTO.piel);
  assert.equal(a.cuerpo.complexion, 'media');
  assert.equal(a.cuerpo.altura, 1.1);
  assert.deepEqual(a.cabello, APARIENCIA_POR_DEFECTO.cabello);
  assert.equal(a.ropa.superior, 'polera');
  assert.equal(a.ropa.colorPrimario, APARIENCIA_POR_DEFECTO.ropa.colorPrimario);
  assert.equal(a.accesorios.gafas, 'ninguna');
  assert.equal(a.accesorios.mochila, false);
});
