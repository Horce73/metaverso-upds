import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularPlanoCampus,
  esTransitable,
  puertaCercana,
  ordenarAulas,
  xFinPara,
  X_FIN_MINIMO,
  contiene,
} from '../../src/components/mundo3d/planoCampus.ts';

const aulas = (n, docente = (i) => i % 3) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, docenteId: docente(i), docenteNombre: `Docente ${docente(i)}` }));

test('las aulas de un mismo docente quedan juntas y en orden estable', () => {
  const orden = ordenarAulas(aulas(6)).map((a) => a.docenteId);
  assert.deepEqual(orden, [0, 0, 1, 1, 2, 2]);
});

test('el campus tiene un largo mínimo y crece con muchas aulas', () => {
  assert.equal(xFinPara(0), X_FIN_MINIMO);
  assert.equal(xFinPara(12), X_FIN_MINIMO);
  assert.ok(xFinPara(30) > X_FIN_MINIMO);
});

test('cada aula tiene su puerta, sin pisarse y sin tapar los pasillos', () => {
  for (const n of [1, 5, 12, 31]) {
    const plano = calcularPlanoCampus(aulas(n));
    assert.equal(plano.puertas.length, n);
    for (const lado of ['calle', 'fondo']) {
      const xs = plano.puertas.filter((p) => p.lado === lado).map((p) => p.x).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] >= 4, `puertas pegadas con ${n} aulas`);
      const paso = lado === 'calle' ? plano.pasoRecepcion : plano.pasoCancha;
      for (const x of xs) assert.ok(x + 0.6 < paso.x0, `puerta en el pasillo con ${n} aulas`);
    }
  }
});

test('se puede llegar caminando al frente de cada puerta', () => {
  const plano = calcularPlanoCampus(aulas(14));
  for (const p of plano.puertas) assert.ok(esTransitable(plano, ...p.frente), `frente de la puerta ${p.id}`);
});

test('la vereda, la recepción, el patio, el hall nuevo y la cancha son transitables; los edificios no', () => {
  const plano = calcularPlanoCampus(aulas(8));
  const centro = (r) => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
  assert.ok(esTransitable(plano, ...plano.aparicion.position.filter((_, i) => i !== 1)));
  for (const r of [plano.pasoRecepcion, plano.hallNuevo, plano.pasoCancha, plano.cancha]) {
    assert.ok(esTransitable(plano, ...centro(r)));
  }
  // Dentro del ala de la calle, lejos del pasillo de la recepción
  assert.equal(esTransitable(plano, 0, -5), false);
  // Edificio nuevo fuera del hall
  assert.equal(esTransitable(plano, -22, -8), false);
  // La escalera del patio es un obstáculo
  assert.equal(esTransitable(plano, ...centro(plano.escalera)), false);
});

test('el recorrido calle → recepción → patio → cancha es continuo', () => {
  const plano = calcularPlanoCampus(aulas(8));
  const x = (plano.pasoRecepcion.x0 + plano.pasoRecepcion.x1) / 2;
  for (let z = 2; z >= plano.cancha.z0 + 1; z -= 0.25) {
    assert.ok(esTransitable(plano, x, z), `corte en z=${z}`);
  }
});

test('desde la calle se llega al patio también por el hall del edificio nuevo', () => {
  const plano = calcularPlanoCampus(aulas(4));
  for (let z = 2; z >= -12; z -= 0.25) assert.ok(esTransitable(plano, -17, z), `hall, z=${z}`);
  for (let x = -17; x <= -8; x += 0.25) assert.ok(esTransitable(plano, x, -12), `conexión, x=${x}`);
});

test('la puerta cercana es la que tiene uno enfrente, y ninguna si está lejos', () => {
  const plano = calcularPlanoCampus(aulas(6));
  const p = plano.puertas[2];
  assert.equal(puertaCercana(plano, p.frente[0] + 0.5, p.frente[1])?.id, p.id);
  assert.equal(puertaCercana(plano, plano.aparicion.position[0], plano.aparicion.position[2]), null);
});

test('la escalera queda dentro del patio y lejos de las puertas', () => {
  const plano = calcularPlanoCampus(aulas(12));
  const e = plano.escalera;
  assert.ok(contiene(plano.patio, e.x0, e.z0) && contiene(plano.patio, e.x1, e.z1));
  for (const p of plano.puertas) assert.equal(contiene(e, ...p.frente), false);
});
