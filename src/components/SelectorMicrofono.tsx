import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AudioClient, leerMicrofonoPreferido, guardarMicrofonoPreferido } from './AudioClient.js';

interface SelectorMicrofonoProps {
  /**
   * Si hay un canal de voz abierto, el cambio de dispositivo se aplica en vivo
   * sobre sus llamadas y el medidor lee su nivel. Sin él (antes de entrar al
   * aula), el selector abre su propia captura sólo para la prueba de nivel.
   */
  audioClient?: AudioClient | null;
  compacto?: boolean;
}

// Mismo cálculo que AudioClient: RMS de la forma de onda, 0..1
function nivelRms(analizador: AnalyserNode, buffer: Float32Array<ArrayBuffer>): number {
  analizador.getFloatTimeDomainData(buffer);
  let suma = 0;
  for (let i = 0; i < buffer.length; i++) suma += buffer[i] * buffer[i];
  return Math.sqrt(suma / buffer.length);
}

// Selector de micrófono con prueba de nivel (VOZ-08): elegir dispositivo y
// comprobar que entra señal antes de que el resto del aula dependa de ello.
export const SelectorMicrofono: React.FC<SelectorMicrofonoProps> = ({ audioClient, compacto = false }) => {
  const [dispositivos, setDispositivos] = useState<MediaDeviceInfo[]>([]);
  const [elegido, setElegido] = useState<string>(() => leerMicrofonoPreferido() ?? '');
  const [error, setError] = useState('');
  const barraRef = useRef<HTMLDivElement | null>(null);
  const hayVozRef = useRef<HTMLSpanElement | null>(null);

  const listar = useCallback(async () => {
    try {
      const todos = await navigator.mediaDevices.enumerateDevices();
      // Chrome agrega los alias "default" y "communications", que repiten un
      // dispositivo real; "Predeterminado del sistema" ya cubre ese caso.
      setDispositivos(
        todos.filter(
          (d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications'
        )
      );
    } catch {
      setDispositivos([]);
    }
  }, []);

  useEffect(() => {
    listar();
    navigator.mediaDevices?.addEventListener?.('devicechange', listar);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', listar);
  }, [listar]);

  // Medidor de nivel. Con canal de voz abierto se lee su nivel local; si no,
  // una captura propia del dispositivo elegido que se cierra al desmontar.
  useEffect(() => {
    let cancelado = false;
    let frame = 0;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let leerNivel: () => number = () => 0;

    const pintar = () => {
      const nivel = leerNivel();
      if (barraRef.current) barraRef.current.style.transform = `scaleX(${Math.min(1, nivel * 6)})`;
      if (hayVozRef.current) hayVozRef.current.style.opacity = nivel > 0.02 ? '1' : '0.35';
      frame = requestAnimationFrame(pintar);
    };

    const iniciar = async () => {
      if (audioClient) {
        leerNivel = () => audioClient.nivelLocal();
      } else {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: elegido ? { deviceId: { exact: elegido } } : true,
          });
          if (cancelado) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          setError('');
          // Con permiso concedido, enumerateDevices ya devuelve los nombres reales
          listar();
          // @ts-ignore
          const Ctx = window.AudioContext || window.webkitAudioContext;
          ctx = new Ctx();
          const analizador = ctx.createAnalyser();
          analizador.fftSize = 256;
          ctx.createMediaStreamSource(stream).connect(analizador);
          const buffer = new Float32Array(analizador.fftSize);
          leerNivel = () => nivelRms(analizador, buffer);
        } catch (err: any) {
          setError(
            err?.name === 'NotAllowedError'
              ? 'El navegador no tiene permiso para usar el micrófono.'
              : 'No se pudo abrir este micrófono.'
          );
          return;
        }
      }
      pintar();
    };
    iniciar();

    return () => {
      cancelado = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close();
    };
  }, [audioClient, elegido, listar]);

  const cambiar = (deviceId: string) => {
    setElegido(deviceId);
    guardarMicrofonoPreferido(deviceId);
    audioClient?.cambiarMicrofono(deviceId);
  };

  return (
    <div className={`selector-microfono${compacto ? ' selector-microfono--compacto' : ''}`}>
      <label className="selector-microfono__etiqueta">
        {!compacto && <span>Micrófono</span>}
        <select
          value={elegido}
          onChange={(e) => cambiar(e.target.value)}
          aria-label="Micrófono"
          disabled={dispositivos.length === 0}
        >
          {!elegido && <option value="">Predeterminado del sistema</option>}
          {dispositivos.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Micrófono ${i + 1}`}
            </option>
          ))}
        </select>
      </label>
      <div className="selector-microfono__medidor" aria-hidden="true">
        <div ref={barraRef} className="selector-microfono__barra" />
      </div>
      {error ? (
        <p className="selector-microfono__error">{error}</p>
      ) : (
        !compacto && (
          <p className="selector-microfono__ayuda">
            Habla y comprueba que la barra se mueva. <span ref={hayVozRef}>🎙️ Entra señal</span>
          </p>
        )
      )}
    </div>
  );
};
