import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import Avatar from './Avatar'
import Door from './Door'
import CameraRig from './CameraRig'
import HUD from './HUD'
import Toast from './Toast'
import CustomizadorAvatar from './CustomizadorAvatar'
import Campus from './Campus'

import { obtenerPerfil, registrarAsistencia, cerrarSesion } from '../services/api'
import { RADIO_TRIGGER_PUERTA, COOLDOWN_ASISTENCIA_MS } from '../config'

const POSICION_PUERTA = new THREE.Vector3(0, 0, -5) // portón de entrada al campus
const CLAVE_LOCALSTORAGE = 'mundo3d_personalizacion_avatar'

const PERSONALIZACION_POR_DEFECTO = {
  colorRopa: '#3498db',
  colorPiel: '#e0ac69',
  escala: 1,
  accesorios: { sombrero: false, gafas: false, mochila: false },
}

function cargarPersonalizacionGuardada() {
  try {
    const guardado = localStorage.getItem(CLAVE_LOCALSTORAGE)
    return guardado ? JSON.parse(guardado) : null
  } catch {
    return null
  }
}

export default function World() {
  const [perfil, setPerfil] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [personalizacion, setPersonalizacion] = useState(PERSONALIZACION_POR_DEFECTO)
  const [panelAbierto, setPanelAbierto] = useState(false)

  const avatarEstadoRef = useRef({ posicion: new THREE.Vector3(0, 0, 5), angulo: 0 })
  const ultimoRegistroRef = useRef(0)

  // Cargar color/nombre del avatar desde la API (o mock) al montar
  useEffect(() => {
    obtenerPerfil()
      .then((datosPerfil) => {
        setPerfil(datosPerfil)

        // Si el usuario ya había personalizado su avatar antes, respeta eso
        // (fusionado con los valores por defecto por si se agregaron campos
        // nuevos). Si no hay nada guardado, arranca con el color de la API/mock.
        const guardado = cargarPersonalizacionGuardada()
        const base = { ...PERSONALIZACION_POR_DEFECTO, colorRopa: datosPerfil.color }
        setPersonalizacion(
          guardado
            ? { ...base, ...guardado, accesorios: { ...base.accesorios, ...(guardado.accesorios ?? {}) } }
            : base
        )
      })
      .catch((err) => {
        console.error(err)
        setError('No se pudo cargar el perfil. Usando valores por defecto.')
        setPerfil({ nombre: 'Alumno', color: '#3498db' })
      })
      .finally(() => setCargando(false))
  }, [])

  // Cada vez que el usuario edita la personalización, la guardamos local.
  // (Si más adelante tu backend guarda esto también, aquí es donde harías el POST.)
  const manejarCambiarPersonalizacion = useCallback((nueva) => {
    setPersonalizacion(nueva)
    try {
      localStorage.setItem(CLAVE_LOCALSTORAGE, JSON.stringify(nueva))
    } catch (err) {
      console.warn('No se pudo guardar la personalización localmente:', err)
    }
  }, [])

  const manejarActualizarPosicion = useCallback((posicion, angulo) => {
    avatarEstadoRef.current.posicion.copy(posicion)
    avatarEstadoRef.current.angulo = angulo
  }, [])

  const manejarTriggerPuerta = useCallback(async () => {
    const ahora = Date.now()
    if (ahora - ultimoRegistroRef.current < COOLDOWN_ASISTENCIA_MS) return
    ultimoRegistroRef.current = ahora

    try {
      const resultado = await registrarAsistencia()
      setToast(resultado)
      setTimeout(() => setToast(null), 4000)
    } catch (err) {
      console.error(err)
      setToast({ estado: 'tarde', mensaje: 'Error al registrar asistencia' })
      setTimeout(() => setToast(null), 4000)
    }
  }, [])

  if (cargando) {
    return <div style={{ padding: 24, fontFamily: 'sans-serif' }}>Cargando mundo…</div>
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <Canvas shadows camera={{ fov: 60 }}>
        <color attach="background" args={['#87ceeb']} />
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[10, 18, 4]}
          intensity={1.1}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-25}
          shadow-camera-right={25}
          shadow-camera-top={25}
          shadow-camera-bottom={-25}
          shadow-camera-far={60}
        />

        <Campus />
        <Door position={POSICION_PUERTA.toArray()} />

        <Avatar
          nombre={perfil.nombre}
          personalizacion={personalizacion}
          onUpdatePosicion={manejarActualizarPosicion}
        />

        <CameraRig avatarEstadoRef={avatarEstadoRef} />

        <DetectorPuerta
          avatarEstadoRef={avatarEstadoRef}
          posicionPuerta={POSICION_PUERTA}
          onTrigger={manejarTriggerPuerta}
        />
      </Canvas>

      <HUD nombre={perfil.nombre} onSalir={cerrarSesion} />
      <Toast toast={toast} />

      <CustomizadorAvatar
        personalizacion={personalizacion}
        onCambiar={manejarCambiarPersonalizacion}
        abierto={panelAbierto}
        onToggle={() => setPanelAbierto((v) => !v)}
      />

      {error && <div style={estiloError}>{error}</div>}
    </div>
  )
}

/**
 * Vive dentro del Canvas porque necesita useFrame para revisar
 * la distancia avatar-puerta en cada frame.
 */
function DetectorPuerta({ avatarEstadoRef, posicionPuerta, onTrigger }) {
  useFrame(() => {
    const distancia = avatarEstadoRef.current.posicion.distanceTo(posicionPuerta)
    if (distancia <= RADIO_TRIGGER_PUERTA) {
      onTrigger()
    }
  })
  return null
}

const estiloError = {
  position: 'absolute',
  top: '80px',
  left: '16px',
  background: '#c0392b',
  color: '#fff',
  padding: '8px 14px',
  borderRadius: '8px',
  fontFamily: 'sans-serif',
  fontSize: '13px',
}
