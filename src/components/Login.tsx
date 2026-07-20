import React, { useState } from 'react';

interface LoginProps {
  onLoginSuccess: (userData: any, token: string, avatarData: any) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [registroUpds, setRegistroUpds] = useState('');
  const [rol, setRol] = useState<'estudiante' | 'docente'>('estudiante');
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const API_URL = '/api';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    if (isRegister && !aceptaTerminos) {
      setErrorMsg('Debes aceptar los términos y condiciones de privacidad para ingresar al metaverso.');
      setLoading(false);
      return;
    }

    try {
      if (isRegister) {
        // Petición de registro
        const res = await fetch(`${API_URL}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            registro_upds: registroUpds || null,
            email,
            password,
            nombre,
            apellido,
            rol,
            acepta_terminos: aceptaTerminos
          })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Error al registrar usuario');
        }

        setSuccessMsg('¡Registro exitoso! Ya puedes iniciar sesión.');
        setIsRegister(false);
        setPassword('');
      } else {
        // Petición de login
        const res = await fetch(`${API_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Error al iniciar sesión');
        }

        // Éxito: guardar en LocalStorage y notificar
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        if (data.avatar) {
          localStorage.setItem('avatar', JSON.stringify(data.avatar));
        }

        onLoginSuccess(data.user, data.token, data.avatar);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error de conexión con el servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card glass-panel">
        <h2 className="login-title">
          <span className="gradient-text">UPDS Metaverso</span>
        </h2>
        <p className="login-subtitle">
          {isRegister ? 'Crea tu cuenta para asistir a clases virtuales 3D' : 'Ingresa al campus y aulas en tiempo real'}
        </p>

        {errorMsg && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid var(--error)',
            color: 'var(--error)',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '0.9rem',
            textAlign: 'left'
          }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {successMsg && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid var(--success)',
            color: 'var(--success)',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '0.9rem',
            textAlign: 'left'
          }}>
            ✅ {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <>
              <div className="form-group">
                <label className="form-label">Nombre</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ej. Juan"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Apellido</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ej. Pérez"
                  value={apellido}
                  onChange={(e) => setApellido(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Código de Registro UPDS (Opcional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ej. SIS-100293"
                  value={registroUpds}
                  onChange={(e) => setRegistroUpds(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Rol en la Facultad</label>
                <select
                  className="form-input"
                  style={{ background: '#1c1d24' }}
                  value={rol}
                  onChange={(e) => setRol(e.target.value as any)}
                >
                  <option value="estudiante">Estudiante</option>
                  <option value="docente">Docente</option>
                </select>
              </div>
            </>
          )}

          <div className="form-group">
            <label className="form-label">Correo Institucional / Email</label>
            <input
              type="email"
              className="form-input"
              placeholder="correo@upds.edu.bo"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Contraseña</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {isRegister && (
            <div className="checkbox-group">
              <input
                type="checkbox"
                id="terms"
                checked={aceptaTerminos}
                onChange={(e) => setAceptaTerminos(e.target.checked)}
              />
              <label htmlFor="terms" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                Acepto los términos de privacidad y el uso de micrófono para VoIP espacial.
              </label>
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Procesando...' : isRegister ? 'Registrarse' : 'Iniciar Sesión'}
          </button>
        </form>

        <div className="toggle-auth">
          {isRegister ? (
            <>
              ¿Ya tienes cuenta? <span onClick={() => setIsRegister(false)}>Inicia sesión aquí</span>
            </>
          ) : (
            <>
              ¿Eres nuevo en la facultad? <span onClick={() => setIsRegister(true)}>Regístrate aquí</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
