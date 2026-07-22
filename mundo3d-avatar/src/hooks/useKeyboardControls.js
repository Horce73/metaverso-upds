import { useEffect, useRef } from 'react'

const MAPA_TECLAS = {
  KeyW: 'adelante',
  ArrowUp: 'adelante',
  KeyS: 'atras',
  ArrowDown: 'atras',
  KeyA: 'izquierda',
  ArrowLeft: 'izquierda',
  KeyD: 'derecha',
  ArrowRight: 'derecha',
}

const CODIGOS_MOVIMIENTO = new Set(Object.keys(MAPA_TECLAS))

function estaEscribiendoEnUnInput(e) {
  const tag = e.target?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * Devuelve una ref mutable { adelante, atras, izquierda, derecha }
 * que se actualiza en vivo con el estado del teclado.
 * Usamos ref (no state) para no re-renderizar en cada tecla,
 * ya que esto se lee dentro de useFrame (60 veces por segundo).
 */
export function useKeyboardControls() {
  const estado = useRef({
    adelante: false,
    atras: false,
    izquierda: false,
    derecha: false,
  })

  useEffect(() => {
    const limpiarTodo = () => {
      estado.current.adelante = false
      estado.current.atras = false
      estado.current.izquierda = false
      estado.current.derecha = false
    }

    const onKeyDown = (e) => {
      // Si el foco está en un <input>/<select> del panel de personalización
      // (el slider de tamaño, el selector de color, etc), no interceptamos
      // el teclado para no pelearnos con esos controles.
      if (estaEscribiendoEnUnInput(e)) return

      const accion = MAPA_TECLAS[e.code]
      if (!accion) return

      // Evita que las flechas hagan scroll de la página (el comportamiento
      // por defecto del navegador), que es la causa más común de que el
      // movimiento "se sienta raro" o no responda bien.
      if (CODIGOS_MOVIMIENTO.has(e.code)) e.preventDefault()

      estado.current[accion] = true
    }

    const onKeyUp = (e) => {
      const accion = MAPA_TECLAS[e.code]
      if (accion) estado.current[accion] = false
    }

    // Si la ventana/pestaña pierde el foco (cambiar de pestaña, abrir
    // DevTools, hacer clic fuera del navegador, etc.) mientras una tecla
    // está presionada, el evento "keyup" nunca llega y la tecla se queda
    // "pegada" como si siguiera presionada. Esto hacía que el avatar
    // pareciera trabado o que otras teclas "no funcionaran" después.
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', limpiarTodo)
    document.addEventListener('visibilitychange', limpiarTodo)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', limpiarTodo)
      document.removeEventListener('visibilitychange', limpiarTodo)
    }
  }, [])

  return estado
}
