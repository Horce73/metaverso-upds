// Pruebas unitarias de los gestos del avatar (GESTO-01, RF-19).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GESTOS as GESTOS_SERVIDOR, esGesto } from '../../server/src/gestos.ts';
import {
  GESTOS,
  GESTO_LOCAL,
  DURACION_GESTO_MS,
  ENFRIAMIENTO_GESTO_MS,
  registrarGesto,
  gestoLocal,
  gestoEn,
  poseGesto,
  crearPose,
} from '../../src/components/mundo3d/gestos.ts';

test('el servidor y el cliente conocen los mismos gestos, en el mismo orden (atajos 1 a 5)', () => {
  assert.deepEqual([...GESTOS], [...GESTOS_SERVIDOR]);
});

test('el servidor acepta solo ids de la lista cerrada', () => {
  for (const id of GESTOS_SERVIDOR) assert.equal(esGesto(id), true, id);
  for (const id of ['bailar', 'SALUDAR', '', null, undefined, 1, {}, ['saludar'], '__proto__']) {
    assert.equal(esGesto(id), false, String(id));
  }
});

test('un gesto recibido dura lo que dura y después se borra solo', () => {
  registrarGesto('s1', 'saludar', 1000);
  assert.equal(gestoEn('s1', 1000 + DURACION_GESTO_MS - 1)?.id, 'saludar');
  assert.equal(gestoEn('s1', 1000 + DURACION_GESTO_MS), undefined);
  assert.equal(gestoEn('s1', 1000), undefined, 'ya no queda en el registro');
});

test('un gesto nuevo del mismo avatar reemplaza al anterior', () => {
  registrarGesto('s2', 'saludar', 0);
  registrarGesto('s2', 'aplaudir', 500);
  assert.deepEqual(gestoEn('s2', 600), { id: 'aplaudir', desde: 500 });
});

test('un id desconocido que llega por la red se ignora', () => {
  registrarGesto('s3', 'bailar', 0);
  assert.equal(gestoEn('s3', 1), undefined);
});

test('el gesto propio respeta la duración más el enfriamiento', () => {
  const t0 = 1_000_000;
  assert.equal(gestoLocal('asentir', t0), true);
  assert.equal(gestoEn(GESTO_LOCAL, t0 + 10)?.id, 'asentir');
  assert.equal(gestoLocal('negar', t0 + DURACION_GESTO_MS + ENFRIAMIENTO_GESTO_MS - 1), false);
  assert.equal(gestoLocal('negar', t0 + DURACION_GESTO_MS + ENFRIAMIENTO_GESTO_MS), true);
});

test('cada gesto mueve algo, y la pose anterior no se arrastra al siguiente', () => {
  const p = crearPose();
  for (const id of GESTOS) {
    poseGesto(id, 0.2, p);
    const mueve = p.der || p.izq || p.cuerpoX !== 0 || p.cuerpoY !== 0;
    assert.equal(mueve, true, id);
  }
  poseGesto('aplaudir', 0.2, p);
  poseGesto('negar', 0.2, p);
  assert.equal(p.der || p.izq, false, 'negar no usa los brazos');
});
