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
  NIVEL_ALTO,
  ESCALON,
  PB_NUEVO,
  alturaEn,
  caminar,
  contiene,
} from '../../src/components/mundo3d/planoCampus.ts';

const centro = (r) => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
const cerca = (a, b) => Math.abs(a - b) < 1e-6;

/**
 * Camina en línea recta por los puntos [x, z] dados, de a 0,1 m, como lo haría
 * el avatar (sin deslizarse: cada paso tiene que poder darse). Devuelve las
 * alturas por las que pasó.
 */
function recorrer(plano, puntos, y0 = 0) {
  let [x, z] = puntos[0];
  let y = alturaEn(plano, x, z, y0);
  assert.notEqual(y, null, `no se puede empezar en (${x}, ${z}) a ${y0}`);
  const alturas = [y];
  for (const [hx, hz] of puntos.slice(1)) {
    const n = Math.ceil(Math.hypot(hx - x, hz - z) / 0.1);
    const [ox, oz] = [x, z];
    for (let i = 1; i <= n; i++) {
      x = ox + ((hx - ox) * i) / n;
      z = oz + ((hz - oz) * i) / n;
      const h = alturaEn(plano, x, z, y);
      assert.notEqual(h, null, `corte en (${x.toFixed(2)}, ${z.toFixed(2)}) a ${y.toFixed(2)} m`);
      y = h;
      alturas.push(y);
    }
  }
  return alturas;
}

/** ¿Choca al ir en línea recta? (algún paso no se puede dar) */
function choca(plano, desde, hasta, y0 = 0) {
  try {
    recorrer(plano, [desde, hasta], y0);
    return false;
  } catch {
    return true;
  }
}

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

test('la vereda, la recepción, el patio y el edificio nuevo por dentro son transitables; los edificios no', () => {
  const plano = calcularPlanoCampus(aulas(8));
  assert.ok(esTransitable(plano, ...plano.aparicion.position.filter((_, i) => i !== 1)));
  for (const r of [plano.pasoRecepcion, plano.entradaNuevo, plano.hallNuevo, plano.pasilloNuevo, plano.pasoCancha]) {
    assert.ok(esTransitable(plano, ...centro(r)));
  }
  // El nivel alto se pisa desde arriba, no desde la planta baja
  for (const r of [plano.galeriaCalle, plano.galeriaFondo, plano.pasarela, plano.hallAlto, plano.pasilloAlto, plano.cancha]) {
    assert.equal(alturaEn(plano, ...centro(r), NIVEL_ALTO), NIVEL_ALTO);
  }
  assert.equal(esTransitable(plano, ...centro(plano.cancha)), false);
  // Dentro del ala de la calle, lejos del pasillo de la recepción
  assert.equal(esTransitable(plano, 0, -5), false);
  // Edificio nuevo fuera del hall
  assert.equal(esTransitable(plano, -22, -8), false);
  // Al descanso de la escalera del patio no se llega desde el piso
  assert.equal(esTransitable(plano, ...centro(plano.escalera)), false);
});

test('el recorrido calle → recepción → patio → gradas → cancha es continuo y termina arriba', () => {
  const plano = calcularPlanoCampus(aulas(8));
  const x = (plano.pasoRecepcion.x0 + plano.pasoRecepcion.x1) / 2;
  const alturas = recorrer(plano, [
    [x, 2],
    [x, plano.cancha.z0 + 1],
  ]);
  assert.equal(alturas.at(-1), NIVEL_ALTO);
  // Las gradas suben parejo: nunca baja ni da un salto mayor que un escalón
  for (let i = 1; i < alturas.length; i++) {
    assert.ok(alturas[i] >= alturas[i - 1] - 1e-9 && alturas[i] - alturas[i - 1] <= ESCALON);
  }
  // Y se vuelve a bajar
  assert.equal(recorrer(plano, [[x, plano.cancha.z0 + 1], [x, 2]], NIVEL_ALTO).at(-1), 0);
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

test('dentro del edificio nuevo sólo se camina por la entrada, el vestíbulo, el pasillo, la bajada y el pie de la escalera', () => {
  const plano = calcularPlanoCampus(aulas(4));
  const { edificioNuevo: r, entradaNuevo, hallNuevo, pasilloNuevo, conexionNuevo, escaleraNuevo } = plano;
  const zonas = [entradaNuevo, hallNuevo, pasilloNuevo, conexionNuevo, escaleraNuevo];
  for (let x = r.x0 + 0.1; x < r.x1; x += 0.5) {
    for (let z = r.z0 + 0.1; z < r.z1; z += 0.5) {
      if (esTransitable(plano, x, z)) assert.ok(zonas.some((zona) => contiene(zona, x, z)), `se pisa (${x}, ${z})`);
    }
  }
  // El pasillo no sigue más allá de la bajada
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

test('la escalera del patio sube a la pasarela y la pasarela lleva a las dos galerías', () => {
  const plano = calcularPlanoCampus(aulas(8));
  const { escalera: e, pasarela: p, galeriaCalle, galeriaFondo } = plano;
  const [xc, zc] = centro(e);
  for (const xPie of [e.x0 - 1, e.x1 + 1]) {
    const alturas = recorrer(plano, [
      [xPie, zc],
      [xc, zc],
    ]);
    assert.equal(alturas[0], 0);
    assert.equal(alturas.at(-1), NIVEL_ALTO);
  }
  const [, zCalle] = centro(galeriaCalle);
  const [, zFondo] = centro(galeriaFondo);
  assert.equal(recorrer(plano, [[xc, zc], [xc, zCalle], [galeriaCalle.x0 + 0.5, zCalle]], NIVEL_ALTO).at(-1), NIVEL_ALTO);
  assert.equal(recorrer(plano, [[xc, zc], [xc, zFondo], [galeriaFondo.x1 - 0.5, zFondo]], NIVEL_ALTO).at(-1), NIVEL_ALTO);
  // La pasarela llega entre dos columnas
  for (const [x] of plano.columnas) assert.ok(x + 0.3 < p.x0 || x - 0.3 > p.x1, `columna en la pasarela (x=${x})`);
});

test('desde la galería y la pasarela no se cae al patio, y por debajo de la escalera no se pasa', () => {
  const plano = calcularPlanoCampus(aulas(8));
  const { escalera: e, pasarela: p, galeriaCalle: g, patio } = plano;
  const xg = p.x1 + 3;
  assert.ok(choca(plano, [xg, (g.z0 + g.z1) / 2], [xg, patio.z1 - 3], NIVEL_ALTO), 'cae de la galería');
  // Entre la escalera y la galería la pasarela vuela sobre el patio (en el centro, en cambio, sigue la escalera)
  const zVuelo = (e.z1 + g.z0) / 2;
  for (const xLado of [p.x0 - 2, p.x1 + 2]) {
    assert.ok(choca(plano, [(p.x0 + p.x1) / 2, zVuelo], [xLado, zVuelo], NIVEL_ALTO), 'cae de la pasarela');
  }
  // A media escalera, de costado, desde el piso del patio
  const xMedia = (e.x0 + (e.x0 + e.x1) / 2) / 2;
  assert.ok(choca(plano, [xMedia, e.z0 - 1], [xMedia, e.z1 + 1]), 'pasa por debajo de la escalera');
  // Por debajo de la pasarela sí, fuera de la escalera
  assert.equal(choca(plano, [(p.x0 + p.x1) / 2, e.z1 + 0.3], [(p.x0 + p.x1) / 2, patio.z1 - 0.1]), false);
});

test('al nivel alto sólo se sube por las escaleras', () => {
  const plano = calcularPlanoCampus(aulas(12));
  const rampas = plano.superficies.filter((s) => s.rampa);
  for (let x = plano.edificioNuevo.x0; x <= plano.xFin; x += 0.25) {
    for (let z = plano.cancha.z0; z <= 2; z += 0.25) {
      const h = alturaEn(plano, x, z, 0);
      if (h !== null && h > ESCALON) assert.fail(`desde el piso se pisa (${x}, ${z}) a ${h}`);
      // Lo que está a un escalón del piso o es piso o es el pie de una escalera
      if (h !== null && h > 1e-9) assert.ok(rampas.some((r) => contiene(r, x, z)), `(${x}, ${z}) a ${h}`);
    }
  }
});

test('en el edificio nuevo se sube por la escalera en U al piso alto y se sale a la galería del fondo', () => {
  const plano = calcularPlanoCampus(aulas(4));
  const { escaleraNuevo: e, hallAlto, pasilloAlto, conexionAlta, galeriaFondo, hallNuevo } = plano;
  const medio = (e.x0 + e.x1) / 2;
  const x1 = (e.x0 + medio) / 2;
  const x2 = (medio + e.x1) / 2;
  const zDescanso = e.z1 - 0.6;
  const xp = (pasilloAlto.x0 + pasilloAlto.x1) / 2;
  const zc = (conexionAlta.z0 + conexionAlta.z1) / 2;
  const alturas = recorrer(plano, [
    [x1, (hallNuevo.z0 + hallNuevo.z1) / 2],
    [x1, zDescanso],
    [x2, zDescanso],
    [x2, (hallAlto.z0 + hallAlto.z1) / 2],
    [xp, (hallAlto.z0 + hallAlto.z1) / 2],
    [xp, zc],
    [galeriaFondo.x0 + 2, zc],
  ]);
  assert.equal(alturas[0], 0);
  assert.equal(alturas.at(-1), NIVEL_ALTO);
  assert.ok(alturas.some((h) => cerca(h, PB_NUEVO / 2)), 'pasa por el descanso');
  // El muro entre los tramos no se cruza
  assert.ok(choca(plano, [x1, (e.z0 + e.z1) / 2 - 0.5], [x2, (e.z0 + e.z1) / 2 - 0.5]));
  // Desde el piso alto no se cae al hueco del primer tramo
  assert.ok(choca(plano, [x1, (hallAlto.z0 + hallAlto.z1) / 2], [x1, e.z1 - 0.1], NIVEL_ALTO));
  // El piso alto queda dentro del edificio nuevo, salvo la salida por la culata
  for (const r of [hallAlto, pasilloAlto]) assert.ok(r.x0 >= plano.edificioNuevo.x0 && r.x1 <= plano.edificioNuevo.x1);
  assert.ok(conexionAlta.x1 > galeriaFondo.x0);
});

test('caminar sigue la escalera aunque el paso sea largo, y no atraviesa paredes', () => {
  const plano = calcularPlanoCampus(aulas(8));
  const { escalera: e } = plano;
  const [xc, zc] = centro(e);
  // Un solo paso de 6 m (pestaña que vuelve tras un rato): sube igual, peldaño a peldaño
  const [x, y, z] = caminar(plano, e.x0 - 1, 0, zc, xc - (e.x0 - 1), 0);
  assert.ok(cerca(x, xc) && cerca(z, zc) && y === NIVEL_ALTO);
  // Contra el ala de la calle desde el patio: se queda en el patio
  const [, , zFin] = caminar(plano, 0, 0, plano.patio.z1 - 1, 0, 8);
  assert.ok(zFin <= plano.patio.z1 + 1e-9);
  // Choque en diagonal contra la pared: se desliza a lo largo
  const [xd, , zd] = caminar(plano, 0, 0, plano.patio.z1 - 0.05, 1, 1);
  assert.ok(xd > 0.9 && zd <= plano.patio.z1 + 1e-9);
});

test('las puertas de las aulas no se abren desde el nivel alto', () => {
  const plano = calcularPlanoCampus(aulas(6));
  const p = plano.puertas[0];
  assert.equal(puertaCercana(plano, p.frente[0], p.frente[1], 3.5, 0)?.id, p.id);
  assert.equal(puertaCercana(plano, p.frente[0], p.frente[1], 3.5, NIVEL_ALTO), null);
});

test('la posición guardada vale sólo si hay piso a esa altura', () => {
  const plano = calcularPlanoCampus(aulas(6));
  const [x, z] = centro(plano.galeriaCalle);
  assert.equal(alturaEn(plano, x, z, NIVEL_ALTO), NIVEL_ALTO);
  // En planta, ese punto también es patio (bajo la galería): con y = 0 se queda abajo
  assert.equal(alturaEn(plano, x, z, 0), 0);
  // A media altura no hay nada
  assert.equal(alturaEn(plano, x, z, 1.8), null);
});
