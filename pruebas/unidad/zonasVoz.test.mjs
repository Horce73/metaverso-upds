// Pruebas unitarias de las zonas de audio (VOZ-03).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RADIOS,
  esDifusor,
  debeEstarConectado,
  planificarConexiones,
  perfilAudicion,
  gananciaPorDistancia,
} from '../../src/components/zonasVoz.ts';

const en = (x, z, difusor = false) => ({ posicion: [x, 0, z], difusor });

test('en el aula difunden docentes y administradores; en el campus nadie', () => {
  assert.equal(esDifusor(['docente'], 'aula'), true);
  assert.equal(esDifusor(['administrador'], 'aula'), true);
  assert.equal(esDifusor(['estudiante'], 'aula'), false);
  assert.equal(esDifusor(['docente'], 'campus'), false);
  assert.equal(esDifusor([], 'aula'), false);
});

test('quien difunde se conecta con todos, esté donde esté', () => {
  const docente = en(0, -14, true);
  const alumnoAlFondo = en(18, 18);
  assert.equal(debeEstarConectado(docente, alumnoAlFondo, 'aula', false), true);
  assert.equal(debeEstarConectado(alumnoAlFondo, docente, 'aula', false), true);
});

test('dos alumnos se conectan sólo si están cerca', () => {
  const { conectar } = RADIOS.aula;
  assert.equal(debeEstarConectado(en(0, 0), en(conectar - 0.5, 0), 'aula', false), true);
  assert.equal(debeEstarConectado(en(0, 0), en(conectar + 0.5, 0), 'aula', false), false);
});

test('histéresis: una llamada abierta sigue hasta el radio de desconexión', () => {
  const { conectar, desconectar } = RADIOS.aula;
  const medio = (conectar + desconectar) / 2;
  assert.equal(debeEstarConectado(en(0, 0), en(medio, 0), 'aula', false), false);
  assert.equal(debeEstarConectado(en(0, 0), en(medio, 0), 'aula', true), true);
  assert.equal(debeEstarConectado(en(0, 0), en(desconectar + 0.5, 0), 'aula', true), false);
});

test('la distancia es horizontal: sentarse no cambia la zona', () => {
  const { conectar } = RADIOS.aula;
  const sentado = { posicion: [0, -0.5, conectar - 0.5], difusor: false };
  assert.equal(debeEstarConectado(en(0, 0), sentado, 'aula', false), true);
});

test('en el campus un docente es uno más', () => {
  const lejos = RADIOS.campus.desconectar + 5;
  assert.equal(debeEstarConectado(en(0, 0, true), en(lejos, 0), 'campus', false), false);
});

test('sólo llama el de peerId menor, así nunca se cruzan dos llamadas', () => {
  const otros = new Map([
    ['peer_b', en(1, 0)], // menor que peer_m: llama él
    ['peer_z', en(1, 1)], // mayor: llamo yo
  ]);
  const plan = planificarConexiones('peer_m', en(0, 0), otros, new Set(), 'aula');
  assert.deepEqual(plan.llamar, ['peer_z']);
  assert.deepEqual(plan.colgar, []);
});

test('cuelga las llamadas que salieron del radio, sea quien sea quien llamó', () => {
  const yo = en(0, 0);
  const otros = new Map([
    ['peer_a', en(RADIOS.aula.desconectar + 1, 0)],
    ['peer_z', en(1, 0)],
  ]);
  const plan = planificarConexiones('peer_m', yo, otros, new Set(['peer_a', 'peer_z']), 'aula');
  assert.deepEqual(plan.colgar, ['peer_a']);
  assert.deepEqual(plan.llamar, []);
});

test('no toca a quien todavía no tiene posición conocida', () => {
  const otros = new Map([['peer_z', { posicion: null, difusor: false }]]);
  const plan = planificarConexiones('peer_a', en(0, 0), otros, new Set(['peer_z']), 'aula');
  assert.deepEqual(plan, { llamar: [], colgar: [] });
});

test('perfil de audición: al que difunde se lo oye igual en toda el aula', () => {
  assert.equal(perfilAudicion(false, true), 'constante');
  assert.equal(perfilAudicion(true, false), 'sala');
  assert.equal(perfilAudicion(false, false), 'proximidad');
  assert.equal(gananciaPorDistancia(40, 'constante', 'aula'), 1);
});

test('proximidad: se apaga del todo antes del radio de conexión', () => {
  const { audible, conectar } = RADIOS.aula;
  assert.ok(audible <= conectar);
  assert.equal(gananciaPorDistancia(0.5, 'proximidad', 'aula'), 1);
  assert.equal(gananciaPorDistancia(audible, 'proximidad', 'aula'), 0);
  const g = gananciaPorDistancia(audible / 2, 'proximidad', 'aula');
  assert.ok(g > 0 && g < 1);
});

test('sala: quien difunde oye al fondo del aula atenuado, no en silencio', () => {
  const g = gananciaPorDistancia(30, 'sala', 'aula');
  assert.ok(g > 0.4 && g < 1);
});

test('con 30 en el aula, un alumno queda con pocas llamadas', () => {
  // Rejilla de 5 x 6 sobre la zona de pupitres (x -10..10, z -6..8) y el
  // docente al frente: el peor caso razonable de densidad para una clase.
  // La decisión 0001 midió ~16–23 % de un núcleo con 5–8 llamadas y ~39 % con
  // 11: el tope de 10 (docente incluido) mantiene a un alumno por debajo.
  const otros = new Map();
  let i = 0;
  for (const x of [-10, -5, 0, 5, 10]) {
    for (const z of [-6, -3, 0, 3, 6, 8]) otros.set(`peer_${String(i++).padStart(2, '0')}`, en(x, z));
  }
  otros.set('peer_docente', en(0, -14, true));
  let maximo = 0;
  for (const [id, yo] of otros) {
    if (yo.difusor) continue;
    let grado = 0;
    for (const [otroId, otro] of otros) if (otroId !== id && debeEstarConectado(yo, otro, 'aula', false)) grado++;
    maximo = Math.max(maximo, grado);
  }
  assert.ok(maximo <= 10, `un alumno quedó con ${maximo} llamadas`);
});

// AULA-07: mesas de trabajo con audio aislado
import { MESAS_AULA, mesaDe, difundeAhora, perfilEntre } from '../../src/components/zonasVoz.ts';

const GRUPOS = { grupos: true };
const centro = (m) => [(m.x0 + m.x1) / 2, (m.z0 + m.z1) / 2];
const enMesa = (i, dx = 0, dz = 0, difusor = false) => {
  const [x, z] = centro(MESAS_AULA[i]);
  return en(x + dx, z + dz, difusor);
};

test('cada pupitre del aula cae dentro de una mesa, y las mesas no se pisan', () => {
  for (const x of [-8.5, -3, 3, 8.5]) for (const z of [-5, 0, 5]) assert.notEqual(mesaDe([x, 0, z + 0.62]), null);
  for (const a of MESAS_AULA) for (const b of MESAS_AULA) {
    if (a === b) continue;
    const solapan = a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
    assert.equal(solapan, false, `mesas ${a.id} y ${b.id} se pisan`);
  }
  assert.equal(mesaDe([0, 0, -14]), null); // el frente (docente) no es una mesa
});

test('en modo grupos, dos de la misma mesa se oyen aunque estén en extremos opuestos', () => {
  const m = MESAS_AULA[0];
  const a = en(m.x0 + 0.3, m.z0 + 0.3);
  const b = en(m.x1 - 0.3, m.z1 - 0.3);
  assert.equal(debeEstarConectado(a, b, 'aula', false, GRUPOS), true);
  assert.equal(perfilEntre(a, b, 'aula', GRUPOS), 'constante');
});

test('en modo grupos, la voz no sale de la mesa: ni a la de al lado ni a quien está cerca afuera', () => {
  const vecinas = [enMesa(0), enMesa(1)];
  assert.equal(debeEstarConectado(vecinas[0], vecinas[1], 'aula', false, GRUPOS), false);
  const m = MESAS_AULA[0];
  const afuera = en(m.x0 - 0.5, (m.z0 + m.z1) / 2); // a medio metro del borde
  const adentro = en(m.x0 + 0.5, (m.z0 + m.z1) / 2);
  assert.equal(debeEstarConectado(adentro, afuera, 'aula', false, GRUPOS), false);
  assert.equal(debeEstarConectado(adentro, afuera, 'aula', false, {}), true); // sin grupos sí
});

test('el docente desde el frente sigue llegando a todas las mesas', () => {
  const docente = en(0, -14, true);
  assert.equal(difundeAhora(docente, 'aula', GRUPOS), true);
  for (let i = 0; i < MESAS_AULA.length; i++) assert.equal(debeEstarConectado(enMesa(i), docente, 'aula', false, GRUPOS), true);
});

test('el docente que se acerca a una mesa pasa a ser parte de ese grupo', () => {
  const docente = enMesa(2, 0.5, 0, true);
  assert.equal(difundeAhora(docente, 'aula', GRUPOS), false);
  assert.equal(debeEstarConectado(docente, enMesa(2), 'aula', false, GRUPOS), true);
  assert.equal(debeEstarConectado(docente, enMesa(3), 'aula', false, GRUPOS), false);
  assert.equal(perfilEntre(enMesa(2), docente, 'aula', GRUPOS), 'constante');
});

test('fuera de las mesas, en modo grupos, sigue la proximidad', () => {
  const a = en(-15, 12);
  const b = en(-14, 12);
  assert.equal(debeEstarConectado(a, b, 'aula', false, GRUPOS), true);
  assert.equal(perfilEntre(a, b, 'aula', GRUPOS), 'proximidad');
});

test('histéresis en el borde: salir apenas de la mesa no corta la llamada abierta', () => {
  const m = MESAS_AULA[0];
  const a = enMesa(0);
  const bordeAfuera = en(m.x0 - 0.3, (m.z0 + m.z1) / 2);
  assert.equal(debeEstarConectado(a, bordeAfuera, 'aula', false, GRUPOS), false);
  assert.equal(debeEstarConectado(a, bordeAfuera, 'aula', true, GRUPOS), true);
});

test('planificarConexiones respeta el modo grupos', () => {
  const otros = new Map([
    ['peer_z', enMesa(0, 1, 0)],
    ['peer_y', enMesa(1)],
  ]);
  const plan = planificarConexiones('peer_a', enMesa(0), otros, new Set(['peer_y']), 'aula', GRUPOS);
  assert.deepEqual(plan, { llamar: ['peer_z'], colgar: ['peer_y'] });
});
