// Resumen de RTCPeerConnection.getStats() para el panel de diagnóstico de voz
// (VOZ-05) y la prueba de carga de la malla. Todo sale de estadísticas
// estándar de WebRTC, así que funciona igual en Chrome, Firefox y Safari
// (los campos que un navegador no reporta quedan en null).

export type TipoCandidato = 'host' | 'srflx' | 'prflx' | 'relay';

export interface DiagnosticoPeer {
  peerId: string;
  estadoIce: RTCIceConnectionState;
  /** Tipo del candidato local del par elegido: 'relay' = pasa por TURN. */
  candidatoLocal: TipoCandidato | null;
  candidatoRemoto: TipoCandidato | null;
  /** udp / tcp hacia el otro extremo (o hacia el TURN si es relay). */
  protocolo: string | null;
  rttMs: number | null;
  jitterMs: number | null;
  /** Paquetes perdidos sobre esperados, en la ventana desde la muestra previa. */
  perdidaPct: number | null;
  /** Audio que el receptor tuvo que inventar por paquetes que no llegaron a tiempo (misma ventana). */
  ocultoPct: number | null;
  kbpsEntrada: number | null;
  kbpsSalida: number | null;
}

export interface DiagnosticoVoz {
  peers: DiagnosticoPeer[];
  conectados: number;
  kbpsEntradaTotal: number;
  kbpsSalidaTotal: number;
}

/**
 * Contadores acumulados de una muestra anterior. Las tasas y porcentajes se
 * calculan sobre la ventana entre esa muestra y la actual: sin muestra previa,
 * desde el inicio de la llamada.
 */
export interface MuestraPrevia {
  instante: number;
  bytesRecibidos: number;
  bytesEnviados: number;
  paquetesRecibidos: number;
  paquetesPerdidos: number;
  muestrasOcultas: number;
  muestrasTotales: number;
}

const porcentaje = (parte: number, total: number) => (total > 0 ? (100 * parte) / total : null);

const kbps = (bytes: number, bytesPrevios: number, ms: number) =>
  ms > 0 ? Math.max(0, ((bytes - bytesPrevios) * 8) / ms) : null;

export function resumirEstadisticas(
  peerId: string,
  estadoIce: RTCIceConnectionState,
  reporte: RTCStatsReport,
  previa: MuestraPrevia | undefined,
  ahora: number
): { diagnostico: DiagnosticoPeer; muestra: MuestraPrevia } {
  const porId = new Map<string, any>();
  reporte.forEach((s: any) => porId.set(s.id, s));

  let par: any = null;
  let entrada: any = null;
  let salida: any = null;
  reporte.forEach((s: any) => {
    if (s.type === 'transport' && s.selectedCandidatePairId) {
      par = porId.get(s.selectedCandidatePairId) ?? par;
    } else if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded' && !par) {
      // Firefox no expone 'transport': el par nominado y exitoso es el elegido
      par = s;
    } else if (s.type === 'inbound-rtp' && s.kind === 'audio') {
      entrada = s;
    } else if (s.type === 'outbound-rtp' && s.kind === 'audio') {
      salida = s;
    }
  });

  const local = par ? porId.get(par.localCandidateId) : null;
  const remoto = par ? porId.get(par.remoteCandidateId) : null;

  const bytesRecibidos = entrada?.bytesReceived ?? 0;
  const bytesEnviados = salida?.bytesSent ?? 0;
  const lapso = previa ? ahora - previa.instante : 0;

  const paquetesRecibidos = entrada?.packetsReceived ?? 0;
  const paquetesPerdidos = entrada?.packetsLost ?? 0;
  const muestrasOcultas = entrada?.concealedSamples ?? 0;
  const muestrasTotales = entrada?.totalSamplesReceived ?? 0;
  const recibidos = paquetesRecibidos - (previa?.paquetesRecibidos ?? 0);
  const perdidos = Math.max(0, paquetesPerdidos - (previa?.paquetesPerdidos ?? 0));

  return {
    diagnostico: {
      peerId,
      estadoIce,
      candidatoLocal: local?.candidateType ?? null,
      candidatoRemoto: remoto?.candidateType ?? null,
      protocolo: local ? (local.relayProtocol ?? local.protocol ?? null) : null,
      rttMs: typeof par?.currentRoundTripTime === 'number' ? par.currentRoundTripTime * 1000 : null,
      jitterMs: typeof entrada?.jitter === 'number' ? entrada.jitter * 1000 : null,
      perdidaPct: entrada ? porcentaje(perdidos, recibidos + perdidos) : null,
      ocultoPct: entrada
        ? porcentaje(
            muestrasOcultas - (previa?.muestrasOcultas ?? 0),
            muestrasTotales - (previa?.muestrasTotales ?? 0)
          )
        : null,
      kbpsEntrada: previa ? kbps(bytesRecibidos, previa.bytesRecibidos, lapso) : null,
      kbpsSalida: previa ? kbps(bytesEnviados, previa.bytesEnviados, lapso) : null,
    },
    muestra: {
      instante: ahora,
      bytesRecibidos,
      bytesEnviados,
      paquetesRecibidos,
      paquetesPerdidos,
      muestrasOcultas,
      muestrasTotales,
    },
  };
}

export function totalizar(peers: DiagnosticoPeer[]): DiagnosticoVoz {
  const conectados = peers.filter((p) => p.estadoIce === 'connected' || p.estadoIce === 'completed');
  return {
    peers,
    conectados: conectados.length,
    kbpsEntradaTotal: peers.reduce((t, p) => t + (p.kbpsEntrada ?? 0), 0),
    kbpsSalidaTotal: peers.reduce((t, p) => t + (p.kbpsSalida ?? 0), 0),
  };
}

// Umbrales de audio aceptable para voz (recomendaciones habituales de VoIP:
// ITU-T G.114 para la latencia de ida y vuelta, y pérdida/jitter tolerables
// por Opus con su corrección de errores).
export type Calidad = 'buena' | 'regular' | 'mala';

export function calidadPeer(p: DiagnosticoPeer): Calidad | null {
  if (p.estadoIce === 'failed' || p.estadoIce === 'disconnected') return 'mala';
  const peor = (valor: number | null, regular: number, mala: number): Calidad =>
    valor === null ? 'buena' : valor >= mala ? 'mala' : valor >= regular ? 'regular' : 'buena';
  const niveles = [
    peor(p.rttMs, 300, 600),
    peor(p.jitterMs, 30, 60),
    peor(p.perdidaPct, 3, 10),
    peor(p.ocultoPct, 3, 10),
  ];
  if (p.rttMs === null && p.jitterMs === null && p.perdidaPct === null) return null;
  return niveles.includes('mala') ? 'mala' : niveles.includes('regular') ? 'regular' : 'buena';
}
