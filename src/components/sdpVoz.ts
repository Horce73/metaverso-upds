// Ajustes al SDP de las llamadas de voz, aplicados con la opción sdpTransform
// de PeerJS antes de fijar la descripción local.

// Opus DTX (decisión 0001): con el micrófono silenciado o callado el
// codificador deja de enviar 50 paquetes por segundo de silencio y manda uno
// de ruido de confort cada ~400 ms. En la prueba de carga bajó la subida de un
// participante callado en un aula de 12 de 163 a 35 kbps.
export function activarDtx(sdp: string): string {
  const payloads = [...sdp.matchAll(/^a=rtpmap:(\d+) opus\/48000/gim)].map((m) => m[1]);
  return payloads.reduce(
    (resultado, pt) =>
      resultado.replace(new RegExp(`^(a=fmtp:${pt} (?![^\\r\\n]*usedtx=)[^\\r\\n]*)`, 'm'), '$1;usedtx=1'),
    sdp
  );
}
