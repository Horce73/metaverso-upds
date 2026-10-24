import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AJUSTES_CALIDAD, bajarNivel, subirNivel, nivelInicial } from '../../src/components/mundo3d/calidad.ts';

test('bajar y subir se quedan dentro de los tres niveles', () => {
  assert.equal(bajarNivel('alta'), 'media');
  assert.equal(bajarNivel('media'), 'baja');
  assert.equal(bajarNivel('baja'), 'baja');
  assert.equal(subirNivel('baja'), 'media');
  assert.equal(subirNivel('media'), 'alta');
  assert.equal(subirNivel('alta'), 'alta');
});

test('cada nivel cuesta menos que el de arriba', () => {
  const { alta, media, baja } = AJUSTES_CALIDAD;
  for (const [mayor, menor] of [[alta, media], [media, baja]]) {
    assert.ok(menor.dpr <= mayor.dpr);
    assert.ok(menor.estrellas <= mayor.estrellas);
    assert.ok(menor.distanciaDetalle <= mayor.distanciaDetalle);
    assert.ok(!menor.lucesPuntuales || mayor.lucesPuntuales);
    assert.ok(!menor.sombras || mayor.sombras);
  }
  assert.equal(baja.sombras, false);
});

test('el nivel de arranque depende del equipo', () => {
  assert.equal(nivelInicial({ esTactil: false }), 'alta');
  assert.equal(nivelInicial({ esTactil: true }), 'media');
  assert.equal(nivelInicial({ esTactil: true, memoriaGb: 2 }), 'baja');
  assert.equal(nivelInicial({ esTactil: false, nucleos: 2 }), 'baja');
  assert.equal(nivelInicial({ esTactil: false, memoriaGb: 8, nucleos: 8 }), 'alta');
});
