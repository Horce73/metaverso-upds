import React, { useEffect, useState } from 'react';
import { AudioClient } from './AudioClient.js';
import { calidadPeer, type Calidad, type DiagnosticoVoz } from './diagnosticoVoz.js';

interface PanelDiagnosticoVozProps {
  audioClient: AudioClient | null;
  /** peerId -> nombre visible, para no mostrar ids de PeerJS. */
  nombres: Record<string, string>;
  onClose: () => void;
}

const COLOR_CALIDAD: Record<Calidad, string> = {
  buena: 'var(--success)',
  regular: 'var(--warning)',
  mala: 'var(--error)',
};

const RUTA: Record<string, string> = {
  relay: 'TURN',
  srflx: 'Directa (NAT)',
  prflx: 'Directa (NAT)',
  host: 'Red local',
};

const num = (v: number | null, decimales = 0) => (v === null ? '—' : v.toFixed(decimales));

// Panel en vivo con las estadísticas WebRTC de cada llamada (VOZ-05): por qué
// ruta va el audio, latencia, jitter, pérdida y ancho de banda. Complementa a
// /turn-test.html, que comprueba el TURN antes de entrar.
export const PanelDiagnosticoVoz: React.FC<PanelDiagnosticoVozProps> = ({ audioClient, nombres, onClose }) => {
  const [diagnostico, setDiagnostico] = useState<DiagnosticoVoz | null>(null);

  useEffect(() => {
    if (!audioClient) return;
    let activo = true;
    const actualizar = async () => {
      const d = await audioClient.obtenerDiagnostico();
      if (activo) setDiagnostico(d);
    };
    actualizar();
    const id = setInterval(actualizar, 1000);
    return () => {
      activo = false;
      clearInterval(id);
    };
  }, [audioClient]);

  return (
    <div className="panel-diagnostico-voz glass-panel" role="dialog" aria-label="Diagnóstico del canal de voz">
      <div className="panel-diagnostico-voz__cabecera">
        <h3>Diagnóstico de voz</h3>
        <button className="btn-secondary" onClick={onClose} aria-label="Cerrar diagnóstico">
          Cerrar
        </button>
      </div>

      {!diagnostico ? (
        <p className="panel-diagnostico-voz__nota">Leyendo estadísticas…</p>
      ) : (
        <>
          <p className="panel-diagnostico-voz__resumen">
            Conectado con <b>{diagnostico.conectados}</b> de {diagnostico.peers.length} ·
            Subida <b>{num(diagnostico.kbpsSalidaTotal)} kbps</b> ·
            Bajada <b>{num(diagnostico.kbpsEntradaTotal)} kbps</b>
          </p>

          {diagnostico.peers.length === 0 ? (
            <p className="panel-diagnostico-voz__nota">No hay nadie más con voz en este espacio.</p>
          ) : (
            <div className="panel-diagnostico-voz__tabla">
              <table>
                <thead>
                  <tr>
                    <th>Participante</th>
                    <th>Ruta</th>
                    <th title="Latencia de ida y vuelta">RTT ms</th>
                    <th title="Variación del retardo entre paquetes">Jitter ms</th>
                    <th title="Paquetes perdidos en el último segundo">Pérdida %</th>
                    <th title="Audio reconstruido por paquetes que no llegaron a tiempo">Oculto %</th>
                    <th>↓ kbps</th>
                    <th>↑ kbps</th>
                  </tr>
                </thead>
                <tbody>
                  {diagnostico.peers.map((p) => {
                    const calidad = calidadPeer(p);
                    return (
                      <tr key={p.peerId}>
                        <td>
                          <span
                            className="panel-diagnostico-voz__punto"
                            style={{ background: calidad ? COLOR_CALIDAD[calidad] : 'var(--text-muted)' }}
                            title={calidad ? `Calidad ${calidad}` : p.estadoIce}
                          />
                          {nombres[p.peerId] || p.peerId}
                        </td>
                        <td>
                          {p.candidatoLocal
                            ? `${RUTA[p.candidatoLocal] ?? p.candidatoLocal}${p.protocolo ? ` · ${p.protocolo}` : ''}`
                            : p.estadoIce}
                        </td>
                        <td>{num(p.rttMs)}</td>
                        <td>{num(p.jitterMs)}</td>
                        <td>{num(p.perdidaPct, 1)}</td>
                        <td>{num(p.ocultoPct, 1)}</td>
                        <td>{num(p.kbpsEntrada)}</td>
                        <td>{num(p.kbpsSalida)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <p className="panel-diagnostico-voz__nota">
        ¿Nadie te oye desde otra red? <a href="/turn-test.html" target="_blank" rel="noreferrer">Probar el servidor TURN</a>
      </p>
    </div>
  );
};
