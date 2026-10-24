import React, { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { recibirSubtitulo, vigentes, Transcriptor, type EventoSubtitulo, type LineaSubtitulo } from './transcripcion.js';

interface SubtitulosProps {
  socket: Socket;
  /** Mostrar los subtítulos de los demás (y los propios) en pantalla. */
  visible: boolean;
  /** La persona eligió transcribir su voz. */
  transcribir: boolean;
  /** El micrófono está realmente abierto: sin silenciar y, con pulsar para hablar, pulsado. */
  microfonoAbierto: boolean;
  onErrorTranscripcion: (error: string) => void;
}

const ID_PROPIO = 'yo';

// Tiene su propio estado: con varias actualizaciones por segundo mientras
// alguien habla, sólo se vuelve a dibujar este recuadro, no la App entera.
export const Subtitulos: React.FC<SubtitulosProps> = ({ socket, visible, transcribir, microfonoAbierto, onErrorTranscripcion }) => {
  const [lineas, setLineas] = useState<LineaSubtitulo[]>([]);
  const errorRef = useRef(onErrorTranscripcion);
  errorRef.current = onErrorTranscripcion;

  const agregar = (evento: EventoSubtitulo) => setLineas((prev) => recibirSubtitulo(prev, evento, Date.now()));

  useEffect(() => {
    const alRecibir = (data: EventoSubtitulo) => agregar(data);
    socket.on('subtitulo', alRecibir);
    return () => {
      socket.off('subtitulo', alRecibir);
    };
  }, [socket]);

  // Sólo se transcribe con el micrófono abierto: silenciarse (o soltar la
  // tecla de pulsar para hablar) corta también la transcripción.
  const activo = transcribir && microfonoAbierto;
  useEffect(() => {
    if (!activo) return;
    const transcriptor = new Transcriptor(
      (texto, final) => {
        socket.emit('subtitulo', { texto, final });
        agregar({ socketId: ID_PROPIO, nombre: 'Tú', texto, final });
      },
      (error) => errorRef.current(error)
    );
    transcriptor.iniciar();
    return () => transcriptor.detener();
  }, [activo, socket]);

  // Las líneas vencen solas aunque no llegue nada nuevo
  useEffect(() => {
    if (lineas.length === 0) return;
    const id = setInterval(() => setLineas((prev) => vigentes(prev, Date.now())), 1000);
    return () => clearInterval(id);
  }, [lineas.length]);

  if (!visible || lineas.length === 0) return null;
  return (
    <div className="subtitulos" role="log" aria-live="polite" aria-label="Subtítulos en vivo">
      {lineas.map((l) => (
        <p key={`${l.socketId}-${l.hasta}`} className={l.final ? '' : 'subtitulos__parcial'}>
          <strong>{l.nombre}:</strong> {l.texto}
        </p>
      ))}
    </div>
  );
};

export default Subtitulos;
