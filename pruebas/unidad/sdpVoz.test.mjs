// Pruebas unitarias de la transformación de SDP de la voz. Corren con
// `npm run test:unidad` (node --test, sin navegador).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activarDtx } from '../../src/components/sdpVoz.ts';

// Recorte real de una oferta de Chrome: Opus (111) más códecs auxiliares.
const OFERTA = [
  'v=0',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111 63 9 0 8 13 110 126',
  'a=rtpmap:111 opus/48000/2',
  'a=rtcp-fb:111 transport-cc',
  'a=fmtp:111 minptime=10;useinbandfec=1',
  'a=rtpmap:63 red/48000/2',
  'a=fmtp:63 111/111',
  'a=rtpmap:126 telephone-event/8000',
  '',
].join('\r\n');

test('añade usedtx=1 a la línea fmtp de Opus', () => {
  const sdp = activarDtx(OFERTA);
  assert.match(sdp, /a=fmtp:111 minptime=10;useinbandfec=1;usedtx=1\r\n/);
});

test('no toca los demás códecs ni el resto de líneas', () => {
  const sdp = activarDtx(OFERTA);
  assert.equal(sdp.replace(';usedtx=1', ''), OFERTA);
  assert.match(sdp, /a=fmtp:63 111\/111\r\n/);
});

test('es idempotente', () => {
  const una = activarDtx(OFERTA);
  assert.equal(activarDtx(una), una);
});

test('respeta un usedtx ya negociado, aunque sea 0', () => {
  const conCero = OFERTA.replace('useinbandfec=1', 'useinbandfec=1;usedtx=0');
  assert.equal(activarDtx(conCero), conCero);
});

test('localiza Opus por rtpmap, no por el número de payload', () => {
  const otroPayload = OFERTA.replaceAll(':111 ', ':96 ').replace('63 111/111', '63 96/96');
  assert.match(activarDtx(otroPayload), /a=fmtp:96 minptime=10;useinbandfec=1;usedtx=1\r\n/);
});

test('sin Opus devuelve el SDP intacto', () => {
  const sinOpus = 'v=0\r\nm=audio 9 RTP/AVP 0\r\na=rtpmap:0 PCMU/8000\r\n';
  assert.equal(activarDtx(sinOpus), sinOpus);
});
