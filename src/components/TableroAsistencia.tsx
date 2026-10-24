import React, { useCallback, useEffect, useState } from 'react';

// Tablero de asistencia del docente (DATA-01/02): por asignatura, cada clase
// dictada con presentes, tardanzas, ausentes y minutos efectivos, y cada
// inscrito con su porcentaje. Todo exportable a CSV para el sistema académico.

interface Asignatura {
  id: number;
  codigo: string;
  nombre: string;
  gestion: string;
  inscritos: number;
  sesiones: number;
}

type Estado = 'presente' | 'tarde' | 'ausente';

interface SesionResumen {
  id: number;
  tema: string | null;
  inicio: string;
  estado: string;
  duracion_min: number;
  presentes: number;
  tardes: number;
  ausentes: number;
  minutos_promedio: number;
}

interface EstudianteResumen {
  id: number;
  registro_upds: string | null;
  nombre: string;
  apellido: string;
  presentes: number;
  tardes: number;
  ausencias: number;
  minutos_total: number;
  porcentaje_asistencia: number;
}

interface Tablero {
  asignatura: { id: number; codigo: string; nombre: string; gestion: string };
  sesiones: SesionResumen[];
  estudiantes: EstudianteResumen[];
  celdas: Record<number, Record<number, { estado: Estado; minutos: number }>>;
}

interface DetalleSesion {
  sesion: SesionResumen;
  estudiantes: { id: number; registro_upds: string | null; nombre: string; apellido: string; estado: Estado; minutos: number; entrada: string | null; salida: string | null }[];
}

const ETIQUETA: Record<Estado, string> = { presente: 'Presente', tarde: 'Tarde', ausente: 'Ausente' };

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
const hora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : '—';

export const TableroAsistencia: React.FC<{ token: string }> = ({ token }) => {
  const [asignaturas, setAsignaturas] = useState<Asignatura[] | null>(null);
  const [asignaturaId, setAsignaturaId] = useState<number | null>(null);
  const [tablero, setTablero] = useState<Tablero | null>(null);
  const [detalle, setDetalle] = useState<DetalleSesion | null>(null);
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
    pedir('/api/asistencia/asignaturas')
      .then((r) => r.json())
      .then((lista: Asignatura[]) => {
        setAsignaturas(lista);
        if (lista.length > 0) setAsignaturaId(lista[0].id);
      })
      .catch((e) => setError(e.message));
  }, [pedir]);

  useEffect(() => {
    if (asignaturaId === null) return;
    setTablero(null);
    setDetalle(null);
    pedir(`/api/asistencia/asignaturas/${asignaturaId}`)
      .then((r) => r.json())
      .then(setTablero)
      .catch((e) => setError(e.message));
  }, [asignaturaId, pedir]);

  const abrirDetalle = (sesionId: number) => {
    pedir(`/api/asistencia/sesiones/${sesionId}`)
      .then((r) => r.json())
      .then(setDetalle)
      .catch((e) => setError(e.message));
  };

  // Con el token en la cabecera no alcanza un <a href>: se baja como blob y
  // se le pone el nombre que manda el servidor.
  const descargarCsv = async (ruta: string) => {
    try {
      const res = await pedir(`${ruta}?formato=csv`);
      const nombre = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'asistencia.csv';
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

  if (error) return <p role="alert" className="tablero-asistencia__error">⚠️ {error}</p>;
  if (!asignaturas) return <p className="tablero-asistencia__nota">Cargando asignaturas…</p>;
  if (asignaturas.length === 0) {
    return <p className="tablero-asistencia__nota">Todavía no dictaste clases en ninguna asignatura.</p>;
  }

  return (
    <div className="tablero-asistencia">
      <div className="tablero-asistencia__barra">
        <label>
          Asignatura{' '}
          <select value={asignaturaId ?? ''} onChange={(e) => setAsignaturaId(Number(e.target.value))}>
            {asignaturas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.codigo} · {a.nombre} ({a.gestion}) — {a.sesiones} clases, {a.inscritos} inscritos
              </option>
            ))}
          </select>
        </label>
        {tablero && (
          <button type="button" className="btn-primary" onClick={() => descargarCsv(`/api/asistencia/asignaturas/${tablero.asignatura.id}`)}>
            ⬇️ Exportar semestre (CSV)
          </button>
        )}
      </div>

      {!tablero ? (
        <p className="tablero-asistencia__nota">Cargando asistencia…</p>
      ) : tablero.sesiones.length === 0 ? (
        <p className="tablero-asistencia__nota">Esta asignatura todavía no tiene clases dictadas.</p>
      ) : (
        <>
          <h3>Clases dictadas</h3>
          <div className="tablero-asistencia__desplazable">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Tema</th>
                  <th scope="col">Duración</th>
                  <th scope="col">Presentes</th>
                  <th scope="col">Tardes</th>
                  <th scope="col">Ausentes</th>
                  <th scope="col">Minutos promedio</th>
                  <th scope="col"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {[...tablero.sesiones].reverse().map((s) => (
                  <tr key={s.id} aria-selected={detalle?.sesion.id === s.id}>
                    <td>{fecha(s.inicio)} {hora(s.inicio)}</td>
                    <td>
                      {s.tema || '—'}
                      {s.estado === 'en_curso' && <span className="status active"> en curso</span>}
                    </td>
                    <td>{s.duracion_min} min</td>
                    <td>{s.presentes}</td>
                    <td>{s.tardes}</td>
                    <td>{s.ausentes}</td>
                    <td>{s.minutos_promedio} min</td>
                    <td>
                      <button type="button" className="btn-small" onClick={() => abrirDetalle(s.id)}>
                        Detalle
                      </button>
                      <button type="button" className="btn-small" onClick={() => descargarCsv(`/api/asistencia/sesiones/${s.id}`)}>
                        CSV
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {detalle && (
            <section className="tablero-asistencia__detalle glass-panel" aria-label="Detalle de la clase">
              <div className="tablero-asistencia__barra">
                <h3>
                  {fecha(detalle.sesion.inicio)} — {detalle.sesion.tema || 'Sin tema'}
                </h3>
                <button type="button" className="btn-secondary" onClick={() => setDetalle(null)}>
                  Cerrar
                </button>
              </div>
              <div className="tablero-asistencia__desplazable">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th scope="col">Registro</th>
                      <th scope="col">Estudiante</th>
                      <th scope="col">Estado</th>
                      <th scope="col">Entrada</th>
                      <th scope="col">Salida</th>
                      <th scope="col">Minutos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.estudiantes.map((e) => (
                      <tr key={e.id}>
                        <td>{e.registro_upds || '—'}</td>
                        <td>{e.apellido}, {e.nombre}</td>
                        <td><span className={`estado-asistencia estado-asistencia--${e.estado}`}>{ETIQUETA[e.estado]}</span></td>
                        <td>{hora(e.entrada)}</td>
                        <td>{e.entrada && !e.salida ? 'sigue en el aula' : hora(e.salida)}</td>
                        <td>{e.minutos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <h3>Estudiantes</h3>
          <div className="tablero-asistencia__desplazable">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Registro</th>
                  <th scope="col">Estudiante</th>
                  <th scope="col">Presentes</th>
                  <th scope="col">Tardes</th>
                  <th scope="col">Ausencias</th>
                  <th scope="col">Asistencia</th>
                  <th scope="col">Minutos</th>
                </tr>
              </thead>
              <tbody>
                {tablero.estudiantes.map((e) => (
                  <tr key={e.id}>
                    <td>{e.registro_upds || '—'}</td>
                    <td>{e.apellido}, {e.nombre}</td>
                    <td>{e.presentes}</td>
                    <td>{e.tardes}</td>
                    <td>{e.ausencias}</td>
                    <td>
                      <span className="tablero-asistencia__porcentaje">
                        <span className="tablero-asistencia__pista" aria-hidden="true">
                          <span style={{ width: `${e.porcentaje_asistencia}%` }} />
                        </span>
                        {e.porcentaje_asistencia}%
                      </span>
                    </td>
                    <td>{e.minutos_total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default TableroAsistencia;
