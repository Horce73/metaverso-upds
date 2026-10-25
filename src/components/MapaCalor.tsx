import { useEffect, useMemo, useState } from 'react';

// Mapa de calor de uso (DATA-04): cuánto tiempo hubo gente en cada celda del
// piso de un espacio, visto desde arriba. Rampa secuencial de un solo tono:
// sobre la superficie oscura del panel, lo que casi no se usó se funde con el
// fondo y lo más usado queda claro.

interface EspacioMapa { id: number; nombre: string; tipo: 'campus' | 'aula' }
interface Celda { cx: number; cz: number; segundos: number }

const RAMPA = ['#0d366b', '#104281', '#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef', '#9ec5f4', '#b7d3f6', '#cde2fb'];
// El mapa apunta a este ancho; cada celda queda entre 8 y 24 px
const ANCHO_OBJETIVO = 480;

// Raíz: unos pocos lugares concentran casi todo el tiempo (la puerta, el
// frente del aula); en escala lineal el resto quedaría todo del mismo tono.
const colorDe = (segundos: number, max: number) =>
  RAMPA[Math.min(RAMPA.length - 1, Math.floor(Math.sqrt(segundos / max) * RAMPA.length))];

const minutos = (s: number) => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : `${Math.round(s / 60)} min`);
const haceDias = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

export function MapaCalor({ token }: { token: string }) {
  const [espacios, setEspacios] = useState<EspacioMapa[]>([]);
  const [espacioId, setEspacioId] = useState<number | null>(null);
  const [desde, setDesde] = useState(haceDias(30));
  const [hasta, setHasta] = useState(haceDias(0));
  const [datos, setDatos] = useState<{ tamano_celda: number; celdas: Celda[] } | null>(null);
  const [error, setError] = useState('');
  const [encima, setEncima] = useState<Celda | null>(null);
  const [verTabla, setVerTabla] = useState(false);

  useEffect(() => {
    fetch('/api/admin/espacios', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((lista: EspacioMapa[]) => {
        setEspacios(lista);
        if (lista.length) setEspacioId(lista[0].id);
      })
      .catch(() => setError('No se pudieron cargar los espacios'));
  }, [token]);

  useEffect(() => {
    if (espacioId === null) return;
    setDatos(null);
    const q = new URLSearchParams({ espacio_id: String(espacioId), desde, hasta });
    fetch(`/api/admin/mapa-calor?${q}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then(setDatos)
      .catch(() => setError('No se pudo cargar el mapa de calor'));
  }, [espacioId, desde, hasta, token]);

  const espacio = espacios.find((e) => e.id === espacioId);
  const vista = useMemo(() => {
    if (!datos) return null;
    const t = datos.tamano_celda;
    // El aula tiene paredes fijas en ±20; el campus crece con las aulas, así
    // que su marco sale de los datos.
    const esAula = espacio?.tipo === 'aula';
    const xs = datos.celdas.map((c) => c.cx);
    const zs = datos.celdas.map((c) => c.cz);
    const min = (v: number[], d: number) => (v.length ? Math.min(...v) : d);
    const max = (v: number[], d: number) => (v.length ? Math.max(...v) : d);
    const x0 = esAula ? -20 / t : min(xs, 0) - 2;
    const x1 = esAula ? 20 / t : max(xs, 0) + 3;
    const z0 = esAula ? -20 / t : min(zs, 0) - 2;
    const z1 = esAula ? 20 / t : max(zs, 0) + 3;
    const px = Math.max(8, Math.min(24, Math.floor(ANCHO_OBJETIVO / Math.max(x1 - x0, z1 - z0))));
    return {
      t,
      px,
      esAula,
      x0,
      z0,
      ancho: (x1 - x0) * px,
      alto: (z1 - z0) * px,
      maximo: Math.max(1, ...datos.celdas.map((c) => c.segundos)),
      total: datos.celdas.reduce((a, c) => a + c.segundos, 0),
    };
  }, [datos, espacio?.tipo]);

  const etiqueta: React.CSSProperties = { display: 'flex', flexDirection: 'column', color: '#94a3b8', fontSize: 12, gap: 4 };
  const campo: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#f1f5f9' };
  const rango = (c: Celda) =>
    vista ? `x ${c.cx * vista.t} a ${(c.cx + 1) * vista.t}, z ${c.cz * vista.t} a ${(c.cz + 1) * vista.t}` : '';

  return (
    <div>
      <h3 style={{ color: '#f1f5f9', margin: '0 0 6px 0' }}>Mapa de calor de uso</h3>
      <p style={{ color: '#94a3b8', margin: '0 0 16px 0', fontSize: 13 }}>
        Tiempo que hubo gente en cada lugar, visto desde arriba (celdas de {datos?.tamano_celda ?? 2}×{datos?.tamano_celda ?? 2} unidades). No identifica a nadie.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
        <label style={etiqueta}>
          Espacio
          <select style={campo} value={espacioId ?? ''} onChange={(e) => setEspacioId(Number(e.target.value))}>
            {espacios.map((e) => <option key={e.id} value={e.id}>{e.nombre} ({e.tipo})</option>)}
          </select>
        </label>
        <label style={etiqueta}>
          Desde
          <input style={campo} type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label style={etiqueta}>
          Hasta
          <input style={campo} type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        <button type="button" onClick={() => setVerTabla((v) => !v)} style={{ ...campo, cursor: 'pointer' }} aria-pressed={verTabla}>
          {verTabla ? 'Ver mapa' : 'Ver como tabla'}
        </button>
      </div>

      {error && <p role="alert" style={{ color: '#f87171' }}>{error}</p>}
      {!datos || !vista ? (
        !error && <p style={{ color: '#64748b' }}>Cargando…</p>
      ) : datos.celdas.length === 0 ? (
        <p style={{ color: '#64748b' }}>Sin datos de uso en ese rango. Se registran mientras hay gente conectada.</p>
      ) : verTabla ? (
        <table style={{ borderCollapse: 'collapse', minWidth: 360 }}>
          <caption style={{ textAlign: 'left', color: '#94a3b8', fontSize: 13, paddingBottom: 8 }}>Los 20 lugares más usados</caption>
          <thead>
            <tr>
              {['Lugar (unidades del mapa)', 'Tiempo'].map((h) => (
                <th key={h} scope="col" style={{ textAlign: 'left', padding: '8px', color: '#64748b', fontSize: 13, fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...datos.celdas].sort((a, b) => b.segundos - a.segundos).slice(0, 20).map((c) => (
              <tr key={`${c.cx},${c.cz}`} style={{ borderTop: '1px solid #1e293b' }}>
                <td style={{ padding: '8px', color: '#f1f5f9', fontSize: 13 }}>{rango(c)}</td>
                <td style={{ padding: '8px', color: '#f1f5f9', fontSize: 13 }}>{minutos(c.segundos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', overflow: 'auto', maxWidth: '100%' }}>
            <svg
              width={vista.ancho}
              height={vista.alto}
              role="img"
              aria-label={`Mapa de calor de ${espacio?.nombre ?? 'espacio'}: ${minutos(vista.total)} de uso en total`}
              style={{ display: 'block', background: '#0b1220', borderRadius: 8 }}
              onMouseLeave={() => setEncima(null)}
            >
              {vista.esAula && (
                <>
                  <rect x={1} y={1} width={vista.ancho - 2} height={vista.alto - 2} fill="none" stroke="#334155" strokeWidth={2} />
                  <line x1={vista.ancho * 0.3} x2={vista.ancho * 0.7} y1={4} y2={4} stroke="#64748b" strokeWidth={4} />
                  <text x={vista.ancho / 2} y={20} textAnchor="middle" fill="#94a3b8" fontSize={11}>Pizarra</text>
                </>
              )}
              {datos.celdas.map((c) => (
                <rect
                  key={`${c.cx},${c.cz}`}
                  x={(c.cx - vista.x0) * vista.px + 1}
                  y={(c.cz - vista.z0) * vista.px + 1}
                  width={vista.px - 2}
                  height={vista.px - 2}
                  rx={2}
                  fill={colorDe(c.segundos, vista.maximo)}
                  stroke={encima === c ? '#f1f5f9' : 'none'}
                  strokeWidth={2}
                  onMouseEnter={() => setEncima(c)}
                />
              ))}
            </svg>
            {encima && (
              <div
                role="status"
                style={{
                  position: 'absolute',
                  left: Math.min((encima.cx - vista.x0 + 1) * vista.px + 8, vista.ancho - 150),
                  top: Math.max(0, (encima.cz - vista.z0) * vista.px - 8),
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 6,
                  padding: '6px 10px',
                  color: '#f1f5f9',
                  fontSize: 12,
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                <strong>{minutos(encima.segundos)}</strong>
                <div style={{ color: '#94a3b8' }}>{rango(encima)}</div>
              </div>
            )}
          </div>

          <div style={{ color: '#94a3b8', fontSize: 12, minWidth: 160 }}>
            <div style={{ marginBottom: 6 }}>Tiempo en cada lugar</div>
            <div style={{ height: 10, width: 160, borderRadius: 4, background: `linear-gradient(to right, ${RAMPA.join(', ')})` }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span>poco</span>
              <span>{minutos(vista.maximo)}</span>
            </div>
            <div style={{ marginTop: 16, color: '#f1f5f9', fontSize: 14 }}>{minutos(vista.total)}</div>
            <div>de uso en total en el rango</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MapaCalor;
