import React, { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import type { AudioClient } from './AudioClient.js';

// Modo sin 3D (A11Y-04): reemplaza al MetaversoCanvas cuando el equipo no
// tiene WebGL, cuando la escena no carga, o cuando la persona lo elige. No
// importa nada de three.js, así que tampoco descarga ese paquete. Todo lo
// demás (chat, voz, pizarra, materiales, pantalla compartida, mano levantada)
// vive fuera del canvas y sigue igual.

export type MotivoSinTresD = 'sin-webgl' | 'fallo' | 'elegido';

interface EspacioResumen {
  id: number | string;
  nombre: string;
  tipo: string;
  sesion_activa?: { tema?: string } | null;
}

interface VistaSinTresDProps {
  socket: Socket;
  audioClient: AudioClient | null;
  espacio: EspacioResumen;
  espacios: EspacioResumen[];
  remoteUsers: { [socketId: string]: any };
  marcas?: Record<string, string>;
  pantallaUrl: string | null;
  pantallaPor?: string;
  /** Punto donde queda "parado" para la voz por zonas y para los demás. */
  posicion: [number, number, number];
  motivo: MotivoSinTresD;
  esInvitado: boolean;
  onEntrarAula: (espacio: EspacioResumen) => void;
  onVerPantallaGrande: () => void;
  /** Sólo si el equipo puede mostrar 3D. */
  onVolverTresD?: () => void;
}

const TEXTO_MOTIVO: Record<MotivoSinTresD, string> = {
  'sin-webgl': 'Este equipo no puede mostrar gráficos 3D (WebGL no está disponible).',
  fallo: 'La escena 3D no pudo cargarse.',
  elegido: 'Elegiste el modo sin 3D.',
};

export const VistaSinTresD: React.FC<VistaSinTresDProps> = ({
  socket,
  audioClient,
  espacio,
  espacios,
  remoteUsers,
  marcas,
  pantallaUrl,
  pantallaPor,
  posicion,
  motivo,
  esInvitado,
  onEntrarAula,
  onVerPantallaGrande,
  onVolverTresD,
}) => {
  // Sin avatar que camine, nadie emite 'move': se anuncia una vez el punto de
  // llegada para que los demás lo ubiquen y la voz por zonas lo incluya (el
  // docente difunde a toda el aula, así que se le oye desde cualquier lugar).
  useEffect(() => {
    const anunciar = () =>
      socket.emit('move', { position: posicion, rotation: [0, Math.PI, 0], estaSentado: false, t: performance.now() });
    anunciar();
    // Por si el join todavía no se había procesado al montar
    socket.on('join_aceptado', anunciar);
    return () => {
      socket.off('join_aceptado', anunciar);
    };
  }, [socket, posicion]);

  const participantes = Object.entries(remoteUsers);
  const aulas = espacios.filter((e) => e.tipo === 'aula');

  return (
    <main className="vista-sin-3d" aria-label={`${espacio.nombre}, modo sin 3D`}>
      <div className="vista-sin-3d__aviso glass-panel" role="status">
        <span>
          🧊 <strong>Modo sin 3D.</strong> {TEXTO_MOTIVO[motivo]} El chat, la voz, la pizarra y los materiales funcionan igual.
        </span>
        {onVolverTresD && (
          <button type="button" className="btn-secondary" onClick={onVolverTresD}>
            Probar el modo 3D
          </button>
        )}
      </div>

      {espacio.tipo === 'aula' && (
        <section className="vista-sin-3d__seccion glass-panel" aria-labelledby="titulo-pantalla">
          <h2 id="titulo-pantalla">📽️ Pantalla del aula</h2>
          {pantallaUrl ? (
            <button type="button" className="vista-sin-3d__pantalla" onClick={onVerPantallaGrande}>
              <img src={pantallaUrl} alt={`Pantalla compartida por ${pantallaPor ?? 'el docente'}`} />
            </button>
          ) : (
            <p className="vista-sin-3d__vacio">Nadie está compartiendo pantalla. La pizarra y los materiales están en la barra de abajo.</p>
          )}
        </section>
      )}

      {espacio.tipo !== 'aula' && (
        <section className="vista-sin-3d__seccion glass-panel" aria-labelledby="titulo-aulas">
          <h2 id="titulo-aulas">🏫 Aulas</h2>
          {esInvitado ? (
            <p className="vista-sin-3d__vacio">Las aulas son para cuentas UPDS. Inicia sesión con tu cuenta para entrar a una clase.</p>
          ) : aulas.length === 0 ? (
            <p className="vista-sin-3d__vacio">Todavía no hay aulas habilitadas.</p>
          ) : (
            <ul className="vista-sin-3d__lista">
              {aulas.map((aula) => (
                <li key={aula.id}>
                  <span>
                    <strong>{aula.nombre}</strong>
                    <small>{aula.sesion_activa ? `🟢 Clase en curso: ${aula.sesion_activa.tema || 'sin tema'}` : '🔴 Sin clase activa'}</small>
                  </span>
                  <button type="button" className="btn-primary" onClick={() => onEntrarAula(aula)}>
                    Entrar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="vista-sin-3d__seccion glass-panel" aria-labelledby="titulo-presentes">
        <h2 id="titulo-presentes">👥 En {espacio.tipo === 'aula' ? 'el aula' : 'el campus'} ({participantes.length + 1})</h2>
        <ul className="vista-sin-3d__personas">
          <li>Tú</li>
          {participantes.map(([socketId, u]) => (
            <li key={socketId}>
              {u.peerId && audioClient && <IndicadorVoz audioClient={audioClient} peerId={u.peerId} />}
              {marcas?.[socketId] && <span aria-label={marcas[socketId] === '✋' ? 'mano levantada' : 'con la palabra'}>{marcas[socketId]} </span>}
              {u.nombreVisible || 'Estudiante'}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
};

// Punto que se enciende mientras la persona habla. Igual que el anillo de voz
// del 3D (VOZ-02), lee el nivel por cuadro sin pasar por el estado de React.
const UMBRAL_HABLA = 0.02;

const IndicadorVoz: React.FC<{ audioClient: AudioClient; peerId: string }> = ({ audioClient, peerId }) => {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let id = 0;
    const tick = () => {
      if (ref.current) ref.current.classList.toggle('hablando', audioClient.nivelDe(peerId) > UMBRAL_HABLA);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [audioClient, peerId]);
  return <span ref={ref} className="vista-sin-3d__voz" aria-hidden="true" />;
};

export default VistaSinTresD;
