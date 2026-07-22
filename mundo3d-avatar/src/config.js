// ============================================================
// CONFIGURACIÓN CENTRAL
// Ajusta estos valores a tu backend PHP real (Task 6 parte A/C).
// ============================================================

export const API_BASE_URL = 'http://localhost/mi-backend'

// ------------------------------------------------------------
// MODO SIMULADO (MOCK)
// Ponlo en `true` mientras no exista backend real: perfil.php,
// asistencia.php y logout.php se simulan en el propio frontend
// (ver src/services/api.js). Cuando tus compañeros tengan el
// backend listo, cambia esto a `false` y listo, no tocas nada más.
// ------------------------------------------------------------
export const USAR_MOCK = true

export const ENDPOINTS = {
  // Debe devolver algo como: { nombre: "Juan", color: "#3498db" }
  perfil: `${API_BASE_URL}/perfil.php`,

  // Recibe POST y registra asistencia. Debe devolver algo como:
  // { estado: "presente" | "tarde", mensaje: "Asistencia registrada" }
  asistencia: `${API_BASE_URL}/asistencia.php`,

  // Cierra la sesión del usuario en el servidor
  logout: `${API_BASE_URL}/logout.php`,
}

// Radio (en unidades del mundo 3D) dentro del cual se considera
// que el avatar "tocó" la puerta y se dispara el registro.
export const RADIO_TRIGGER_PUERTA = 1.5

// Tiempo mínimo (ms) entre registros de asistencia, para evitar
// múltiples POST si el jugador se queda parado sobre el trigger.
export const COOLDOWN_ASISTENCIA_MS = 15000
