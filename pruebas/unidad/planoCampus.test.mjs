import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularPlanoCampus,
  esTransitable,
  puertaCercana,
  ordenarAulas,
  xFinPara,
  X_FIN_MINIMO,
  X_INICIO_ANTIGUO,
  FRENTE_NUEVO,
  FONDO_NUEVO,
  NIVELES_NUEVO,
  ALTO_NUEVO,
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

test('la vereda, la recepción, el patio, el edificio nuevo por dentro y la cancha son transitables; los edificios no', () => {
  const plano = calcularPlanoCampus(aulas(8));
  const centro = (r) => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
  assert.ok(esTransitable(plano, ...plano.aparicion.position.filter((_, i) => i !== 1)));
  for (const r of [plano.pasoRecepcion, plano.entradaNuevo, plano.hallNuevo, plano.pasilloNuevo, plano.pasoCancha, plano.cancha]) {
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

test('desde la calle se llega al patio por el edificio nuevo: entrada, vestíbulo, pasillo y bajada', () => {
  const plano = calcularPlanoCampus(aulas(4));
  const { entradaNuevo: e, pasilloNuevo: p, conexionNuevo: c } = plano;
  const xe = (e.x0 + e.x1) / 2;
  const xp = (p.x0 + p.x1) / 2;
  const zc = (c.z0 + c.z1) / 2;
  const tramo = (desde, hasta, punto) => {
    const n = Math.ceil(Math.hypot(hasta[0] - desde[0], hasta[1] - desde[1]) / 0.25);
    for (let i = 0; i <= n; i++) {
      const x = desde[0] + ((hasta[0] - desde[0]) * i) / n;
      const z = desde[1] + ((hasta[1] - desde[1]) * i) / n;
      assert.ok(esTransitable(plano, x, z), `${punto}: corte en (${x.toFixed(2)}, ${z.toFixed(2)})`);
    }
  };
  tramo([xe, 2], [xe, -6], 'calle → vestíbulo');
  tramo([xe, -6], [xp, -6], 'vestíbulo → pasillo');
  tramo([xp, -6], [xp, zc], 'pasillo');
  tramo([xp, zc], [plano.patio.x0 + 1, zc], 'bajada al patio');
  assert.ok(contiene(plano.patio, plano.patio.x0 + 1, zc));
});

test('el edificio nuevo mide lo del plano y queda pegado al antiguo', () => {
  const { edificioNuevo: r } = calcularPlanoCampus(aulas(4));
  assert.equal(r.x1, X_INICIO_ANTIGUO);
  assert.equal(r.x1 - r.x0, FRENTE_NUEVO);
  assert.equal(r.z1 - r.z0, FONDO_NUEVO);
  assert.equal(r.z1, 0);
});

test('el edificio nuevo tiene 11 niveles y la cubierta queda sobre el último', () => {
  assert.equal(NIVELES_NUEVO.length, 11);
  assert.equal(NIVELES_NUEVO[0], 0);
  for (let i = 1; i < NIVELES_NUEVO.length; i++) {
    const alto = NIVELES_NUEVO[i] - NIVELES_NUEVO[i - 1];
    assert.ok(alto >= 3.3 && alto <= 4, `nivel ${i + 1}: ${alto} m`);
  }
  assert.ok(ALTO_NUEVO > NIVELES_NUEVO.at(-1) + 0.5 && ALTO_NUEVO < 40);
});

test('dentro del edificio nuevo sólo se camina por la entrada, el vestíbulo, el pasillo y la bajada', () => {
  const plano = calcularPlanoCampus(aulas(4));
  const { edificioNuevo: r, entradaNuevo, hallNuevo, pasilloNuevo, conexionNuevo, escaleraNuevo } = plano;
  const zonas = [entradaNuevo, hallNuevo, pasilloNuevo, conexionNuevo];
  for (let x = r.x0 + 0.1; x < r.x1; x += 0.5) {
    for (let z = r.z0 + 0.1; z < r.z1; z += 0.5) {
      if (esTransitable(plano, x, z)) assert.ok(zonas.some((zona) => contiene(zona, x, z)), `se pisa (${x}, ${z})`);
    }
  }
  // La escalera es decorado y el pasillo no sigue más allá de la bajada
  const centro = (q) => [(q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2];
  assert.equal(esTransitable(plano, ...centro(escaleraNuevo)), false);
  assert.equal(esTransitable(plano, (pasilloNuevo.x0 + pasilloNuevo.x1) / 2, conexionNuevo.z0 - 1), false);
  // La bajada cruza la culata y desemboca en el patio, lejos de la escalera del patio y de las puertas
  assert.ok(conexionNuevo.x1 > plano.patio.x0 && conexionNuevo.x0 < pasilloNuevo.x1);
  assert.ok(conexionNuevo.z0 >= plano.patio.z0 && conexionNuevo.z1 <= plano.patio.z1);
  for (const p of plano.puertas) assert.equal(contiene(conexionNuevo, ...p.frente), false);
});

test('ningún árbol tapa la entrada del edificio nuevo', () => {
  const plano = calcularPlanoCampus(aulas(4));
  const x = (plano.entradaNuevo.x0 + plano.entradaNuevo.x1) / 2;
  for (const [ax] of plano.arboles) assert.ok(Math.abs(ax - x) > 2, `árbol en x=${ax}`);
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
