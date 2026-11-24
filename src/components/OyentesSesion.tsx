import { useCallback, useEffect, useState } from 'react';
import { Dialogo } from './Dialogo.js';

interface EstadoAcceso {
  habilitado: boolean;
  maxOyentes: number;
  conectados: number;
  venceEn: string | null;
}

interface OyentesSesionProps {
  sesionId: string | number;
  token: string;
  onClose: () => void;
}

export function OyentesSesion({ sesionId, token, onClose }: OyentesSesionProps) {
  const [estado, setEstado] = useState<EstadoAcceso | null>(null);
  const [maxOyentes, setMaxOyentes] = useState(20);
  const [enlace, setEnlace] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const url = `/api/sesiones/${sesionId}/oyentes`;
  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo consultar el acceso.');
      setEstado(data);
      setMaxOyentes(data.maxOyentes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo consultar el acceso.');
    } finally {
      setCargando(false);
    }
  }, [token, url]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const habilitar = async () => {
    setGuardando(true);
    setError('');
    setEnlace('');
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ maxOyentes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo habilitar el acceso.');
      setEnlace(`${window.location.origin}/#/oyente/${encodeURIComponent(data.codigo)}`);
      setEstado({ habilitado: true, maxOyentes: data.maxOyentes, conectados: 0, venceEn: data.venceEn });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo habilitar el acceso.');
    } finally {
      setGuardando(false);
    }
  };

  const cerrarAcceso = async () => {
    setGuardando(true);
    setError('');
    try {
      const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cerrar el acceso.');
      setEnlace('');
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cerrar el acceso.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo etiqueta="Acceso de oyentes" onClose={onClose} className="glass-panel" style={{ maxWidth: 520 }}>
      <h2 className="gradient-text">Acceso de oyentes</h2>
      <p style={{ color: 'var(--text-secondary)' }}>
        Los oyentes pueden observar y escuchar, pero no escribir en el chat, usar el micrófono ni interactuar con la clase.
      </p>
      {cargando ? <p role="status">Consultando acceso…</p> : estado && (
        <section aria-live="polite">
          <p>
            Estado: <strong>{estado.habilitado ? 'Habilitado' : 'Cerrado'}</strong>
            {estado.habilitado && <> · Conectados: {estado.conectados}/{estado.maxOyentes}</>}
          </p>
          {estado.habilitado && estado.venceEn && (
            <p style={{ color: 'var(--text-secondary)' }}>
              Vence: {new Date(estado.venceEn).toLocaleString()}
            </p>
          )}
        </section>
      )}
      {!estado?.habilitado && (
        <label style={{ display: 'grid', gap: 8, margin: '16px 0' }}>
          Máximo de oyentes
          <input
            type="number"
            min={1}
            max={100}
            value={maxOyentes}
            onChange={(e) => setMaxOyentes(Number(e.target.value))}
          />
        </label>
      )}
      {enlace && (
        <div style={{ display: 'grid', gap: 8, margin: '16px 0' }}>
          <label htmlFor="enlace-oyentes">Enlace para compartir (se muestra solo ahora)</label>
          <input id="enlace-oyentes" readOnly value={enlace} onFocus={(e) => e.currentTarget.select()} />
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            Regenerar el enlace invalidará el anterior.
          </p>
        </div>
      )}
      {error && <p role="alert" style={{ color: 'var(--error)' }}>{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
        {estado?.habilitado ? (
          <>
            <button type="button" className="btn-secondary" disabled={guardando} onClick={habilitar}>
              Regenerar enlace
            </button>
            <button type="button" className="btn-secondary" disabled={guardando} onClick={cerrarAcceso}>
              Cerrar acceso
            </button>
          </>
        ) : (
          <button type="button" className="btn-primary" disabled={guardando || cargando} onClick={habilitar}>
            {guardando ? 'Habilitando…' : 'Generar enlace'}
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button>
      </div>
    </Dialogo>
  );
}
