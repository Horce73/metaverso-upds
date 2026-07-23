export default function Toast({ toast }) {
  if (!toast) return null

  const esTarde = toast.estado === 'tarde'

  return (
    <div style={{ ...estilos.base, background: esTarde ? '#e67e22' : '#27ae60' }}>
      <strong>{esTarde ? 'Llegada tarde' : 'Asistencia registrada'}</strong>
      <div style={estilos.mensaje}>{toast.mensaje}</div>
    </div>
  )
}

const estilos = {
  base: {
    position: 'absolute',
    bottom: '32px',
    left: '50%',
    transform: 'translateX(-50%)',
    color: '#fff',
    padding: '14px 22px',
    borderRadius: '10px',
    fontFamily: 'system-ui, sans-serif',
    boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
    animation: 'fadein 0.2s ease-out',
    minWidth: '220px',
    textAlign: 'center',
  },
  mensaje: { fontSize: '13px', opacity: 0.9, marginTop: '4px' },
}
