import React, { useEffect, useState } from 'react';
import type { EstadoPreguntas } from './preguntas.js';

interface ColaPreguntasProps {
  estado: EstadoPreguntas;
  onCeder: (socketId: string) => void;
  onQuitar: () => void;
}

const esperando = (desde: number, ahora: number) => {
  const s = Math.max(0, Math.round((ahora - desde) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min`;
};

// Cola de manos levantadas que ve el docente (AULA-03): da la palabra en orden
// y la quita cuando termina la pregunta.
export const ColaPreguntas: React.FC<ColaPreguntasProps> = ({ estado, onCeder, onQuitar }) => {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (estado.cola.length === 0) return;
    const id = setInterval(() => setAhora(Date.now()), 5000);
    return () => clearInterval(id);
  }, [estado.cola.length]);

  if (estado.cola.length === 0 && !estado.palabra) return null;
  return (
    <div className="cola-preguntas glass-panel" role="region" aria-label="Preguntas de la clase">
      {estado.palabra && (
        <div className="cola-preguntas__palabra">
          <span>
            🎤 <strong>{estado.palabra.nombre}</strong> tiene la palabra
          </span>
          <button type="button" className="btn-secondary" onClick={onQuitar}>
            Quitar la palabra
          </button>
        </div>
      )}
      {estado.cola.length > 0 && (
        <>
          <div className="cola-preguntas__titulo">✋ Manos levantadas ({estado.cola.length})</div>
          <ol className="cola-preguntas__lista">
            {estado.cola.map((c) => (
              <li key={c.socketId}>
                <span className="cola-preguntas__nombre">{c.nombre}</span>
                <span className="cola-preguntas__espera">{esperando(c.desde, ahora)}</span>
                <button type="button" className="btn-primary" onClick={() => onCeder(c.socketId)}>
                  Dar la palabra
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
};
