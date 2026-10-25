import React, { useState } from 'react';
import { Dialogo } from './Dialogo.js';

// Encuesta en vivo del aula (AULA-05). El docente la arma y la cierra; cada
// estudiante elige una opción (puede cambiarla mientras está abierta) y ve el
// resultado al cerrarse. El servidor no manda el conteo a los estudiantes
// mientras está abierta, para que no influya en el voto.

export interface EncuestaEstado {
  id: number;
  pregunta: string;
  opciones: string[];
  abierta: boolean;
  total: number;
  votos: number[] | null;
  miVoto: number | null;
}

interface PanelEncuestaProps {
  encuesta: EncuestaEstado | null;
  dirige: boolean;
  onCrear: (pregunta: string, opciones: string[]) => void;
  onVotar: (opcion: number) => void;
  onCerrarEncuesta: () => void;
  onClose: () => void;
  /** Se abrió sola al lanzarse una encuesta: no se lleva el foco. */
  abiertaSola?: boolean;
}

const OPCIONES_INICIALES = ['', ''];
const MAX_OPCIONES = 6;

export const PanelEncuesta: React.FC<PanelEncuestaProps> = ({ encuesta, dirige, onCrear, onVotar, onCerrarEncuesta, onClose, abiertaSola = false }) => {
  const [armando, setArmando] = useState(!encuesta && dirige);
  const [pregunta, setPregunta] = useState('');
  const [opciones, setOpciones] = useState<string[]>(OPCIONES_INICIALES);

  const crear = (e: React.FormEvent) => {
    e.preventDefault();
    onCrear(pregunta, opciones);
    setArmando(false);
    setPregunta('');
    setOpciones(OPCIONES_INICIALES);
  };

  return (
    <Dialogo etiqueta="Encuesta" modal={false} enfocar={!abiertaSola} onClose={onClose} className="panel-encuesta glass-panel">
      <div className="panel-encuesta__cabecera">
        <h3>📊 Encuesta</h3>
        <button type="button" className="btn-secondary" onClick={onClose} aria-label="Cerrar encuesta">✕</button>
      </div>

      {armando ? (
        <form onSubmit={crear} className="panel-encuesta__form">
          <label>
            Pregunta
            <input className="form-input" value={pregunta} maxLength={200} onChange={(e) => setPregunta(e.target.value)} required />
          </label>
          {opciones.map((o, i) => (
            <label key={i}>
              Opción {i + 1}
              <input
                className="form-input"
                value={o}
                maxLength={80}
                onChange={(e) => setOpciones(opciones.map((x, j) => (j === i ? e.target.value : x)))}
                required={i < 2}
              />
            </label>
          ))}
          <div className="panel-encuesta__acciones">
            {opciones.length < MAX_OPCIONES && (
              <button type="button" className="btn-secondary" onClick={() => setOpciones([...opciones, ''])}>
                + Opción
              </button>
            )}
            <button type="submit" className="btn-primary">Lanzar encuesta</button>
          </div>
          {encuesta?.abierta && <p className="panel-encuesta__nota">Lanzar otra cierra la que está abierta.</p>}
        </form>
      ) : !encuesta ? (
        <p className="panel-encuesta__nota">No hay ninguna encuesta en esta clase.</p>
      ) : (
        <div>
          <p className="panel-encuesta__pregunta">{encuesta.pregunta}</p>
          <ul className="panel-encuesta__opciones">
            {encuesta.opciones.map((texto, i) => {
              const votos = encuesta.votos?.[i];
              const pct = votos !== undefined && encuesta.total > 0 ? Math.round((votos / encuesta.total) * 100) : 0;
              const elegida = encuesta.miVoto === i;
              return (
                <li key={i}>
                  {encuesta.abierta && !dirige ? (
                    <button
                      type="button"
                      className={`panel-encuesta__opcion ${elegida ? 'elegida' : ''}`}
                      aria-pressed={elegida}
                      onClick={() => onVotar(i)}
                    >
                      {elegida ? '✓ ' : ''}{texto}
                    </button>
                  ) : (
                    <div className="panel-encuesta__resultado">
                      <div className="panel-encuesta__etiqueta">
                        <span>{elegida ? '✓ ' : ''}{texto}</span>
                        {votos !== undefined && <span>{votos} · {pct}%</span>}
                      </div>
                      {votos !== undefined && (
                        <div className="panel-encuesta__pista" aria-hidden="true">
                          <span style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="panel-encuesta__nota" role="status">
            {encuesta.abierta
              ? dirige
                ? `${encuesta.total} ${encuesta.total === 1 ? 'voto' : 'votos'} hasta ahora`
                : encuesta.miVoto === null
                  ? 'Elige una opción. Verás el resultado cuando el docente cierre la encuesta.'
                  : 'Tu voto quedó registrado; puedes cambiarlo mientras siga abierta.'
              : `Encuesta cerrada · ${encuesta.total} ${encuesta.total === 1 ? 'voto' : 'votos'}`}
          </p>
          {dirige && (
            <div className="panel-encuesta__acciones">
              {encuesta.abierta && (
                <button type="button" className="btn-primary" onClick={onCerrarEncuesta}>
                  Cerrar y mostrar resultado
                </button>
              )}
              <button type="button" className="btn-secondary" onClick={() => setArmando(true)}>
                Nueva encuesta
              </button>
            </div>
          )}
        </div>
      )}
    </Dialogo>
  );
};

export default PanelEncuesta;
