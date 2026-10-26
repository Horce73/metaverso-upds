import { useCallback, useEffect, useState } from 'react';

// Solicitudes de rol docente pendientes (SEC-07): quien se registra como
// docente entra como estudiante hasta que un administrador lo aprueba acá.
interface Solicitud {
  usuario_id: number;
  email: string;
  nombre: string;
  apellido: string;
  creada_en: string;
}

export function SolicitudesDocente({ token, onResuelta }: { token: string; onResuelta: () => void }) {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [resolviendo, setResolviendo] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/solicitudes-docente', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setSolicitudes(await res.json());
    } catch {
      // Sin la lista no se muestra el recuadro; la gestión de usuarios sigue igual
    }
  }, [token]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const resolver = async (s: Solicitud, aprobar: boolean) => {
    if (!aprobar && !confirm(`¿Rechazar la solicitud de ${s.nombre} ${s.apellido}? Seguirá como estudiante.`)) return;
    setResolviendo(s.usuario_id);
    try {
      const res = await fetch(`/api/admin/solicitudes-docente/${s.usuario_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ aprobar }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSolicitudes((prev) => prev.filter((x) => x.usuario_id !== s.usuario_id));
      onResuelta();
    } catch (err: any) {
      alert(err.message || 'No se pudo resolver la solicitud');
    } finally {
      setResolviendo(null);
    }
  };

  if (solicitudes.length === 0) return null;

  return (
    <section
      aria-label="Solicitudes de rol docente"
      style={{ background: '#1e293b', border: '1px solid #854d0e', borderRadius: 12, padding: 16, marginBottom: 20 }}
    >
      <h4 style={{ color: '#fbbf24', margin: '0 0 4px 0', fontSize: 15 }}>
        Solicitudes de rol docente ({solicitudes.length})
      </h4>
      <p style={{ color: '#94a3b8', fontSize: 13, margin: '0 0 12px 0' }}>
        Se registraron como docentes. Hasta que las apruebes entran como estudiantes. Verifica que sean docentes de la UPDS antes de aprobar.
      </p>
      {solicitudes.map((s) => (
        <div
          key={s.usuario_id}
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderTop: '1px solid #334155', flexWrap: 'wrap' }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ color: '#f1f5f9', fontSize: 14 }}>
              {s.nombre} {s.apellido}
            </div>
            <div style={{ color: '#94a3b8', fontSize: 12 }}>
              {s.email} · {new Date(s.creada_en).toLocaleString()}
            </div>
          </div>
          <button
            disabled={resolviendo === s.usuario_id}
            onClick={() => resolver(s, true)}
            style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 13 }}
          >
            Aprobar como docente
          </button>
          <button
            disabled={resolviendo === s.usuario_id}
            onClick={() => resolver(s, false)}
            style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#7f1d1d', color: '#fff', cursor: 'pointer', fontSize: 13 }}
          >
            Rechazar
          </button>
        </div>
      ))}
    </section>
  );
}
