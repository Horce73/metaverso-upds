import { useState } from 'react';

interface AccesoOyenteProps {
  codigo: string;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onEntrar: (data: { token: string; user: any; espacio: any }) => void;
  onVolver: () => void;
}

export function AccesoOyente({ codigo, theme, onToggleTheme, onEntrar, onVolver }: AccesoOyenteProps) {
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const canjear = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const res = await fetch('/api/oyentes/canjear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo, nombre }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo validar el enlace.');
      onEntrar(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión. Intenta nuevamente.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <main className="login-container">
      <section className="login-card glass-panel" aria-labelledby="titulo-acceso-oyente">
        <h1 id="titulo-acceso-oyente" className="gradient-text">Ingresar como oyente</h1>
        <p style={{ color: 'var(--text-secondary)', margin: '12px 0 20px' }}>
          Podrás observar y escuchar esta clase. El modo oyente no permite participar.
        </p>
        <form onSubmit={canjear} style={{ display: 'grid', gap: 14 }}>
          <label htmlFor="nombre-oyente">Nombre visible</label>
          <input
            id="nombre-oyente"
            autoComplete="name"
            maxLength={80}
            required
            minLength={2}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Escribe tu nombre"
          />
          {error && <p role="alert" style={{ color: 'var(--error)' }}>{error}</p>}
          <button type="submit" className="btn-primary" disabled={cargando}>
            {cargando ? 'Validando acceso…' : 'Entrar a la clase'}
          </button>
          <button type="button" className="btn-secondary" onClick={onVolver}>
            Volver al inicio
          </button>
        </form>
        <button
          type="button"
          onClick={onToggleTheme}
          className="hamburger-item"
          style={{ marginTop: 16 }}
          aria-label="Cambiar tema"
        >
          {theme === 'dark' ? '☀️ Claro' : '🌙 Oscuro'}
        </button>
      </section>
    </main>
  );
}
