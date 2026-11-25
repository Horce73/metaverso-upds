// Pruebas unitarias del núcleo de moderación (MOD-01, RF-35 y RF-37).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  puedeModerar,
  estaSancionado,
  evaluarMensaje,
  RAFAGA_MAX,
  RAFAGA_VENTANA_MS,
} from '../../server/src/moderacion.ts';

const admin = { userId: 1, roles: ['administrador'] };
const docente = { userId: 2, roles: ['docente'] };
const otroDocente = { userId: 3, roles: ['docente'] };
const estudiante = { userId: 4, roles: ['estudiante'] };
const oyente = { userId: 0, roles: ['oyente'] };
const invitado = { userId: 0, roles: ['invitado'] };
const suAula = { espacioTipo: 'aula', docenteDelEspacioId: 2 };
const campus = { espacioTipo: 'campus', docenteDelEspacioId: null };

test('el docente modera en el aula de su asignatura, también a oyentes', () => {
  assert.equal(puedeModerar(docente, estudiante, suAula), true);
  assert.equal(puedeModerar(docente, oyente, suAula), true);
});

test('el docente no modera en un aula ajena ni en el campus', () => {
  assert.equal(puedeModerar(otroDocente, estudiante, suAula), false);
  assert.equal(puedeModerar(docente, invitado, campus), false);
});

test('el admin modera en cualquier espacio', () => {
  assert.equal(puedeModerar(admin, estudiante, suAula), true);
  assert.equal(puedeModerar(admin, invitado, campus), true);
  assert.equal(puedeModerar(admin, docente, suAula), true);
});

test('nadie modera a un admin, ni otro admin ni el docente del aula', () => {
  assert.equal(puedeModerar({ userId: 9, roles: ['administrador'] }, admin, campus), false);
  assert.equal(puedeModerar(docente, admin, suAula), false);
});

test('nadie se modera a sí mismo', () => {
  assert.equal(puedeModerar(docente, docente, suAula), false);
});

test('estudiantes, oyentes e invitados no moderan', () => {
  assert.equal(puedeModerar(estudiante, invitado, suAula), false);
  assert.equal(puedeModerar(oyente, estudiante, suAula), false);
  assert.equal(puedeModerar(invitado, oyente, campus), false);
});

test('el docente del aula sin rol docente en la base no modera', () => {
  assert.equal(puedeModerar({ userId: 2, roles: ['estudiante'] }, estudiante, suAula), false);
});

const ahora = Date.parse('2026-11-25T15:00:00Z');
const enMin = (min) => new Date(ahora + min * 60_000);

test('una sanción con fin en el futuro está vigente y se devuelve entera', () => {
  const s = { tipo: 'silencio_chat', hasta: enMin(10), levantadaEn: null, motivo: 'spam' };
  assert.equal(estaSancionado([s], 'silencio_chat', ahora), s);
});

test('una sanción vencida, levantada o de otro tipo no cuenta', () => {
  const sanciones = [
    { tipo: 'silencio_chat', hasta: enMin(-1), levantadaEn: null },
    { tipo: 'silencio_chat', hasta: enMin(10), levantadaEn: enMin(-5) },
    { tipo: 'silencio_voz', hasta: enMin(10), levantadaEn: null },
  ];
  assert.equal(estaSancionado(sanciones, 'silencio_chat', ahora), undefined);
});

test('justo en su hora de fin la sanción ya no está vigente', () => {
  assert.equal(estaSancionado([{ tipo: 'silencio_chat', hasta: enMin(0), levantadaEn: null }], 'silencio_chat', ahora), undefined);
});

test('una expulsión sin fin sigue vigente hasta que se levante', () => {
  const expulsion = { tipo: 'expulsion', hasta: null, levantadaEn: null };
  assert.equal(estaSancionado([expulsion], 'expulsion', ahora), expulsion);
  assert.equal(estaSancionado([{ ...expulsion, levantadaEn: enMin(-1) }], 'expulsion', ahora), undefined);
});

const libre = { palabrasBloqueadas: [], bloquearEnlaces: false, maxMayusculasPct: 100, modoLentoSeg: 0 };
const ok = { ok: true };

test('sin reglas, cualquier mensaje pasa', () => {
  assert.deepEqual(evaluarMensaje('Hola, profe. ¿Hay clase el viernes? https://upds.edu.bo', libre, [], ahora), ok);
});

test('modo lento: rechaza antes de tiempo con los segundos que faltan y acepta después', () => {
  const reglas = { ...libre, modoLentoSeg: 10 };
  const r = evaluarMensaje('hola', reglas, [ahora - 3_000], ahora);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /Espera 7 s/);
  assert.deepEqual(evaluarMensaje('hola', reglas, [ahora - 10_000], ahora), ok);
  assert.deepEqual(evaluarMensaje('hola', reglas, [], ahora), ok);
});

test('ráfaga: el mensaje que pasa el máximo en la ventana se rechaza, aunque no haya reglas', () => {
  const casiLleno = Array.from({ length: RAFAGA_MAX - 1 }, (_, i) => ahora - i * 1_000);
  assert.deepEqual(evaluarMensaje('jajaja', libre, casiLleno, ahora), ok);
  const lleno = [...casiLleno, ahora - 500];
  assert.equal(evaluarMensaje('jajaja', libre, lleno, ahora).ok, false);
});

test('ráfaga: los envíos fuera de la ventana no cuentan', () => {
  const viejos = Array.from({ length: RAFAGA_MAX * 2 }, (_, i) => ahora - RAFAGA_VENTANA_MS - i);
  assert.deepEqual(evaluarMensaje('hola', libre, viejos, ahora), ok);
});

test('palabras bloqueadas: sin distinguir mayúsculas ni acentos', () => {
  const reglas = { ...libre, palabrasBloqueadas: ['tonto', 'pésimo'] };
  assert.equal(evaluarMensaje('Eres un TONTO.', reglas, [], ahora).ok, false);
  assert.equal(evaluarMensaje('esto es pesimo', reglas, [], ahora).ok, false);
});

test('palabras bloqueadas: solo palabras completas, no partes de otras', () => {
  const reglas = { ...libre, palabrasBloqueadas: ['sex'] };
  assert.deepEqual(evaluarMensaje('Estoy en sexto semestre', reglas, [], ahora), ok);
  assert.equal(evaluarMensaje('sex!', reglas, [], ahora).ok, false);
});

test('palabras bloqueadas: también frases de varias palabras', () => {
  const reglas = { ...libre, palabrasBloqueadas: ['compra aquí'] };
  assert.equal(evaluarMensaje('Compra   aqui: oferta', reglas, [], ahora).ok, false);
  assert.deepEqual(evaluarMensaje('aquí compra el libro', reglas, [], ahora), ok);
});

test('palabras bloqueadas: una entrada vacía no bloquea todo', () => {
  assert.deepEqual(evaluarMensaje('hola', { ...libre, palabrasBloqueadas: ['', '  ', '!!'] }, [], ahora), ok);
});

test('enlaces: se bloquean con la regla activa y pasan los números con punto', () => {
  const reglas = { ...libre, bloquearEnlaces: true };
  for (const t of ['mira https://x.co/a', 'entra a www.sitio.net', 'bit.ly/abc', 'ofertas.com hoy']) {
    assert.equal(evaluarMensaje(t, reglas, [], ahora).ok, false, t);
  }
  for (const t of ['saqué 3.5 en el parcial', 'Fin de la clase.Mañana seguimos']) {
    assert.deepEqual(evaluarMensaje(t, reglas, [], ahora), ok, t);
  }
});

test('mayúsculas: rechaza por encima del porcentaje y no cuenta mensajes cortos', () => {
  const reglas = { ...libre, maxMayusculasPct: 70 };
  assert.equal(evaluarMensaje('NADIE ME ESCUCHA AQUÍ', reglas, [], ahora).ok, false);
  assert.deepEqual(evaluarMensaje('OK UPDS', reglas, [], ahora), ok);
  assert.deepEqual(evaluarMensaje('Nos vemos en el Aula ISW', reglas, [], ahora), ok);
});

test('el modo lento se informa antes que el contenido', () => {
  const reglas = { ...libre, modoLentoSeg: 30, palabrasBloqueadas: ['tonto'] };
  assert.match(evaluarMensaje('tonto', reglas, [ahora - 1_000], ahora).motivo, /modo lento/);
});
