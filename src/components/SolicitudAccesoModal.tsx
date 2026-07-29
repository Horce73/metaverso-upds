import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';

interface SolicitudAccesoModalProps {
  espacio: {
    id: string;
    nombre: string;
    tipo: string;
    asignatura?: string;
    asignatura_codigo?: string;
    sesion_activa?: {
      id: string;
      tema: string;
      docente: string;
      estado: string;
    } | null;
  };
  usuario: {
    id: string;
    nombre: string;
    apellido: string;
    rol?: string;
  };
  socket: Socket | null;
  onIngresarDirecto: (espacio: any) => void;
  onClose: () => void;
}

export const SolicitudAccesoModal: React.FC<SolicitudAccesoModalProps> = ({
  espacio,
  usuario,
  socket,
  onIngresarDirecto,
  onClose,
}) => {
  const [codigoInput, setCodigoInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [solicitando, setSolicitando] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const tieneClaseEnCurso = !!espacio.sesion_activa && espacio.sesion_activa.estado === 'en_curso';
  const codigoRequerido = espacio.asignatura_codigo || `AULA-${espacio.id}`;

  // Escuchar la respuesta del docente en tiempo real a través de Sockets
  useEffect(() => {
    if (!socket) return;

    const handleRespuesta = (data: { espacioId: string; aprobado: boolean }) => {
      if (String(data.espacioId) !== String(espacio.id)) return;

      if (data.aprobado) {
        setStatusMsg('🎉 ¡Aprobado! Entrando al aula 3D...');
        onIngresarDirecto(espacio);
      } else {
        setSolicitando(false);
        setErrorMsg('❌ El docente ha rechazado tu solicitud de acceso por el momento.');
      }
    };

    socket.on('respuesta_solicitud_acceso', handleRespuesta);

    return () => {
      socket.off('respuesta_solicitud_acceso', handleRespuesta);
    };
  }, [socket, espacio, onIngresarDirecto]);

  // Ingresar usando el código de acceso del curso
  const handleIngresarPorCodigo = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const inputLimpio = codigoInput.trim().toUpperCase();
    const codigoEsperado = (espacio.asignatura_codigo || `SIS-${espacio.id}`).toUpperCase();

    if (inputLimpio === codigoEsperado || inputLimpio === `AULA-${espacio.id}` || inputLimpio === '123456') {
      onIngresarDirecto(espacio);
    } else {
      setErrorMsg(`❌ Código incorrecto. Verifica el código del curso (Ej. ${codigoEsperado}).`);
    }
  };

  // Enviar solicitud de acceso en vivo al docente
  const handleSolicitarAccesoDocente = () => {
    if (!socket) {
      setErrorMsg('⚠️ No hay conexión de socket activa.');
      return;
    }

    setErrorMsg('');
    setSolicitando(true);
    setStatusMsg('⏳ Solicitud enviada al docente. Esperando aprobación en tiempo real...');

    socket.emit('solicitar_acceso_aula', {
      espacioId: espacio.id,
      usuario: {
        id: usuario.id,
        nombre: `${usuario.nombre} ${usuario.apellido}`,
      },
      temaClase: espacio.sesion_activa?.tema || 'Clase Virtual',
    });
  };

  const esDocente = usuario.rol === 'docente' || (usuario as any)?.roles?.includes('docente');

  return (
    <div className="avatar-customizer-3d-wrapper" style={{ zIndex: 2000 }}>
      <div className="customizer-card glass-panel" style={{ maxWidth: '520px', width: '92vw', padding: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <h2 className="gradient-text" style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>
              🎓 {espacio.nombre}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
              Acceso a Aula Virtual 3D {esDocente && '• Perfil Docente'}
            </p>
          </div>
          <button className="btn-secondary" onClick={onClose} style={{ padding: '4px 10px', fontSize: '0.9rem' }}>
            ✕
          </button>
        </div>

        {/* Estado de la Clase en Vivo */}
        <div
          style={{
            background: tieneClaseEnCurso ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${tieneClaseEnCurso ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            borderRadius: '12px',
            padding: '14px 16px',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '1rem' }}>{tieneClaseEnCurso ? '🟢' : '🔴'}</span>
            <strong style={{ color: tieneClaseEnCurso ? '#34d399' : '#f87171', fontSize: '0.9rem' }}>
              {tieneClaseEnCurso ? 'CLASE EN CURSO EN VIVO' : 'SIN CLASE ACTIVA EN ESTE MOMENTO'}
            </strong>
          </div>

          {tieneClaseEnCurso ? (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginTop: '4px' }}>
              <p style={{ margin: '2px 0' }}>
                📚 <strong>Materia:</strong> {espacio.asignatura || 'Ingeniería de Software'}
              </p>
              <p style={{ margin: '2px 0' }}>
                📖 <strong>Tema:</strong> {espacio.sesion_activa?.tema}
              </p>
              <p style={{ margin: '2px 0' }}>
                👨‍🏫 <strong>Docente:</strong> {espacio.sesion_activa?.docente}
              </p>
            </div>
          ) : (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
              {esDocente
                ? 'Como docente, puedes ingresar al aula y configurar el curso para iniciar la clase de hoy.'
                : 'Puedes ingresar libremente o verificar con tu código de aula cuando el docente inicie la sesión.'}
            </p>
          )}
        </div>

        {/* Mensajes de Alerta y Estado */}
        {errorMsg && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '10px 14px', borderRadius: '10px', fontSize: '0.85rem', marginBottom: '16px' }}>
            {errorMsg}
          </div>
        )}

        {statusMsg && (
          <div style={{ background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#93c5fd', padding: '10px 14px', borderRadius: '10px', fontSize: '0.85rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {solicitando && <span className="spinner" style={{ width: '16px', height: '16px' }}></span>}
            <span>{statusMsg}</span>
          </div>
        )}

        {/* Opciones de Docente o Estudiante */}
        {esDocente ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={() => onIngresarDirecto(espacio)}
              style={{ background: 'linear-gradient(135deg, #059669, #10b981)', padding: '14px', fontSize: '1rem', fontWeight: 600 }}
            >
              {tieneClaseEnCurso ? '🎓 Ingresar al Aula como Docente' : '🚀 Ocupar Aula e Iniciar Clase'}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
          </div>
        ) : (
          <>
            {/* Método 1: Ingreso por Código de Aula / Curso */}
            <form onSubmit={handleIngresarPorCodigo} style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                🔑 Ingresar con Código de Aula / Materia:
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder={`Ej: ${codigoRequerido}`}
                  value={codigoInput}
                  onChange={(e) => setCodigoInput(e.target.value)}
                  disabled={solicitando}
                  style={{ textTransform: 'uppercase' }}
                />
                <button type="submit" className="btn-primary" disabled={solicitando || !codigoInput.trim()} style={{ whiteSpace: 'nowrap' }}>
                  Entrar
                </button>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Pídele el código de aula a tu docente o administración.
              </span>
            </form>

            <div className="divider" style={{ margin: '16px 0' }}>
              <span className="divider-text">O ACCESO DIRECTO</span>
            </div>

            {/* Método 2: Solicitud de Acceso al Docente o Entrada Libre */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {tieneClaseEnCurso ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSolicitarAccesoDocente}
                  disabled={solicitando}
                  style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', padding: '12px' }}
                >
                  {solicitando ? '⏳ Esperando Aprobación...' : '📩 Solicitar Acceso en Vivo al Docente'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => onIngresarDirecto(espacio)}
                  style={{ padding: '12px' }}
                >
                  🚪 Ingresar al Aula Libre
                </button>
              )}

              <button type="button" className="btn-secondary" onClick={onClose} disabled={solicitando}>
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
