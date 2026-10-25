import React, { useCallback, useEffect, useState } from 'react';

// Actas de clase (AULA-04): todo lo que quedó de cada clase en orden —
// entradas y salidas, chat, materiales, encuestas y, si se grabó, los
// subtítulos y las capturas de la pantalla compartida. Se descarga como un
// HTML que se lee sin conexión.

interface ClaseConActa {
  id: number;
  tema: string | null;
  inicio: string;
  estado: string;
  espacio: string;
  asignatura_codigo: string;
  asignatura: string;
  grabaciones: number;
}

interface EventoActa {
  tipo: 'grabacion_inicio' | 'grabacion_fin' | 'entrada' | 'salida' | 'chat' | 'subtitulo' | 'pantalla' | 'material' | 'encuesta';
  en: string;
  autor?: string;
  texto?: string;
  capturaId?: string;
  opciones?: { texto: string; votos: number }[];
}

const ETIQUETA: Record<EventoActa['tipo'], string> = {
  grabacion_inicio: '⏺ Empieza la grabación',
  grabacion_fin: '⏹ Termina la grabación',
  entrada: '→ Entra',
  salida: '← Sale',
  chat: '💬',
  subtitulo: '🗣️',
  pantalla: '📽️ Pantalla compartida',
  material: '📚 Material mostrado',
  encuesta: '📊 Encuesta',
};
const MENORES = new Set<EventoActa['tipo']>(['entrada', 'salida', 'grabacion_inicio', 'grabacion_fin']);

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const ActasClase: React.FC<{ token: string }> = ({ token }) => {
  const [clases, setClases] = useState<ClaseConActa[] | null>(null);
  const [elegida, setElegida] = useState<number | null>(null);
  const [eventos, setEventos] = useState<EventoActa[] | null>(null);
  const [soloGrabadas, setSoloGrabadas] = useState(false);
  // Con 30 alumnos que entran y salen, las entradas tapan el resto
  const [verMovimientos, setVerMovimientos] = useState(false);
  const [error, setError] = useState('');

  const pedir = useCallback(
    async (ruta: string) => {
      const res = await fetch(ruta, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `Error ${res.status}`);
      return res;
    },
    [token]
  );

  useEffect(() => {
    pedir('/api/actas').then((r) => r.json()).then(setClases).catch((e) => setError(e.message));
  }, [pedir]);

  useEffect(() => {
    if (elegida === null) return;
    setEventos(null);
    pedir(`/api/actas/${elegida}`)
      .then((r) => r.json())
      .then((d) => setEventos(d.eventos))
      .catch((e) => setError(e.message));
  }, [elegida, pedir]);

  const descargar = async () => {
    try {
      const res = await pedir(`/api/actas/${elegida}?formato=html`);
      const nombre = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'acta.html';
      const url = URL.createObjectURL(await res.blob());
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombre;
      enlace.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (error) return <p role="alert" style={{ color: 'var(--error)' }}>⚠️ {error}</p>;
  if (!clases) return <p style={{ color: 'var(--text-secondary)' }}>Cargando clases…</p>;
  if (clases.length === 0) return <p style={{ color: 'var(--text-secondary)' }}>Todavía no hay clases dictadas.</p>;

  const visibles = soloGrabadas ? clases.filter((c) => c.grabaciones > 0) : clases;
  const actual = clases.find((c) => c.id === elegida);

  return (
    <div className="actas">
      <div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          <input type="checkbox" checked={soloGrabadas} onChange={(e) => setSoloGrabadas(e.target.checked)} />
          Sólo clases grabadas
        </label>
        <ul className="actas__lista">
          {visibles.map((c) => (
            <li key={c.id}>
              <button type="button" className="actas__clase" aria-pressed={c.id === elegida} onClick={() => setElegida(c.id)}>
                {c.grabaciones > 0 && <span aria-label="grabada">⏺ </span>}
                {c.tema || 'Clase sin tema'}
                <small>
                  {fecha(c.inicio)} {hora(c.inicio)} · {c.asignatura_codigo} · {c.espacio}
                </small>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <section aria-live="polite">
        {!actual ? (
          <p style={{ color: 'var(--text-secondary)' }}>Elige una clase para ver su acta.</p>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>
                {actual.tema || 'Clase'} — {fecha(actual.inicio)}
              </h3>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                <input type="checkbox" checked={verMovimientos} onChange={(e) => setVerMovimientos(e.target.checked)} />
                Mostrar entradas y salidas
              </label>
              <button type="button" className="btn-primary" style={{ margin: 0 }} onClick={descargar} disabled={!eventos}>
                ⬇️ Descargar acta (HTML)
              </button>
            </div>
            {!eventos ? (
              <p style={{ color: 'var(--text-secondary)' }}>Cargando acta…</p>
            ) : eventos.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No quedó nada registrado de esta clase.</p>
            ) : (
              <ol className="actas__linea">
                {eventos.filter((e) => verMovimientos || (e.tipo !== 'entrada' && e.tipo !== 'salida')).map((e, i) => (
                  <li key={i} className={MENORES.has(e.tipo) ? 'actas__menor' : ''}>
                    <time dateTime={e.en}>{hora(e.en)}</time>
                    {ETIQUETA[e.tipo]} {e.autor && <strong>{e.autor}</strong>} {e.texto}
                    {e.opciones && (
                      <ul>
                        {e.opciones.map((o) => (
                          <li key={o.texto} style={{ border: 0, padding: '2px 0' }}>
                            {o.texto}: {o.votos}
                          </li>
                        ))}
                      </ul>
                    )}
                    {e.capturaId && <Captura token={token} id={e.capturaId} cuando={hora(e.en)} />}
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </section>
    </div>
  );
};

// La imagen pide autenticación: un <img src> directo no lleva el token.
const Captura: React.FC<{ token: string; id: string; cuando: string }> = ({ token, id, cuando }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let creada: string | null = null;
    let vigente = true;
    fetch(`/api/actas/captura/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (!b || !vigente) return;
        creada = URL.createObjectURL(b);
        setUrl(creada);
      })
      .catch(() => {});
    return () => {
      vigente = false;
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [token, id]);
  return url ? <img src={url} alt={`Pantalla compartida a las ${cuando}`} loading="lazy" /> : null;
};

export default ActasClase;
