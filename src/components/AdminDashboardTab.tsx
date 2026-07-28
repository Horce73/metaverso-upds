// ─── Types ───────────────────────────────────────────────────────────────

export interface EspacioDetalle {
  id: number;
  nombre: string;
  tipo: 'campus' | 'aula';
  capacidad_max: number;
  ocupacion_actual: number;
}

export interface BitacoraEntry {
  id: number;
  usuario_id: number | null;
  evento: string;
  detalle: string;
  ip: string;
  fecha: string;
  email: string | null;
  nombre: string | null;
  apellido: string | null;
}

export interface Alerta {
  tipo: 'capacidad' | 'integridad' | 'info';
  severidad: 'critical' | 'warning' | 'info';
  mensaje: string;
  entidad?: { tipo: string; id: number };
}

export interface DashboardData {
  stats: {
    usuarios: {
      total: number;
      activos: number;
      por_rol: { administrador: number; docente: number; estudiante: number };
      nuevos_7d: number;
    };
    espacios: {
      total_activos: number;
      campus: number;
      aulas: number;
      capacidad_total: number;
      ocupacion_actual: number;
      detalle: EspacioDetalle[];
    };
    academico: {
      carreras_activas: number;
      asignaturas_activas: number;
      inscripciones_total: number;
      asistencia_promedio_pct: number;
    };
    actividad: {
      por_dia_7d: { fecha: string; eventos: number }[];
      eventos_24h: number;
      ultimos: BitacoraEntry[];
    };
  };
  alertas: Alerta[];
}

// ─── Validated color tokens (see docs/superpowers/specs/2026-07-28-admin-dashboard-design.md) ───

export const ROLE_COLORS: Record<string, string> = {
  administrador: '#d97706',
  docente: '#0d9488',
  estudiante: '#3b82f6',
};

const SEVERITY_STYLE: Record<Alerta['severidad'], { color: string; icon: string; label: string }> = {
  critical: { color: 'var(--error)', icon: '🔴', label: 'CRÍTICO' },
  warning: { color: 'var(--warning)', icon: '⚠️', label: 'ADVERTENCIA' },
  info: { color: 'var(--upds-blue-light)', icon: 'ℹ️', label: 'INFO' },
};

function capacityColor(ratio: number): string {
  if (ratio >= 1) return 'var(--error)';
  if (ratio >= 0.9) return 'var(--warning)';
  return 'var(--success)';
}

// ─── Alerts panel ────────────────────────────────────────────────────────

function AlertsPanel({ alertas }: { alertas: Alerta[] }) {
  if (alertas.length === 0) {
    return (
      <div style={{ padding: 16, color: 'var(--text-secondary)', fontSize: 14 }}>
        ✅ Sin alertas activas.
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
      {alertas.map((a, idx) => {
        const s = SEVERITY_STYLE[a.severidad];
        return (
          <div
            key={idx}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 8,
              background: 'rgba(255,255,255,0.03)',
              borderLeft: `3px solid ${s.color}`,
            }}
          >
            <span style={{ fontSize: 16 }}>{s.icon}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: s.color, letterSpacing: 0.5 }}>{s.label}</span>
            <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{a.mensaje}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Stat cards ──────────────────────────────────────────────────────────
// Inline-styled (not CSS classes) to match the rest of this dark-slate modal —
// `dashboard-stats`/`stat-card`/etc. classNames used by the pre-rewrite mock
// AdminPanel were never actually defined in index.css.

function StatCard({ icon, label, value, desc }: { icon: string; label: string; value: number | string; desc: string }) {
  return (
    <div style={{
      display: 'flex', gap: 14, alignItems: 'center',
      background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 16,
    }}>
      <div style={{ fontSize: 28 }}>{icon}</div>
      <div>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: 12 }}>{label}</p>
        <p style={{ margin: '2px 0', color: '#f1f5f9', fontSize: 24, fontWeight: 700 }}>{value}</p>
        <p style={{ margin: 0, color: '#64748b', fontSize: 11 }}>{desc}</p>
      </div>
    </div>
  );
}

function StatCards({ stats }: { stats: DashboardData['stats'] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
      <StatCard icon="👥" label="Usuarios Activos" value={stats.usuarios.activos} desc={`+${stats.usuarios.nuevos_7d} esta semana`} />
      <StatCard icon="🏫" label="Espacios Activos" value={stats.espacios.total_activos} desc={`${stats.espacios.campus} campus, ${stats.espacios.aulas} aulas`} />
      <StatCard icon="🎓" label="Asignaturas Activas" value={stats.academico.asignaturas_activas} desc={`${stats.academico.carreras_activas} carreras activas`} />
      <StatCard icon="📈" label="Asistencia Promedio" value={`${stats.academico.asistencia_promedio_pct}%`} desc={`${stats.academico.inscripciones_total} inscripciones totales`} />
    </div>
  );
}

// ─── Bar chart: Usuarios por rol ─────────────────────────────────────────

function RoleBarChart({ porRol }: { porRol: DashboardData['stats']['usuarios']['por_rol'] }) {
  const entries: [string, number][] = [
    ['administrador', porRol.administrador],
    ['docente', porRol.docente],
    ['estudiante', porRol.estudiante],
  ];
  const max = Math.max(1, ...entries.map(([, v]) => v));
  const rowHeight = 32;
  const chartWidth = 400;
  const labelWidth = 110;
  const barAreaWidth = chartWidth - labelWidth - 40;

  return (
    <svg width="100%" viewBox={`0 0 ${chartWidth} ${entries.length * rowHeight}`} role="img" aria-label="Usuarios por rol">
      {entries.map(([rol, valor], i) => {
        const w = Math.max(2, (valor / max) * barAreaWidth);
        const y = i * rowHeight + 6;
        return (
          <g key={rol}>
            <text x={0} y={y + 14} fill="var(--text-secondary)" fontSize={12} textAnchor="start">
              {rol.charAt(0).toUpperCase() + rol.slice(1)}
            </text>
            <rect x={labelWidth} y={y} width={barAreaWidth} height={18} rx={4} fill="rgba(255,255,255,0.05)" />
            <rect x={labelWidth} y={y} width={w} height={18} rx={4} fill={ROLE_COLORS[rol]} />
            <text x={labelWidth + w + 8} y={y + 14} fill="var(--text-primary)" fontSize={12} fontWeight={600}>
              {valor}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Capacity bars: Espacios ──────────────────────────────────────────────

function CapacityBars({ detalle }: { detalle: EspacioDetalle[] }) {
  if (detalle.length === 0) {
    return <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No hay espacios activos.</p>;
  }
  const rowHeight = 34;
  const chartWidth = 500;
  const labelWidth = 160;
  const barAreaWidth = chartWidth - labelWidth - 50;

  return (
    <svg width="100%" viewBox={`0 0 ${chartWidth} ${detalle.length * rowHeight}`} role="img" aria-label="Ocupación de espacios">
      {detalle.map((e, i) => {
        const ratio = e.capacidad_max > 0 ? e.ocupacion_actual / e.capacidad_max : 0;
        const w = Math.max(2, Math.min(1, ratio) * barAreaWidth);
        const y = i * rowHeight + 6;
        return (
          <g key={e.id}>
            <title>{`${e.nombre}: ${e.ocupacion_actual}/${e.capacidad_max}`}</title>
            <text x={0} y={y + 14} fill="var(--text-secondary)" fontSize={12}>
              {e.nombre.length > 20 ? `${e.nombre.slice(0, 20)}…` : e.nombre}
            </text>
            <rect x={labelWidth} y={y} width={barAreaWidth} height={18} rx={4} fill="rgba(255,255,255,0.05)" />
            <rect x={labelWidth} y={y} width={w} height={18} rx={4} fill={capacityColor(ratio)} />
            <text x={labelWidth + barAreaWidth + 8} y={y + 14} fill="var(--text-primary)" fontSize={11}>
              {e.ocupacion_actual}/{e.capacidad_max}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Line chart: Actividad 7 días ─────────────────────────────────────────

function ActivityLineChart({ porDia }: { porDia: { fecha: string; eventos: number }[] }) {
  const width = 500;
  const height = 160;
  const padding = 30;
  const max = Math.max(1, ...porDia.map((d) => d.eventos));
  const stepX = (width - padding * 2) / Math.max(1, porDia.length - 1);

  const points = porDia.map((d, i) => {
    const x = padding + i * stepX;
    const y = height - padding - (d.eventos / max) * (height - padding * 2);
    return { x, y, ...d };
  });

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Eventos del sistema, últimos 7 días">
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--panel-border)" strokeWidth={1} />
      <path d={path} fill="none" stroke="var(--upds-blue-light)" strokeWidth={2} />
      {points.map((p) => (
        <g key={p.fecha}>
          <title>{`${p.fecha}: ${p.eventos} eventos`}</title>
          <circle cx={p.x} cy={p.y} r={8} fill="transparent" />
          <circle cx={p.x} cy={p.y} r={4} fill="var(--upds-blue-light)" />
          <text x={p.x} y={height - padding + 14} fill="var(--text-secondary)" fontSize={10} textAnchor="middle">
            {p.fecha.slice(5)}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ─── Composed dashboard tab ────────────────────────────────────────────────

export default function AdminDashboardTab({ data }: { data: DashboardData }) {
  return (
    <div>
      <AlertsPanel alertas={data.alertas} />
      <StatCards stats={data.stats} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 32 }}>
        <div>
          <h3 style={{ color: 'var(--text-primary)', fontSize: 15, marginBottom: 12 }}>Usuarios por rol</h3>
          <RoleBarChart porRol={data.stats.usuarios.por_rol} />
        </div>
        <div>
          <h3 style={{ color: 'var(--text-primary)', fontSize: 15, marginBottom: 12 }}>Ocupación de espacios</h3>
          <CapacityBars detalle={data.stats.espacios.detalle} />
        </div>
      </div>

      <div style={{ marginTop: 32 }}>
        <h3 style={{ color: 'var(--text-primary)', fontSize: 15, marginBottom: 12 }}>Actividad del sistema (7 días)</h3>
        <ActivityLineChart porDia={data.stats.actividad.por_dia_7d} />
      </div>
    </div>
  );
}
