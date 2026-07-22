export default function HUD({ nombre, onSalir }) {
  return (
    <div style={estilos.contenedor}>
      <div style={estilos.tarjetaPerfil}>
        <span style={estilos.nombre}>{nombre}</span>
        <span style={estilos.ayuda}>WASD / Flechas para moverte</span>
      </div>

      <button style={estilos.botonSalir} onClick={onSalir}>
        Salir
      </button>
    </div>
  )
}

const estilos = {
  contenedor: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '16px',
    pointerEvents: 'none', // deja pasar los clics/teclas al canvas
    fontFamily: 'system-ui, sans-serif',
  },
  tarjetaPerfil: {
    background: 'rgba(0,0,0,0.55)',
    color: '#fff',
    padding: '10px 16px',
    borderRadius: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  nombre: { fontWeight: 700, fontSize: '16px' },
  ayuda: { fontSize: '12px', opacity: 0.8 },
  botonSalir: {
    pointerEvents: 'auto',
    background: '#e74c3c',
    color: '#fff',
    border: 'none',
    padding: '10px 18px',
    borderRadius: '8px',
    fontWeight: 600,
    cursor: 'pointer',
  },
}
