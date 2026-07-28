# Admin Dashboard — Stats, Charts & Alerts Design

**Date:** 2026-07-28
**Status:** Approved by user, ready for implementation planning

## Context

The admin role is meant to have full control of the system. Two related efforts converge here:

1. **CRUD control** — already fully designed and written (unexecuted) in
   [`docs/superpowers/plans/2026-07-27-admin-crud.md`](../plans/2026-07-27-admin-crud.md).
   That plan rewrites `AdminPanel.tsx` to call real `/api/admin/*` endpoints for
   usuarios, espacios, carreras, and asignaturas, with a `reportes` tab showing the
   raw `bitacora` audit table. It replaces the current all-mock-data `AdminPanel.tsx`.
   It does **not** include a stats/overview tab — its default tab is `usuarios`.

2. **Dashboard: stats, charts, alerts** (this spec) — the user asked for the
   admin dashboard to show statistical boxes, charts, and alerts/notifications.
   This restores a `Dashboard` tab (as the first/default tab) to the CRUD plan's
   tab set, backed by real data instead of the mock stat cards in the current
   `AdminPanel.tsx`.

Separately, a role-name bug (`'admin'` vs the DB's `'administrador'`) that caused
admins to be treated as students was found and fixed during this session
(`src/App.tsx`, `server/src/index.ts`) — unrelated to this spec, already applied.

## Goal

Give the admin a Dashboard tab with:
- Numeric stat cards across four areas: usuarios, espacios, académico, actividad.
- Three charts built from that same data (bar, capacity bars, line).
- An alerts panel computed on the fly (no new DB table) covering capacity
  thresholds, data-integrity issues, and informational call-outs.

## Non-Goals

- No persisted/dismissible alerts (user chose "calculated on the fly").
- No live push/polling — data refreshes when the tab loads or the admin clicks Refresh.
- No new charting library — the project has none (`package.json` has no chart
  dependency) and the chart set is small enough to build as plain SVG/HTML.
- No changes to the existing CRUD plan's Usuarios/Espacios/Carreras/Asignaturas/Reportes tabs.

## Backend: `GET /api/admin/dashboard`

New endpoint, guarded by `authenticateJWT` + `requiereAdmin`, alongside the other
`/api/admin/*` routes from the CRUD plan. Runs a handful of SQL queries and
returns one aggregated payload — no new tables.

```
GET /api/admin/dashboard
→ {
  stats: {
    usuarios: {
      total: number,
      activos: number,
      por_rol: { administrador: number, docente: number, estudiante: number },
      nuevos_7d: number
    },
    espacios: {
      total_activos: number,
      campus: number,
      aulas: number,
      capacidad_total: number,
      ocupacion_actual: number,
      detalle: Array<{ id, nombre, tipo, capacidad_max, ocupacion_actual }>
    },
    academico: {
      carreras_activas: number,
      asignaturas_activas: number,
      inscripciones_total: number,
      // count(asistencias.estado IN ('presente','tarde')) / count(asistencias.*) * 100,
      // across all sesiones_clase rows (all-time, not windowed)
      asistencia_promedio_pct: number
    },
    actividad: {
      por_dia_7d: Array<{ fecha: string, eventos: number }>,  // for the line chart
      eventos_24h: number,
      ultimos: BitacoraEntry[10]
    }
  },
  alertas: Array<{
    tipo: 'capacidad' | 'integridad' | 'info',
    severidad: 'critical' | 'warning' | 'info',
    mensaje: string,
    entidad?: { tipo: string, id: number }
  }>
}
```

### Occupancy definition

`ocupacion_actual` for an espacio = count of `asistencias` rows with
`hora_salida IS NULL` joined to a `sesiones_clase` row with `estado = 'en_curso'`
for that espacio. This uses data already persisted by the existing attendance
flow — no coupling to the Socket.IO in-memory room state.

### Alert rules (computed at request time)

- **Capacidad** — espacio with `ocupacion_actual / capacidad_max >= 0.9` →
  `warning`; `>= 1.0` → `critical`.
- **Integridad**:
  - Usuario activo with no row in `usuario_roles`.
  - Aula (`espacios.tipo = 'aula'`) that is `activo = TRUE` but its linked
    `asignatura` is `activa = FALSE`.
  - Asignatura `activa = TRUE` with no espacio (aula) created for it.
  - Carrera `activa = TRUE` with zero asignaturas `activa = TRUE`.
- **Informativas**:
  - Count of usuarios created in the last 24h (one alert if > 0, with the count).
  - Count of `sesiones_clase` with `inicio_real` today (one alert if > 0).

Alerts array is sorted `critical` → `warning` → `info` before returning.

## Frontend: Dashboard tab

Added to the `AdminPanel.tsx` tab set from the CRUD plan (`Tab` type gains
`'dashboard'`, which becomes the default `activeTab`). Fetches
`GET /api/admin/dashboard` once on mount/tab-select, plus a manual "Actualizar"
button. Loading and error states follow the same pattern as the other tabs
(`loading` flag, `notify()` toast on fetch failure).

Layout, top to bottom:

1. **Alerts panel** — one card per alert, icon + severity label + colored left
   border (never color alone, per the CVD mitigation below), sorted as returned
   by the backend. Empty state: "Sin alertas activas."
2. **Stat cards** — same 4-group layout as the current mock dashboard (usuarios,
   docentes/estudiantes breakdown, espacios, actividad), now fed by `stats`.
3. **Bar chart — Usuarios por rol** — 3 bars (administrador/docente/estudiante),
   thin marks, rounded data-ends, direct value labels (3 series ≤ 4 so no
   separate legend needed beyond the axis labels).
4. **Capacity bars — Espacios** — one horizontal bar per active espacio from
   `espacios.detalle`, filled proportionally to `ocupacion_actual / capacidad_max`,
   colored green/amber/red at the same 90%/100% thresholds as the capacity alert
   (so the chart and the alert always agree, since both derive from the same
   `detalle` numbers).
5. **Line chart — Actividad (7 días)** — single series from `actividad.por_dia_7d`,
   one hue, hover crosshair + tooltip showing the exact count per day.

All three charts are hand-built inline SVG components (no new dependency),
sized responsively via viewBox, styled with the app's existing CSS custom
properties (`--panel-border`, `--text-secondary`, etc.) so they inherit the
glass-panel look already used elsewhere in `AdminPanel.tsx`.

### Color decisions (validated via the dataviz skill's `validate_palette.js`)

- **Categorical (role bar chart + role badges everywhere in AdminPanel):**
  the CRUD plan's original `roleColors` (`#f59e0b` / `#8b5cf6` / `#3b82f6`)
  **fails** the CVD-separation and normal-vision-floor checks (blue vs. violet,
  ΔE 12.0, below the 15 floor). Replaced with a validated triad, same order:
  - `administrador`: `#d97706`
  - `docente`: `#0d9488`
  - `estudiante`: `#3b82f6`
  All six checks pass against the panel's dark surface (`#11152a`, i.e.
  `--panel-bg` composited over `--background`). This replacement also updates
  the `roleColors` map in the CRUD plan's `UsuariosTab` for consistency — one
  role→color mapping used everywhere in the panel.
- **Status (alert severity + capacity bar fill):** reuses the app's existing
  `--success` / `--warning` / `--error` tokens. These fail the same
  categorical-only check (green vs. amber ΔE 5.7), but the dataviz skill
  permits this when every use ships with an icon + text label, never color
  alone — which is already how alerts and status dots are designed elsewhere
  in this app. Every alert card and capacity-bar segment must carry a visible
  icon/label alongside the color; color is reinforcement, not the sole signal.
- **Sequential (line chart):** single series, one hue — reuses
  `--upds-blue-light` (`#2c59dd`), the app's existing brand blue.

## Data flow summary

```
AdminPanel (Dashboard tab)
  → GET /api/admin/dashboard (JWT, requiereAdmin)
  → server runs ~6 SQL queries, assembles stats + computes alertas
  → single JSON response
  → frontend renders: AlertsPanel, StatCards, RoleBarChart, CapacityBars, ActivityLineChart
```

No client-side aggregation beyond simple percentage math for the capacity bars
(which just divides two numbers already in the payload).

## Error handling

Same pattern as the rest of the CRUD-plan `AdminPanel.tsx`: fetch failures show
the existing toast (`notify('error', ...)`), dashboard sections simply don't
render data until the fetch resolves (`loading` boolean), no partial-failure
handling needed since it's a single endpoint / single round-trip.

## Testing / verification

The project has no test framework (no `jest`/`vitest` in either `package.json`).
Verification will be:
- `npx tsc -b --noEmit` (root) and `npx tsc --noEmit` (server) after each change.
- Manual walkthrough: log in as the real admin account, confirm the Dashboard
  tab loads stats/charts/alerts, and cross-check a couple of numbers (e.g. total
  usuarios) against a direct query, per the CRUD plan's existing Task 5 test steps.
