import React, { useState, useEffect } from 'react';

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
  const [nombreVisible, setNombreVisible] = useState('');
  const [colorAvatar, setColorAvatar] = useState('#0033A0');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [bloqueado, setBloqueado] = useState(false);
  const [tiempoRestante, setTiempoRestante] = useState(0);

  const API_URL = '/api';

  useEffect(() => {
    if (bloqueado && tiempoRestante > 0) {
      const timer = setTimeout(() => {
        setTiempoRestante(tiempoRestante - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (tiempoRestante === 0 && bloqueado) {
      setBloqueado(false);
    }
  }, [bloqueado, tiempoRestante]);

  const formatTiempo = (segundos: number) => {
    const mins = Math.floor(segundos / 60);
    const secs = segundos % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleGuestLogin = async () => {
    setErrorMsg('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/auth/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al ingresar como invitado');
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      if (data.avatar) {
        localStorage.setItem('avatar', JSON.stringify(data.avatar));
      }

      onLoginSuccess(data.user, data.token, data.avatar);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error de conexión con el servidor');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    if (isRegister && !aceptaTerminos) {
      setErrorMsg('Debes aceptar los términos y condiciones para ingresar al Metaverso UPDS.');
      setLoading(false);
      return;
    }

    try {
      if (isRegister) {
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
            acepta_terminos: aceptaTerminos,
            nombre_visible: nombreVisible || `${nombre} ${apellido}`,
            color_avatar: colorAvatar
          })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Error al registrar usuario');
        }

        setSuccessMsg('🎉 ¡Registro exitoso! Ya puedes iniciar sesión.');
        setIsRegister(false);
        setPassword('');
        setNombre('');
        setApellido('');
        setRegistroUpds('');
      } else {
        const res = await fetch(`${API_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (res.status === 423) {
          setBloqueado(true);
          setTiempoRestante(15 * 60);
          setErrorMsg(`🔒 ${data.error || 'Cuenta bloqueada temporalmente. Intenta en 15 minutos.'}`);
          setLoading(false);
          return;
        }

        if (!res.ok) {
          throw new Error(data.error || 'Error al iniciar sesión');
        }

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
      <div className="login-background">
        <div className="login-overlay"></div>

        <div className="login-card glass-panel">
          {/* Logo UPDS */}
          <div className="upds-brand">
            <div className="upds-logo">
              <svg width="60" height="60" viewBox="0 0 100 100" fill="none">
                <circle cx="50" cy="50" r="48" stroke="#0033A0" strokeWidth="4"/>
                <circle cx="50" cy="50" r="40" fill="#0033A0"/>
                <text x="50" y="58" textAnchor="middle" fill="#FFFFFF" fontSize="28" fontWeight="bold">UPDS</text>
              </svg>
            </div>
            <h1 className="upds-title">
              <span className="upds-main">UNIVERSIDAD PRIVADA</span>
              <span className="upds-sub">DOMINGO SAVIO</span>
            </h1>
            <div className="upds-badge">
              <span className="badge-campus">🏛️ SEDE SUCRE</span>
              <span className="badge-metaverso">🌐 METAVERSO EDUCATIVO</span>
            </div>
          </div>

          <div className="login-header">
            <h2 className="login-title">
              {isRegister ? 'Crear Cuenta UPDS' : 'Acceso al Metaverso'}
            </h2>
            <p className="login-subtitle">
              {isRegister
                ? 'Regístrate para acceder a tus clases virtuales 3D'
                : 'Ingresa al campus y aulas en tiempo real'}
            </p>
          </div>

          {/* Alertas */}
          {errorMsg && (
            <div className={`alert alert-${bloqueado ? 'danger' : 'error'}`}>
              <span className="alert-icon">{bloqueado ? '🔒' : '⚠️'}</span>
              <span className="alert-text">{errorMsg}</span>
              {bloqueado && tiempoRestante > 0 && (
                <div className="alert-timer">
                  ⏱️ Tiempo restante: <strong>{formatTiempo(tiempoRestante)}</strong>
                </div>
              )}
            </div>
          )}

          {successMsg && (
            <div className="alert alert-success">
              <span className="alert-icon">✅</span>
              <span className="alert-text">{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form">
            {isRegister && (
              <div className="form-section">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Nombres</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Ej. Juan Carlos"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Apellidos</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Ej. Pérez Rodríguez"
                      value={apellido}
                      onChange={(e) => setApellido(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Código UPDS</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Ej. SIS-100293"
                      value={registroUpds}
                      onChange={(e) => setRegistroUpds(e.target.value)}
                    />
                    <span className="form-hint">Opcional para estudiantes regulares</span>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Rol</label>
                    <select
                      className="form-input select-premium"
                      value={rol}
                      onChange={(e) => setRol(e.target.value as any)}
                    >
                      <option value="estudiante">👨‍🎓 Estudiante</option>
                      <option value="docente">👨‍🏫 Docente</option>
                    </select>
                  </div>
                </div>

                <div className="form-row avatar-custom">
                  <div className="form-group">
                    <label className="form-label">Nombre en el Metaverso</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Ej. JuanDev"
                      value={nombreVisible}
                      onChange={(e) => setNombreVisible(e.target.value)}
                    />
                    <span className="form-hint">Cómo te verán los demás en el campus 3D</span>
                  </div>

                  <div className="form-group color-picker-group">
                    <label className="form-label">Color de Avatar</label>
                    <div className="color-picker-wrapper">
                      <input
                        type="color"
                        className="color-picker-input"
                        value={colorAvatar}
                        onChange={(e) => setColorAvatar(e.target.value)}
                      />
                      <span className="color-preview" style={{ backgroundColor: colorAvatar }}></span>
                      <span className="color-hex">{colorAvatar}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">
                <span className="label-icon">📧</span>
                Correo Institucional
              </label>
              <input
                type="email"
                className="form-input"
                placeholder="tu.correo@upds.edu.bo"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                <span className="label-icon">🔐</span>
                Contraseña
              </label>
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {!isRegister && (
                <span className="form-hint">Mínimo 6 caracteres</span>
              )}
            </div>

            {isRegister && (
              <div className="terms-group">
                <label className="terms-label">
                  <input
                    type="checkbox"
                    checked={aceptaTerminos}
                    onChange={(e) => setAceptaTerminos(e.target.checked)}
                    className="terms-checkbox"
                  />
                  <span className="terms-text">
                    Acepto los <a href="#" className="terms-link">Términos y Condiciones</a> y la
                    <a href="#" className="terms-link"> Política de Privacidad</a> de UPDS
                  </span>
                </label>
                <p className="terms-note">
                  📋 Tu información será tratada conforme a la Ley de Protección de Datos Personales
                </p>
              </div>
            )}

            <button
              type="submit"
              className="btn-primary btn-upds"
              disabled={loading || bloqueado}
            >
              {loading ? (
                <span className="btn-loader">
                  <span className="spinner"></span>
                  Procesando...
                </span>
              ) : (
                <span className="btn-content">
                  {isRegister ? '🚀 Crear Cuenta' : '🎯 Acceder al Metaverso'}
                </span>
              )}
            </button>
          </form>

          <div className="auth-footer">
            <div className="auth-toggle">
              {isRegister ? (
                <>
                  <span className="toggle-text">¿Ya tienes cuenta?</span>
                  <button
                    className="toggle-btn"
                    onClick={() => setIsRegister(false)}
                    type="button"
                  >
                    Inicia sesión aquí
                  </button>
                </>
              ) : (
                <>
                  <span className="toggle-text">¿Eres nuevo en UPDS?</span>
                  <button
                    className="toggle-btn"
                    onClick={() => setIsRegister(true)}
                    type="button"
                  >
                    Regístrate aquí
                  </button>
                </>
              )}
            </div>

            {!isRegister && (
              <div className="guest-section">
                <div className="divider">
                  <span className="divider-text">O VISITA EL CAMPUS COMO</span>
                </div>
                <button
                  type="button"
                  onClick={handleGuestLogin}
                  disabled={loading}
                  className="btn-guest"
                >
                  <span className="guest-icon">🚪</span>
                  <span className="guest-text">Invitado</span>
                  <span className="guest-badge">Explorar Campus</span>
                </button>
                <p className="guest-note">
                  🌍 Acceso limitado al campus 3D sin necesidad de registro
                </p>
              </div>
            )}
          </div>

          <div className="login-footer">
            <div className="footer-info">
              <span>© 2026 UPDS - Sede Sucre</span>
              <span className="footer-separator">|</span>
              <span>Facultad de Ingeniería</span>
              <span className="footer-separator">|</span>
              <span>Ingeniería de Software</span>
            </div>
            <div className="footer-version">
              <span className="version-badge">v2.0.0</span>
              <span className="status-dot"></span>
              <span className="status-text">Sistema en línea</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};