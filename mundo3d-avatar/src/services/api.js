import { ENDPOINTS, USAR_MOCK } from '../config'

// ============================================================
// DATOS SIMULADOS (solo se usan si USAR_MOCK = true en config.js)
// ============================================================

const PERFIL_MOCK = {
  nombre: 'Alumno Demo',
  color: '#e67e22',
}

// Simula latencia de red real, para que las pantallas de "cargando"
// y los tiempos se comporten como con un backend de verdad.
function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let asistenciaYaRegistradaHoy = false

async function obtenerPerfilMock() {
  await esperar(400)
  return PERFIL_MOCK
}

async function registrarAsistenciaMock() {
  await esperar(300)

  // Simula la regla típica: si ya se registró antes hoy, es "tarde";
  // la primera vez del día, "presente". Ajusta esta lógica de mentira
  // como quieras, es solo para poder probar los dos toasts.
  const estado = asistenciaYaRegistradaHoy ? 'tarde' : 'presente'
  asistenciaYaRegistradaHoy = true

  return {
    estado,
    mensaje:
      estado === 'presente'
        ? 'Asistencia registrada correctamente (simulado)'
        : 'Registro fuera de horario (simulado)',
  }
}

async function cerrarSesionMock() {
  await esperar(200)
  console.log('[MOCK] Sesión cerrada. En producción esto redirige al login real.')
  alert('Sesión cerrada (modo simulado). Cuando el backend real esté listo, esto redirige a login.')
}

// ============================================================
// LLAMADAS REALES (se usan si USAR_MOCK = false)
// ============================================================

async function obtenerPerfilReal() {
  const res = await fetch(ENDPOINTS.perfil, {
    method: 'GET',
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Error al obtener perfil: ${res.status}`)
  const data = await res.json()
  return {
    nombre: data.nombre ?? 'Alumno',
    color: data.color ?? '#3498db',
  }
}

async function registrarAsistenciaReal() {
  const res = await fetch(ENDPOINTS.asistencia, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timestamp: new Date().toISOString() }),
  })
  if (!res.ok) throw new Error(`Error al registrar asistencia: ${res.status}`)
  const data = await res.json()
  return {
    estado: data.estado ?? 'presente',
    mensaje: data.mensaje ?? 'Asistencia registrada',
  }
}

async function cerrarSesionReal() {
  try {
    await fetch(ENDPOINTS.logout, { method: 'POST', credentials: 'include' })
  } finally {
    window.location.href = '/login.html' // ajusta a tu ruta real de login
  }
}

// ============================================================
// EXPORTS ÚNICOS: el resto de la app solo usa estas 3 funciones
// y no le importa si están en modo mock o real.
// ============================================================

export async function obtenerPerfil() {
  return USAR_MOCK ? obtenerPerfilMock() : obtenerPerfilReal()
}

export async function registrarAsistencia() {
  return USAR_MOCK ? registrarAsistenciaMock() : registrarAsistenciaReal()
}

export async function cerrarSesion() {
  return USAR_MOCK ? cerrarSesionMock() : cerrarSesionReal()
}
