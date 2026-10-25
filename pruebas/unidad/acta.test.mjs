import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tocaCapturar, ordenarActa, escaparHtml, actaHtml, INTERVALO_CAPTURA_MS } from '../../server/src/acta.ts';

test('se captura la primera vez y después cada intervalo', () => {
  assert.equal(tocaCapturar(null, 0), true);
  assert.equal(tocaCapturar(1000, 1000 + INTERVALO_CAPTURA_MS - 1), false);
  assert.equal(tocaCapturar(1000, 1000 + INTERVALO_CAPTURA_MS), true);
});

test('el acta se ordena por hora y respeta el orden a igual hora', () => {
  const t = (m) => `2026-10-24T19:${String(m).padStart(2, '0')}:00.000Z`;
  const eventos = [
    { tipo: 'chat', en: t(5), texto: 'b' },
    { tipo: 'entrada', en: t(1), autor: 'Ana' },
    { tipo: 'chat', en: t(5), texto: 'c' },
    { tipo: 'grabacion_inicio', en: t(0) },
  ];
  assert.deepEqual(ordenarActa(eventos).map((e) => e.texto ?? e.tipo), ['grabacion_inicio', 'entrada', 'b', 'c']);
});

test('escapar HTML', () => {
  assert.equal(escaparHtml(`<img src=x onerror="a('b')">&`), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
});

test('el HTML del acta no deja pasar marcado de los usuarios', () => {
  const html = actaHtml(
    'Clase <1>',
    'Aula',
    [
      { tipo: 'chat', en: '2026-10-24T19:00:00Z', autor: '<b>Ana</b>', texto: '<script>alert(1)</script>' },
      { tipo: 'encuesta', en: '2026-10-24T19:05:00Z', texto: '¿Sí?', opciones: [{ texto: '<i>Sí</i>', votos: 3 }, { texto: 'No', votos: 1 }] },
      { tipo: 'pantalla', en: '2026-10-24T19:06:00Z', capturaId: '7' },
    ],
    (iso) => iso.slice(11, 16),
    (id) => (id === '7' ? 'data:image/webp;base64,AAAA' : null)
  );
  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('&lt;b&gt;Ana&lt;/b&gt;'));
  assert.ok(html.includes('&lt;i&gt;Sí&lt;/i&gt;: 3 (75%)'));
  assert.ok(html.includes('<title>Clase &lt;1&gt;</title>'));
  assert.ok(html.includes('src="data:image/webp;base64,AAAA"'));
});
