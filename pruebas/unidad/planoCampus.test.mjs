import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularPlanoCampus,
  esTransitable,
  puertaCercana,
  ordenarAulas,
  FRENTE_NUEVO,
  FONDO_NUEVO,
  NIVELES_NUEVO,
  ALTO_NUEVO,
  NIVEL_ALTO,
  NIVEL_PATIO,
  NIVEL_BLOQUE,
  NIVEL_ESPARCIMIENTO,
  X_INICIO_ANTIGUO,
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

/** Nunca baja ni sube más de un escalón de una muestra a la siguiente. */
function subeParejo(alturas) {
  for (let i = 1; i < alturas.length; i++) {
    assert.ok(alturas[i] >= alturas[i - 1] - 1e-9 && alturas[i] - alturas[i - 1] <= ESCALON, `salto en la muestra ${i}`);
  }
}

const aulas = (n, docente = (i) => i % 3) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, docenteId: docente(i), docenteNombre: `Docente ${docente(i)}` }));

test('las aulas de un mismo docente quedan juntas y en orden estable', () => {
  const orden = ordenarAulas(aulas(6)).map((a) => a.docenteId);
  assert.deepEqual(orden, [0, 0, 1, 1, 2, 2]);
});

test('un rectángulo girado contiene lo que cae dentro de su giro, no de su caja', () => {
  // 10 × 2 centrado en el origen, girado 90°: queda de 2 × 10
  const r = { x0: -5, x1: 5, z0: -1, z1: 1, giro: Math.PI / 2 };
  assert.ok(contiene(r, 0, 4.5));
  assert.ok(contiene(r, 0.9, -4.5));
  assert.equal(contiene(r, 4.5, 0), false);
  assert.equal(contiene({ ...r, giro: undefined }, 4.5, 0), true);
});

test('cada aula tiene su puerta, hasta llenar los lugares del plano y las genéricas', () => {
  for (const n of [1, 5, 7, 11, 18, 23]) {
    const plano = calcularPlanoCampus(aulas(n));
    assert.equal(plano.puertas.length, n, `${n} aulas`);
    // Los frentes no se pisan: cada uno queda más cerca de su puerta que de otra
    for (const p of plano.puertas) {
      assert.equal(puertaCercana(plano, ...p.frente, 3.5, p.y)?.id, p.id, `frente de la puerta ${p.id} con ${n} aulas`);
    }
    // Sobre una misma pared, las puertas (de 1,2 m de marco) no se encaballan
    for (const a of plano.puertas) {
      for (const b of plano.puertas) {
        if (a === b || a.giro !== b.giro || a.y !== b.y) continue;
        const misma = a.giro === Math.PI / 2 ? cerca(a.x, b.x) : cerca(a.z, b.z);
        if (misma) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 1.5, `puertas ${a.id} y ${b.id} pegadas con ${n} aulas`);
      }
    }
  }
});

test('las aulas que no entran en el plano ni en las genéricas quedan sin puerta', () => {
  const plano = calcularPlanoCampus(aulas(40));
  assert.ok(plano.puertas.length >= 23 && plano.puertas.length < 40);
  assert.equal(new Set(plano.puertas.map((p) => p.id)).size, plano.puertas.length);
});

test('se puede llegar caminando al frente de cada puerta, a la altura de la puerta', () => {
  const plano = calcularPlanoCampus(aulas(23));
  for (const p of plano.puertas) assert.equal(alturaEn(plano, ...p.frente, p.y), p.y, `frente de la puerta ${p.id}`);
});

test('las cinco aulas de la fila abren al corredor y las genéricas al pasillo del fondo', () => {
  const plano = calcularPlanoCampus(aulas(23));
  const fila = plano.puertas.slice(0, 5);
  for (const p of fila) {
    assert.ok(cerca(p.z, plano.filaAulas.z1) && p.x > plano.filaAulas.x0 && p.x < plano.filaAulas.x1);
    assert.ok(contiene(plano.corredor, ...p.frente));
  }
  for (const p of plano.puertas.slice(11)) assert.ok(contiene(plano.pasilloFondo, ...p.frente) && p.y === NIVEL_PATIO);
});

test('cada zona se pisa a su altura; dentro de los edificios no se pisa', () => {
  const plano = calcularPlanoCampus(aulas(8));
  const p = plano.aparicion.position;
  assert.equal(alturaEn(plano, p[0], p[2], 0), 0);
  const porAltura = [
    [0, [plano.pasoRecepcion, plano.corredor, plano.pasoOeste, plano.entradaNuevo, plano.hallNuevo, plano.pasilloNuevo]],
    [NIVEL_PATIO, [plano.patio, plano.patioOeste, plano.patioEste, plano.pasilloFondo, plano.descanso]],
    [NIVEL_BLOQUE, [plano.cafeteria, plano.hall]],
    [NIVEL_ESPARCIMIENTO, [...plano.esparcimiento, plano.cancha]],
    [NIVEL_ALTO, [plano.hallAlto, plano.pasilloAlto]],
  ];
  for (const [y, zonas] of porAltura) {
    for (const r of zonas) assert.equal(alturaEn(plano, ...centro(r), y), y, `zona en ${centro(r)} a ${y}`);
  }
  // El patio no se pisa desde el corredor sin la escalera
  assert.equal(esTransitable(plano, ...centro(plano.patio)), false);
  // Dentro del ala de la calle, de la fila de aulas, del bloque central fuera
  // de la cafetería y el hall, y del nuevo fuera de sus pasillos
  for (const y of [0, NIVEL_PATIO, NIVEL_BLOQUE]) {
    for (const [x, z] of [
      [0, -5],
      [8, -16.5],
      [8, -30],
      [-22, -8],
    ]) {
      assert.equal(esTransitable(plano, x, z, y), false, `(${x}, ${z}) a ${y}`);
    }
  }
});

test('calle → recepción → corredor → escalera en abanico → patio, sube parejo y se vuelve a bajar', () => {
  const plano = calcularPlanoCampus(aulas(8));
  const xr = (plano.pasoRecepcion.x0 + plano.pasoRecepcion.x1) / 2;
  const xo = (plano.pasoOeste.x0 + plano.pasoOeste.x1) / 2;
  const zc = (plano.corredor.z0 + plano.corredor.z1) / 2;
  const zd = (plano.descanso.z0 + plano.descanso.z1) / 2;
  const camino = [
    [xr, 2],
    [xr, zc],
    [xo, zc],
    [xo, zd],
  ];
  const alturas = recorrer(plano, camino);
  assert.equal(alturas.at(-1), NIVEL_PATIO);
  subeParejo(alturas);
  // Del descanso al centro del patio, y de vuelta a la calle
  assert.equal(recorrer(plano, [[xo, zd], [plano.patio.x1 - 0.2, zd], centro(plano.patio)], NIVEL_PATIO).at(-1), NIVEL_PATIO);
  assert.equal(recorrer(plano, [...camino].reverse(), NIVEL_PATIO).at(-1), 0);
});

test('desde la calle se llega al patio por el edificio nuevo: entrada, vestíbulo, pasillo y escalones', () => {
  const plano = calcularPlanoCampus(aulas(4));
  const { entradaNuevo: e, pasilloNuevo: p, escalonesNuevo: s } = plano;
  const xe = (e.x0 + e.x1) / 2;
  const xp = (p.x0 + p.x1) / 2;
  const zs = (s.z0 + s.z1) / 2;
  const alturas = recorrer(plano, [
    [xe, 2],
    [xe, -6],
    [xp, -6],
    [xp, zs],
    [plano.patio.x0 + 1, zs],
  ]);
  assert.equal(alturas.at(-1), NIVEL_PATIO);
  assert.ok(contiene(plano.patio, plano.patio.x0 + 1, zs));
});

test('el corredor de las aulas se abre al pasillo del nuevo por la culata', () => {
  const plano = calcularPlanoCampus(aulas(4));
  const zc = (plano.corredor.z0 + plano.corredor.z1) / 2;
  const xp = (plano.pasilloNuevo.x0 + plano.pasilloNuevo.x1) / 2;
  assert.deepEqual(recorrer(plano, [[xp, zc], [5, zc]]).at(-1), 0);
  // Fuera de esa abertura y de los escalones, la culata es muro
  assert.ok(choca(plano, [xp, -17], [X_INICIO_ANTIGUO + 1, -17]));
  assert.ok(choca(plano, [xp, -20], [X_INICIO_ANTIGUO + 1, -20]));
});

test('patio → escalera → área de esparcimiento → cancha sobre el auditorio, y de vuelta', () => {
  const plano = calcularPlanoCampus(aulas(8));
  const s = plano.escaleraEsparcimiento;
  const zs = (s.z0 + s.z1) / 2;
  const ida = [
    [s.x0 - 0.3, plano.descanso.z1 - 0.3],
    [s.x0 - 0.3, zs],
    [s.x1 + 1, zs],
    centro(plano.cancha),
  ];
  const alturas = recorrer(plano, ida, NIVEL_PATIO);
  assert.equal(alturas.at(-1), NIVEL_ESPARCIMIENTO);
  subeParejo(alturas.slice(0, alturas.findIndex((h) => cerca(h, NIVEL_ESPARCIMIENTO)) + 1));
  assert.equal(recorrer(plano, [...ida].reverse(), NIVEL_ESPARCIMIENTO).at(-1), NIVEL_PATIO);
});

test('del borde del área de esparcimiento no se cae al patio ni se sube a ella sin la escalera', () => {
  const plano = calcularPlanoCampus(aulas(8));
  const b = plano.esparcimiento[1];
  const z = (b.z0 + b.z1) / 2;
  assert.ok(choca(plano, [b.x0 + 0.5, z], [plano.patioOeste.x1 - 0.5, z], NIVEL_ESPARCIMIENTO), 'cae al patio');
  assert.ok(choca(plano, [plano.patioOeste.x1 - 0.5, z], [b.x0 + 0.5, z], NIVEL_PATIO), 'sube sin escalera');
  // Del costado de la escalera tampoco
  const s = plano.escaleraEsparcimiento;
  assert.ok(choca(plano, [s.x1 - 0.5, plano.descanso.z1 - 0.3], [s.x1 - 0.5, (s.z0 + s.z1) / 2], NIVEL_PATIO), 'sube por el costado');
});

test('a la cafetería se entra desde el patio, se sale al hall y por el hall al pasillo del fondo', () => {
  const plano = calcularPlanoCampus(aulas(8));
  const { cafeteria: c, hall: h, pasilloFondo: f } = plano;
  const xh = (h.x0 + h.x1) / 2;
  const alturas = recorrer(
    plano,
    // El árbol frente a la puerta (como en el plano) se rodea por el costado
    [
      [-1.8, -22],
      [-1.8, -24.35],
      [-3.1, -24.35],
      [-3.1, -25.5],
      [-2.5, -27.3],
      [xh, -27.3],
      [xh, (f.z0 + f.z1) / 2],
    ],
    NIVEL_PATIO
  );
  assert.ok(alturas.some((y) => cerca(y, NIVEL_BLOQUE)), 'pasa por la cafetería');
  assert.equal(alturas.at(-1), NIVEL_PATIO);
  // Por la pared de la cafetería que da al patio, fuera de la puerta, no se entra
  assert.ok(choca(plano, [c.x1 - 1, -24], [c.x1 - 1, -25.5], NIVEL_PATIO));
});

test('el auditorio no tapa los pasos ni las escaleras del piso 0 y del patio', () => {
  const plano = calcularPlanoCampus(aulas(4));
  for (const r of [plano.pasoOeste, plano.escaleraPatio, plano.descanso, plano.escaleraEsparcimiento, plano.corredor, plano.nucleo]) {
    for (const [x, z] of [
      [r.x0, r.z0],
      [r.x0, r.z1],
      [r.x1, r.z0],
      [r.x1, r.z1],
    ]) {
      assert.equal(contiene(plano.auditorio, x, z), false, `(${x}, ${z})`);
    }
  }
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

test('dentro del edificio nuevo sólo se camina por la entrada, el vestíbulo, el pasillo, los escalones y la escalera', () => {
  const plano = calcularPlanoCampus(aulas(4));
  const { edificioNuevo: r, entradaNuevo, hallNuevo, pasilloNuevo, escalonesNuevo, escaleraNuevo, corredor } = plano;
  const zonas = [entradaNuevo, hallNuevo, pasilloNuevo, escalonesNuevo, escaleraNuevo, corredor];
  for (let x = r.x0 + 0.1; x < r.x1; x += 0.5) {
    for (let z = r.z0 + 0.1; z < r.z1; z += 0.5) {
      if (esTransitable(plano, x, z)) assert.ok(zonas.some((zona) => contiene(zona, x, z)), `se pisa (${x}, ${z})`);
    }
  }
  // El pasillo no sigue más allá de los escalones (atrás están el ascensor y los baños)
  assert.equal(esTransitable(plano, (pasilloNuevo.x0 + pasilloNuevo.x1) / 2, pasilloNuevo.z0 - 1), false);
});

test('ningún árbol tapa la entrada del edificio nuevo ni la recepción', () => {
  const plano = calcularPlanoCampus(aulas(4));
  for (const r of [plano.entradaNuevo, plano.pasoRecepcion]) {
    const x = (r.x0 + r.x1) / 2;
    for (const [ax] of plano.arboles) assert.ok(Math.abs(ax - x) > 2, `árbol en x=${ax}`);
  }
});

test('la puerta cercana es la que tiene uno enfrente, y ninguna si está lejos o en otro piso', () => {
  const plano = calcularPlanoCampus(aulas(14));
  const p = plano.puertas[2];
  assert.equal(puertaCercana(plano, p.frente[0] + 0.5, p.frente[1])?.id, p.id);
  assert.equal(puertaCercana(plano, plano.aparicion.position[0], plano.aparicion.position[2]), null);
  // Una puerta del corredor no se abre desde el nivel alto; una del pasillo del fondo, desde el piso 0 tampoco
  assert.equal(puertaCercana(plano, ...p.frente, 3.5, NIVEL_ALTO), null);
  const g = plano.puertas.at(-1);
  assert.equal(g.y, NIVEL_PATIO);
  assert.equal(puertaCercana(plano, ...g.frente, 3.5, NIVEL_PATIO)?.id, g.id);
  assert.equal(puertaCercana(plano, ...g.frente, 3.5, 0), null);
});

test('desde el piso 0 sólo se sube por las escaleras', () => {
  const plano = calcularPlanoCampus(aulas(12));
  const rampas = plano.superficies.filter((s) => s.rampa);
  for (let x = plano.edificioNuevo.x0; x <= 40; x += 0.25) {
    for (let z = -40; z <= 2; z += 0.25) {
      const h = alturaEn(plano, x, z, 0);
      if (h !== null && h > ESCALON) assert.fail(`desde el piso se pisa (${x}, ${z}) a ${h}`);
      // Lo que está a un escalón del piso o es piso o es el pie de una escalera
      if (h !== null && h > 1e-9) assert.ok(rampas.some((r) => contiene(r, x, z)), `(${x}, ${z}) a ${h}`);
    }
  }
});

test('en el edificio nuevo se sube por la escalera en U al piso alto', () => {
  const plano = calcularPlanoCampus(aulas(4));
  const { escaleraNuevo: e, hallAlto, pasilloAlto, hallNuevo } = plano;
  const medio = (e.x0 + e.x1) / 2;
  const x1 = (e.x0 + medio) / 2;
  const x2 = (medio + e.x1) / 2;
  const zDescanso = e.z1 - 0.6;
  const xp = (pasilloAlto.x0 + pasilloAlto.x1) / 2;
  const alturas = recorrer(plano, [
    [x1, (hallNuevo.z0 + hallNuevo.z1) / 2],
    [x1, zDescanso],
    [x2, zDescanso],
    [x2, (hallAlto.z0 + hallAlto.z1) / 2],
    [xp, (hallAlto.z0 + hallAlto.z1) / 2],
    [xp, pasilloAlto.z0 + 0.5],
  ]);
  assert.equal(alturas[0], 0);
  assert.equal(alturas.at(-1), NIVEL_ALTO);
  assert.ok(alturas.some((h) => cerca(h, PB_NUEVO / 2)), 'pasa por el descanso');
  // El muro entre los tramos no se cruza
  assert.ok(choca(plano, [x1, (e.z0 + e.z1) / 2 - 0.5], [x2, (e.z0 + e.z1) / 2 - 0.5]));
  // Desde el piso alto no se cae al hueco del primer tramo
  assert.ok(choca(plano, [x1, (hallAlto.z0 + hallAlto.z1) / 2], [x1, e.z1 - 0.1], NIVEL_ALTO));
  // El piso alto queda dentro del edificio nuevo
  for (const r of [hallAlto, pasilloAlto]) assert.ok(r.x0 >= plano.edificioNuevo.x0 && r.x1 <= plano.edificioNuevo.x1);
});

test('caminar sigue la escalera aunque el paso sea largo, y no atraviesa paredes', () => {
  const plano = calcularPlanoCampus(aulas(8));
  const s = plano.escaleraEsparcimiento;
  const zs = (s.z0 + s.z1) / 2;
  // Un solo paso de 7 m (pestaña que vuelve tras un rato): sube igual, peldaño a peldaño
  const [x, y, z] = caminar(plano, s.x0 - 0.3, NIVEL_PATIO, zs, s.x1 + 1 - (s.x0 - 0.3), 0);
  assert.ok(cerca(x, s.x1 + 1) && cerca(z, zs) && y === NIVEL_ESPARCIMIENTO);
  // Contra la fila de aulas desde el patio: se queda en el patio
  const [, , zFin] = caminar(plano, 0, NIVEL_PATIO, plano.patio.z1 - 1, 0, 8);
  assert.ok(zFin <= plano.patio.z1 + 1e-9);
  // Choque en diagonal contra la pared: se desliza a lo largo
  const [xd, , zd] = caminar(plano, 0, NIVEL_PATIO, plano.patio.z1 - 0.05, 1, 1);
  assert.ok(xd > 0.9 && zd <= plano.patio.z1 + 1e-9);
});

test('la posición guardada vale sólo si hay piso a esa altura', () => {
  const plano = calcularPlanoCampus(aulas(6));
  const [x, z] = centro(plano.cancha);
  assert.equal(alturaEn(plano, x, z, NIVEL_ESPARCIMIENTO), NIVEL_ESPARCIMIENTO);
  // Debajo de la cancha está el auditorio: no hay piso a la altura de la calle
  assert.equal(alturaEn(plano, x, z, 0), null);
  const [xp, zp] = centro(plano.patio);
  assert.equal(alturaEn(plano, xp, zp, NIVEL_PATIO), NIVEL_PATIO);
  assert.equal(alturaEn(plano, xp, zp, 2.5), null);
});
