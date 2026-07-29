import React, { useState } from 'react';

interface CrearCursoModalProps {
  espacio: {
    id: string;
    nombre: string;
    asignatura?: string;
    asignatura_codigo?: string;
  };
  token: string;
  onCursoCreado: (datos: { sesion: any; asignatura_codigo: string; asignatura_nombre: string }) => void;
  onClose: () => void;
}

export const CrearCursoModal: React.FC<CrearCursoModalProps> = ({
  espacio,
  token,
  onCursoCreado,
  onClose,
}) => {
  const [nombreCurso, setNombreCurso] = useState(espacio.asignatura || '');
  const [codigoCurso, setCodigoCurso] = useState(espacio.asignatura_codigo || `SIS-${espacio.id}`);
  const [tema, setTema] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!nombreCurso.trim() || !codigoCurso.trim() || !tema.trim()) {
      setErrorMsg('Por favor completa todos los campos para crear el curso e iniciar la clase.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/clases/crear-curso', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          espacio_id: espacio.id,
          nombre_curso: nombreCurso.trim(),
          codigo_curso: codigoCurso.trim().toUpperCase(),
          tema: tema.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al crear curso e iniciar clase');
      }

      onCursoCreado({
        sesion: data.sesion,
        asignatura_codigo: data.asignatura_codigo,
        asignatura_nombre: data.asignatura_nombre,
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Error de conexión con el servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="avatar-customizer-3d-wrapper" style={{ zIndex: 2500 }}>
      <div className="customizer-card glass-panel" style={{ maxWidth: '500px', width: '92vw', padding: '26px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <h2 className="gradient-text" style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>
              🎓 Iniciar / Crear Curso
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
              Configurar clase en {espacio.nombre}
            </p>
          </div>
          <button className="btn-secondary" onClick={onClose} style={{ padding: '4px 10px', fontSize: '0.9rem' }}>
            ✕
          </button>
        </div>

        {errorMsg && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '10px 14px', borderRadius: '10px', fontSize: '0.85rem', marginBottom: '16px' }}>
            ⚠️ {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label className="form-label">
              <span className="label-icon">📚</span> Nombre de la Materia / Curso
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="Ej. Ingeniería de Software II"
              value={nombreCurso}
              onChange={(e) => setNombreCurso(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              <span className="label-icon">🔑</span> Código de Acceso del Curso
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="Ej. SIS-301"
              value={codigoCurso}
              onChange={(e) => setCodigoCurso(e.target.value.toUpperCase())}
              required
              style={{ textTransform: 'uppercase' }}
            />
            <span className="form-hint">Este código servirá para que los alumnos ingresen directamente.</span>
          </div>

          <div className="form-group">
            <label className="form-label">
              <span className="label-icon">📖</span> Tema de la Clase de Hoy
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="Ej. Patrones de Diseño y Microservicios"
              value={tema}
              onChange={(e) => setTema(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{ flex: 2, background: 'linear-gradient(135deg, #059669, #10b981)', padding: '12px' }}
            >
              {loading ? 'Creando e iniciando...' : '🚀 Crear Curso e Iniciar Clase'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={loading}
              style={{ flex: 1 }}
            >
              Explorar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
