# Admin Dashboard — Stats, Charts & Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin a real "Dashboard" tab in `AdminPanel.tsx` with stat cards, three charts, and an on-the-fly computed alerts panel, backed by a single new `GET /api/admin/dashboard` endpoint — on top of the existing (currently unexecuted) CRUD plan that gives the admin real user/space/carrera/asignatura management.

**Architecture:** Backend adds one aggregating endpoint that runs several read-only SQL queries and computes alerts in JS (no new tables). Frontend adds a new self-contained component file (`AdminDashboardTab.tsx`) with hand-built SVG chart components (no new npm dependency), wired into `AdminPanel.tsx` as its default tab.

**Tech Stack:** Express.js + pg (node-postgres) + JWT auth middleware | React 19 + TypeScript + Vite | plain inline SVG for charts (no charting library)

**Design spec:** `docs/superpowers/specs/2026-07-28-admin-dashboard-design.md`

## Global Constraints

- No new npm dependencies (no chart library) — charts are hand-built SVG/React.
- No new DB tables — alerts are computed at request time from existing tables.
- Categorical role colors (bar chart + role badges) MUST use the validated triad
  `administrador: #d97706`, `docente: #0d9488`, `estudiante: #3b82f6` (the CRUD
  plan's original `#f59e0b`/`#8b5cf6`/`#3b82f6` failed CVD validation — see spec).
- Every alert / capacity-bar color MUST be paired with a visible icon and text
  label — color is never the sole signal (status colors reuse the app's
  existing `--success`/`--warning`/`--error`, which are only CVD-safe with this
  secondary encoding).
- No test framework exists in this repo (no jest/vitest). Verification = `tsc`
  compilation + manual walkthrough steps, matching the existing CRUD plan's
  Task 5 pattern.

---

## Task 0: Apply the prerequisite CRUD plan

**Files:** all files listed in `docs/superpowers/plans/2026-07-27-admin-crud.md`

- [ ] **Step 1: Confirm the CRUD plan has not already been applied**

Run: `grep -n "app.get('/api/admin/usuarios'" server/src/index.ts`
Expected: no match (if it already matches, skip to Step 3 of this task — the
CRUD plan is already applied, do not re-apply it).

- [ ] **Step 2: Apply the CRUD plan in full**

Read `docs/superpowers/plans/2026-07-27-admin-crud.md` completely and execute
every task in it in order (Task 1 through Task 5, including its own
verification and commit steps). That plan is self-contained and ready to run
as written — do not modify its content while applying it.

- [ ] **Step 3: Verify the result**

Run: `npx tsc --noEmit` in `server/` — expect no errors.
Run: `npx tsc -b --noEmit` in the repo root — expect no errors.
Run: `grep -n "type Tab = " src/components/AdminPanel.tsx`
Expected: `type Tab = 'usuarios' | 'espacios' | 'carreras' | 'asignaturas' | 'reportes';`

This confirms `AdminPanel.tsx` now has the real-API tab structure that Tasks 2-3
below will extend.

---

## Task 1: Backend — `GET /api/admin/dashboard` endpoint

**Files:**
- Modify: `server/src/index.ts`

**Interfaces:**
- Produces: `GET /api/admin/dashboard` → JSON body `{ stats: {...}, alertas: [...] }`
  matching the shape consumed by `AdminDashboardTab.tsx` in Task 2.

- [ ] **Step 1: Add the endpoint**

After the `GET /api/admin/bitacora` endpoint in `server/src/index.ts`, add:

```typescript
// ── Admin: Dashboard (stats + alertas calculadas al vuelo) ──────────────────
app.get('/api/admin/dashboard', authenticateJWT, requiereAdmin, async (req, res) => {
  try {
    const { rows: [usuariosRow] } = await pool.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE activo)::int AS activos,
             COUNT(*) FILTER (WHERE creado_en >= NOW() - INTERVAL '7 days')::int AS nuevos_7d
      FROM usuarios
    `);

    const { rows: rolRows } = await pool.query(`
      SELECT r.nombre, COUNT(*)::int AS cantidad
      FROM usuario_roles ur
      JOIN roles r ON r.id = ur.rol_id
      JOIN usuarios u ON u.id = ur.usuario_id
      WHERE u.activo = TRUE
      GROUP BY r.nombre
    `);
    const por_rol: Record<string, number> = { administrador: 0, docente: 0, estudiante: 0 };
    for (const r of rolRows) {
      if (r.nombre in por_rol) por_rol[r.nombre] = r.cantidad;
    }

    const { rows: espacioRows } = await pool.query(`
      SELECT e.id, e.nombre, e.tipo, e.capacidad_max,
             COALESCE(oc.ocupacion, 0)::int AS ocupacion_actual
      FROM espacios e
      LEFT JOIN (
        SELECT sc.espacio_id, COUNT(*)::int AS ocupacion
        FROM sesiones_clase sc
        JOIN asistencias a ON a.sesion_id = sc.id AND a.hora_salida IS NULL
        WHERE sc.estado = 'en_curso'
        GROUP BY sc.espacio_id
      ) oc ON oc.espacio_id = e.id
      WHERE e.activo = TRUE
      ORDER BY e.id
    `);
    const espacios = {
      total_activos: espacioRows.length,
      campus: espacioRows.filter((e: any) => e.tipo === 'campus').length,
      aulas: espacioRows.filter((e: any) => e.tipo === 'aula').length,
      capacidad_total: espacioRows.reduce((sum: number, e: any) => sum + e.capacidad_max, 0),
      ocupacion_actual: espacioRows.reduce((sum: number, e: any) => sum + e.ocupacion_actual, 0),
      detalle: espacioRows.map((e: any) => ({
        id: e.id, nombre: e.nombre, tipo: e.tipo,
        capacidad_max: e.capacidad_max, ocupacion_actual: e.ocupacion_actual
      }))
    };

    const { rows: [carrerasRow] } = await pool.query(`SELECT COUNT(*) FILTER (WHERE activa)::int AS n FROM carreras`);
    const { rows: [asignaturasRow] } = await pool.query(`SELECT COUNT(*) FILTER (WHERE activa)::int AS n FROM asignaturas`);
    const { rows: [inscripcionesRow] } = await pool.query(`SELECT COUNT(*)::int AS n FROM inscripciones`);
    const { rows: [asistenciasRow] } = await pool.query(`
      SELECT COUNT(*) FILTER (WHERE estado IN ('presente','tarde'))::int AS buenas,
             COUNT(*)::int AS total
      FROM asistencias
    `);
    const asistencia_promedio_pct = asistenciasRow.total > 0
      ? Math.round((asistenciasRow.buenas / asistenciasRow.total) * 100)
      : 0;

    const academico = {
      carreras_activas: carrerasRow.n,
      asignaturas_activas: asignaturasRow.n,
      inscripciones_total: inscripcionesRow.n,
      asistencia_promedio_pct
    };

    const { rows: diaRows } = await pool.query(`
      SELECT TO_CHAR(fecha, 'YYYY-MM-DD') AS dia, COUNT(*)::int AS eventos
      FROM bitacora
      WHERE fecha >= NOW() - INTERVAL '7 days'
      GROUP BY dia
      ORDER BY dia
    `);
    const porDiaMap = new Map<string, number>(diaRows.map((r: any) => [r.dia, r.eventos]));
    const por_dia_7d: { fecha: string; eventos: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      por_dia_7d.push({ fecha: key, eventos: porDiaMap.get(key) || 0 });
    }

    const { rows: [eventos24hRow] } = await pool.query(`
      SELECT COUNT(*)::int AS n FROM bitacora WHERE fecha >= NOW() - INTERVAL '24 hours'
    `);

    const { rows: ultimosRows } = await pool.query(`
      SELECT b.id, b.usuario_id, b.evento, b.detalle, b.ip, b.fecha, u.email, u.nombre, u.apellido
      FROM bitacora b
      LEFT JOIN usuarios u ON u.id = b.usuario_id
      ORDER BY b.fecha DESC
      LIMIT 10
    `);

    const actividad = {
      por_dia_7d,
      eventos_24h: eventos24hRow.n,
      ultimos: ultimosRows
    };

    // ── Alertas (calculadas al vuelo, sin tabla nueva) ──────────────────────
    const alertas: Array<{ tipo: string; severidad: string; mensaje: string; entidad?: { tipo: string; id: number } }> = [];

    for (const e of espacioRows) {
      const ratio = e.capacidad_max > 0 ? e.ocupacion_actual / e.capacidad_max : 0;
      if (ratio >= 1) {
        alertas.push({
          tipo: 'capacidad', severidad: 'critical',
          mensaje: `"${e.nombre}" está a capacidad máxima (${e.ocupacion_actual}/${e.capacidad_max})`,
          entidad: { tipo: 'espacio', id: e.id }
        });
      } else if (ratio >= 0.9) {
        alertas.push({
          tipo: 'capacidad', severidad: 'warning',
          mensaje: `"${e.nombre}" cerca de su capacidad máxima (${e.ocupacion_actual}/${e.capacidad_max})`,
          entidad: { tipo: 'espacio', id: e.id }
        });
      }
    }

    const { rows: usuariosSinRol } = await pool.query(`
      SELECT u.id, u.nombre, u.apellido
      FROM usuarios u
      LEFT JOIN usuario_roles ur ON ur.usuario_id = u.id
      WHERE u.activo = TRUE AND ur.usuario_id IS NULL
    `);
    for (const u of usuariosSinRol) {
      alertas.push({
        tipo: 'integridad', severidad: 'warning',
        mensaje: `El usuario "${u.nombre} ${u.apellido}" está activo pero no tiene ningún rol asignado`,
        entidad: { tipo: 'usuario', id: u.id }
      });
    }

    const { rows: aulasInactivas } = await pool.query(`
      SELECT e.id, e.nombre
      FROM espacios e
      JOIN asignaturas a ON a.id = e.asignatura_id
      WHERE e.tipo = 'aula' AND e.activo = TRUE AND a.activa = FALSE
    `);
    for (const e of aulasInactivas) {
      alertas.push({
        tipo: 'integridad', severidad: 'warning',
        mensaje: `El aula "${e.nombre}" está activa pero su asignatura fue desactivada`,
        entidad: { tipo: 'espacio', id: e.id }
      });
    }

    const { rows: asignaturasSinEspacio } = await pool.query(`
      SELECT a.id, a.nombre
      FROM asignaturas a
      LEFT JOIN espacios e ON e.asignatura_id = a.id
      WHERE a.activa = TRUE
      GROUP BY a.id, a.nombre
      HAVING COUNT(e.id) = 0
    `);
    for (const a of asignaturasSinEspacio) {
      alertas.push({
        tipo: 'integridad', severidad: 'warning',
        mensaje: `La asignatura "${a.nombre}" está activa pero no tiene ningún aula creada`,
        entidad: { tipo: 'asignatura', id: a.id }
      });
    }

    const { rows: carrerasSinAsignaturas } = await pool.query(`
      SELECT c.id, c.nombre
      FROM carreras c
      LEFT JOIN asignaturas a ON a.carrera_id = c.id AND a.activa = TRUE
      WHERE c.activa = TRUE
      GROUP BY c.id, c.nombre
      HAVING COUNT(a.id) = 0
    `);
    for (const c of carrerasSinAsignaturas) {
      alertas.push({
        tipo: 'integridad', severidad: 'warning',
        mensaje: `La carrera "${c.nombre}" está activa pero no tiene ninguna asignatura activa`,
        entidad: { tipo: 'carrera', id: c.id }
      });
    }

    const { rows: [nuevos24hRow] } = await pool.query(`
      SELECT COUNT(*)::int AS n FROM usuarios WHERE creado_en >= NOW() - INTERVAL '24 hours'
    `);
    if (nuevos24hRow.n > 0) {
      alertas.push({ tipo: 'info', severidad: 'info', mensaje: `${nuevos24hRow.n} usuario(s) nuevo(s) en las últimas 24 horas` });
    }

    const { rows: [clasesHoyRow] } = await pool.query(`
      SELECT COUNT(*)::int AS n FROM sesiones_clase WHERE inicio_real >= CURRENT_DATE
    `);
    if (clasesHoyRow.n > 0) {
      alertas.push({ tipo: 'info', severidad: 'info', mensaje: `${clasesHoyRow.n} sesión(es) de clase iniciada(s) hoy` });
    }

    const orden: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    alertas.sort((a, b) => orden[a.severidad] - orden[b.severidad]);

    res.json({
      stats: {
        usuarios: { total: usuariosRow.total, activos: usuariosRow.activos, por_rol, nuevos_7d: usuariosRow.nuevos_7d },
        espacios,
        academico,
        actividad
      },
      alertas
    });
  } catch (err) {
    console.error('Error al obtener dashboard:', err);
    res.status(500).json({ error: 'Error al obtener el dashboard' });
  }
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit` in `server/`
Expected: No errors

- [ ] **Step 3: Manual smoke test**

With the backend running and an admin JWT (see Task 4 for the login curl
command):

```bash
curl -H "Authorization: Bearer <TOKEN>" http://localhost:3001/api/admin/dashboard
```

Expected: JSON with `stats.usuarios.total >= 1` and an `alertas` array
(possibly empty).

- [ ] **Step 4: Commit**

```bash
git add server/src/index.ts
git commit -m "feat(admin): add GET /api/admin/dashboard endpoint with stats and computed alerts"
```

---

## Task 2: Frontend — `AdminDashboardTab.tsx` component

**Files:**
- Create: `src/components/AdminDashboardTab.tsx`

**Interfaces:**
- Consumes: nothing from other frontend files (self-contained; fetches
  nothing itself — receives its data as a prop).
- Produces: `export interface DashboardData { stats: {...}; alertas: Alerta[] }`
  and `export default function AdminDashboardTab({ data }: { data: DashboardData })`
  — Task 3 imports both.

- [ ] **Step 1: Create the file**

```tsx
import React from 'react';

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

function StatCard({ icon, label, value, desc }: { icon: string; label: string; value: number | string; desc: string }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div className="stat-content">
        <p className="stat-label">{label}</p>
        <p className="stat-number">{value}</p>
        <p className="stat-desc">{desc}</p>
      </div>
    </div>
  );
}

function StatCards({ stats }: { stats: DashboardData['stats'] }) {
  return (
    <div className="dashboard-stats">
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc -b --noEmit` in the repo root
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/AdminDashboardTab.tsx
git commit -m "feat(admin): add AdminDashboardTab with stat cards, charts, and alerts panel"
```

---

## Task 3: Frontend — Wire the Dashboard tab into `AdminPanel.tsx`

**Files:**
- Modify: `src/components/AdminPanel.tsx`

**Interfaces:**
- Consumes: `AdminDashboardTab`, `DashboardData` from `./AdminDashboardTab` (Task 2).

- [ ] **Step 1: Import the new component**

At the top of `src/components/AdminPanel.tsx`, after the existing imports, add:

```tsx
import AdminDashboardTab, { type DashboardData, ROLE_COLORS } from './AdminDashboardTab';
```

(Note: `type` is required on `DashboardData` here — this repo's `tsconfig` has `verbatimModuleSyntax` enabled, which rejects importing a type as a plain value import.)

- [ ] **Step 2: Extend the `Tab` type and default tab**

Find:

```tsx
type Tab = 'usuarios' | 'espacios' | 'carreras' | 'asignaturas' | 'reportes';
```

Replace with:

```tsx
type Tab = 'dashboard' | 'usuarios' | 'espacios' | 'carreras' | 'asignaturas' | 'reportes';
```

Find:

```tsx
export default function AdminPanel({ token, onClose }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('usuarios');
```

Replace with:

```tsx
export default function AdminPanel({ token, onClose }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
```

- [ ] **Step 3: Add dashboard state and fetch function**

Find:

```tsx
  const [bitacora, setBitacora] = useState<BitacoraEntry[]>([]);
```

Replace with:

```tsx
  const [bitacora, setBitacora] = useState<BitacoraEntry[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
```

Find:

```tsx
  const fetchBitacora = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/bitacora?limit=100', { headers });
      if (!res.ok) throw new Error('Error al cargar bitácora');
      setBitacora(await res.json());
    } catch (err: any) { notify('error', err.message); }
  }, [token]);
```

Add immediately after it:

```tsx
  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/dashboard', { headers });
      if (!res.ok) throw new Error('Error al cargar el dashboard');
      setDashboard(await res.json());
    } catch (err: any) { notify('error', err.message); }
  }, [token]);
```

- [ ] **Step 4: Load dashboard data on tab change**

Find:

```tsx
  useEffect(() => {
    setLoading(true);
    const load = async () => {
      switch (activeTab) {
        case 'usuarios': await fetchUsuarios(); break;
        case 'espacios': await fetchEspacios(); break;
        case 'carreras': await fetchCarreras(); break;
        case 'asignaturas': await fetchAsignaturas(); break;
        case 'reportes': await fetchBitacora(); break;
      }
      setLoading(false);
    };
    load();
  }, [activeTab, fetchUsuarios, fetchEspacios, fetchCarreras, fetchAsignaturas, fetchBitacora]);
```

Replace with:

```tsx
  useEffect(() => {
    setLoading(true);
    const load = async () => {
      switch (activeTab) {
        case 'dashboard': await fetchDashboard(); break;
        case 'usuarios': await fetchUsuarios(); break;
        case 'espacios': await fetchEspacios(); break;
        case 'carreras': await fetchCarreras(); break;
        case 'asignaturas': await fetchAsignaturas(); break;
        case 'reportes': await fetchBitacora(); break;
      }
      setLoading(false);
    };
    load();
  }, [activeTab, fetchDashboard, fetchUsuarios, fetchEspacios, fetchCarreras, fetchAsignaturas, fetchBitacora]);
```

- [ ] **Step 5: Add the tab button and a Refresh button**

Find:

```tsx
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #1e293b', padding: '0 24px' }}>
          {(['usuarios', 'espacios', 'carreras', 'asignaturas', 'reportes'] as Tab[]).map(tab => (
            <button key={tab} onClick={() => { setActiveTab(tab); setShowCreate(false); setEditingItem(null); }} style={{
              padding: '12px 20px', cursor: 'pointer', border: 'none',
              borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
              background: 'none', color: activeTab === tab ? '#3b82f6' : '#64748b',
              fontWeight: activeTab === tab ? 600 : 400, textTransform: 'capitalize', fontSize: 14,
            }}>
              {tab === 'usuarios' ? 'Usuarios' : tab === 'espacios' ? 'Espacios' : tab === 'carreras' ? 'Carreras' : tab === 'asignaturas' ? 'Asignaturas' : 'Reportes'}
            </button>
          ))}
        </div>
```

Replace with:

```tsx
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #1e293b', padding: '0 24px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex' }}>
            {(['dashboard', 'usuarios', 'espacios', 'carreras', 'asignaturas', 'reportes'] as Tab[]).map(tab => (
              <button key={tab} onClick={() => { setActiveTab(tab); setShowCreate(false); setEditingItem(null); }} style={{
                padding: '12px 20px', cursor: 'pointer', border: 'none',
                borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
                background: 'none', color: activeTab === tab ? '#3b82f6' : '#64748b',
                fontWeight: activeTab === tab ? 600 : 400, textTransform: 'capitalize', fontSize: 14,
              }}>
                {tab === 'dashboard' ? 'Dashboard' : tab === 'usuarios' ? 'Usuarios' : tab === 'espacios' ? 'Espacios' : tab === 'carreras' ? 'Carreras' : tab === 'asignaturas' ? 'Asignaturas' : 'Reportes'}
              </button>
            ))}
          </div>
          {activeTab === 'dashboard' && (
            <button onClick={() => fetchDashboard()} style={{ ...btnSmall, marginRight: 0 }}>
              ↻ Actualizar
            </button>
          )}
        </div>
```

- [ ] **Step 6: Render the Dashboard tab content**

Find:

```tsx
          {/* ═══ USUARIOS TAB ═══ */}
          {activeTab === 'usuarios' && !loading && (
```

Insert immediately before it:

```tsx
          {/* ═══ DASHBOARD TAB ═══ */}
          {activeTab === 'dashboard' && !loading && dashboard && (
            <AdminDashboardTab data={dashboard} />
          )}

```

- [ ] **Step 7: Fix the role-badge colors in `UsuariosTab` to match the validated palette**

Find (inside `UsuariosTab`):

```tsx
  const roleColors: Record<string, string> = {
    administrador: '#f59e0b', docente: '#8b5cf6', estudiante: '#3b82f6', invitado: '#64748b',
  };
```

Replace with:

```tsx
  const roleColors: Record<string, string> = {
    ...ROLE_COLORS, invitado: '#64748b',
  };
```

- [ ] **Step 8: Verify TypeScript compiles**

Run: `npx tsc -b --noEmit` in the repo root
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add src/components/AdminPanel.tsx
git commit -m "feat(admin): wire Dashboard tab into AdminPanel as the default tab"
```

---

## Task 4: Verify & manual test

- [ ] **Step 1: Start backend and frontend**

```bash
cd server && npm run dev
```

In a second terminal:

```bash
npm run dev
```

- [ ] **Step 2: Get an admin token**

```bash
curl -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@upds.edu.bo","password":"123456"}'
```

- [ ] **Step 3: Test the dashboard endpoint directly**

```bash
curl -H "Authorization: Bearer <TOKEN>" http://localhost:3001/api/admin/dashboard
```

Expected: `stats` object with `usuarios`, `espacios`, `academico`, `actividad`,
and an `alertas` array (check any capacity/integrity conditions you'd expect
given your current seed data actually appear).

- [ ] **Step 4: Test in the browser**

1. Log in as `admin@upds.edu.bo` / `123456`.
2. Click "🛡️ Panel Admin" — confirm the Dashboard tab is now the one shown by default.
3. Confirm: alerts panel (or "Sin alertas activas"), 4 stat cards, the role bar
   chart, the capacity bars, and the 7-day activity line chart all render with
   real numbers (not the old mock `mockUsers`/`mockSpaces` data).
4. Click "↻ Actualizar" — confirm it re-fetches without a full page reload.
5. Switch to Usuarios/Espacios/Carreras/Asignaturas/Reportes tabs — confirm
   they still work as delivered by the CRUD plan (Task 0).

- [ ] **Step 5: Final commit** (only if Step 4 required any fixes)

```bash
git add -A
git commit -m "fix(admin): address issues found in dashboard manual testing"
```
