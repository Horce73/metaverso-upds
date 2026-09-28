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
