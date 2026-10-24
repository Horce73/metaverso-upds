import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minutosEfectivos } from '../../server/src/asistencia.ts';
import { aCsv, nombreArchivo } from '../../server/src/csv.ts';

const t = (hhmm) => new Date(`2026-10-24T${hhmm}:00Z`);
const tramo = (entrada, salida) => ({ entrada: t(entrada), salida: salida ? t(salida) : null });

test('un tramo dentro de la clase cuenta entero', () => {
  assert.equal(minutosEfectivos([tramo('19:05', '19:50')], t('19:00'), t('20:30'), t('21:00')), 45);
});

test('llegar antes o quedarse después no suma', () => {
  assert.equal(minutosEfectivos([tramo('18:40', '20:45')], t('19:00'), t('20:30'), t('21:00')), 90);
});

test('salir y volver suma sólo el tiempo dentro', () => {
  const tramos = [tramo('19:00', '19:20'), tramo('19:40', '20:30')];
  assert.equal(minutosEfectivos(tramos, t('19:00'), t('20:30'), t('21:00')), 70);
});

test('tramos que se pisan se cuentan una vez', () => {
  const tramos = [tramo('19:00', '19:30'), tramo('19:10', '19:40'), tramo('19:35', '19:45')];
  assert.equal(minutosEfectivos(tramos, t('19:00'), t('20:30'), t('21:00')), 45);
});

test('un tramo abierto corre hasta el fin de la clase', () => {
  assert.equal(minutosEfectivos([tramo('19:30', null)], t('19:00'), t('20:30'), t('21:00')), 60);
});

test('con la clase en curso, un tramo abierto corre hasta ahora', () => {
  assert.equal(minutosEfectivos([tramo('19:10', null)], t('19:00'), null, t('19:40')), 30);
});

test('sin tramos o fuera de horario da cero', () => {
  assert.equal(minutosEfectivos([], t('19:00'), t('20:30'), t('21:00')), 0);
  assert.equal(minutosEfectivos([tramo('17:00', '18:00')], t('19:00'), t('20:30'), t('21:00')), 0);
});

test('CSV: BOM, CRLF, comillas y separadores escapados', () => {
  const csv = aCsv(['Nombre', 'Nota'], [['Pérez, Ana', 'dijo "hola"'], ['Luis', 7], ['Sin dato', null]]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.equal(csv.slice(1), 'Nombre,Nota\r\n"Pérez, Ana","dijo ""hola"""\r\nLuis,7\r\nSin dato,\r\n');
});

test('CSV: un texto que parece fórmula no se ejecuta en Excel', () => {
  const csv = aCsv(['Nombre'], [['=HYPERLINK("x")'], ['+1'], ['-2'], ['@a']]);
  assert.equal(csv.slice(1), 'Nombre\r\n"\'=HYPERLINK(""x"")"\r\n\'+1\r\n\'-2\r\n\'@a\r\n');
});

test('CSV: los números negativos no se tocan', () => {
  assert.equal(aCsv(['n'], [[-3]]).slice(1), 'n\r\n-3\r\n');
});

test('nombre de archivo sin tildes ni separadores', () => {
  assert.equal(nombreArchivo('Ingeniería de Software / 2-2026'), 'Ingenieria_de_Software_2-2026.csv');
  assert.equal(nombreArchivo('///'), 'asistencia.csv');
});

import { armarTablero, fechaHora } from '../../server/src/asistencia.ts';

test('tablero: sin fila de asistencia es ausente, y los totales cuadran', () => {
  const sesiones = [
    { id: 1, tema: 'A', inicio: t('19:00'), fin: t('20:30'), estado: 'finalizada' },
    { id: 2, tema: 'B', inicio: t('21:00'), fin: null, estado: 'en_curso' },
  ];
  const estudiantes = [
    { id: 10, registro_upds: 'R10', nombre: 'Ana', apellido: 'Paz' },
    { id: 11, registro_upds: 'R11', nombre: 'Luis', apellido: 'Rojas' },
  ];
  const asistencias = [
    { id: 100, sesion_id: 1, usuario_id: 10, estado: 'presente' },
    { id: 101, sesion_id: 1, usuario_id: 11, estado: 'tarde' },
    { id: 102, sesion_id: 2, usuario_id: 10, estado: 'presente' },
  ];
  const tramos = [
    { asistencia_id: 100, entrada: t('19:00'), salida: t('20:30') },
    { asistencia_id: 101, entrada: t('19:20'), salida: t('20:00') },
    { asistencia_id: 102, entrada: t('21:00'), salida: null },
  ];
  const tablero = armarTablero(sesiones, estudiantes, asistencias, tramos, t('21:30'));

  assert.deepEqual(tablero.celdas[11][2], { estado: 'ausente', minutos: 0 });
  assert.deepEqual(tablero.celdas[10][2], { estado: 'presente', minutos: 30 });

  const [ana, luis] = tablero.estudiantes;
  assert.equal(ana.porcentaje_asistencia, 100);
  assert.equal(ana.minutos_total, 120);
  assert.equal(luis.tardes, 1);
  assert.equal(luis.ausencias, 1);
  assert.equal(luis.porcentaje_asistencia, 50);

  const [s1, s2] = tablero.sesiones;
  assert.equal(s1.duracion_min, 90);
  assert.equal(s1.minutos_promedio, 65); // (90 + 40) / 2
  assert.equal(s2.duracion_min, 30); // en curso: hasta ahora
  assert.equal(s2.ausentes, 1);
});

test('tablero: sin sesiones no divide por cero', () => {
  const tablero = armarTablero([], [{ id: 1, registro_upds: null, nombre: 'A', apellido: 'B' }], [], [], t('19:00'));
  assert.equal(tablero.estudiantes[0].porcentaje_asistencia, 0);
});

test('fecha en la zona horaria de la universidad', () => {
  assert.equal(fechaHora(new Date('2026-10-24T23:05:00Z'), 'America/La_Paz'), '2026-10-24 19:05');
  assert.equal(fechaHora(null, 'America/La_Paz'), '');
});
