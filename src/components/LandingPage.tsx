import React, { useState } from 'react';
import { Login } from './Login.js';

interface LandingPageProps {
  onGetStarted: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  const [showLogin, setShowLogin] = useState(false);

  if (showLogin) {
    return (
      <Login onLoginSuccess={(u, t, a) => {
        // Pasar datos al padre
        localStorage.setItem('token', t);
        localStorage.setItem('user', JSON.stringify(u));
        if (a) localStorage.setItem('avatar', JSON.stringify(a));
        onGetStarted();
      }} />
    );
  }

  return (
    <div className="landing-page">
      {/* Header Profesional */}
      <header className="landing-header">
        <div className="header-container">
          <div className="logo-section">
            <div className="logo-upds">🎓</div>
            <div>
              <h1 className="logo-text">UPDS Metaverso</h1>
              <p className="logo-subtitle">Educación Virtual 3D</p>
            </div>
          </div>
          <nav className="nav-links">
            <a href="#about">Sobre UPDS</a>
            <a href="#features">Características</a>
            <a href="#contact">Contacto</a>
            <button className="btn-nav" onClick={() => setShowLogin(true)}>Ingresar</button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <h2>Universidad Privada Domingo Savio</h2>
          <p className="tagline">Profesionales Más Humanos</p>
          <p className="hero-description">
            Educación innovadora en un metaverso educativo 3D para clases virtuales interactivas
          </p>
          <button className="btn-primary large" onClick={() => setShowLogin(true)}>
            Acceder al Metaverso
          </button>
          <button className="btn-secondary large" onClick={() => setShowLogin(true)}>
            Ingresar como Invitado 🚪
          </button>
        </div>
        <div className="hero-visual">
          <div className="hero-cube">3D</div>
        </div>
      </section>

      {/* Sobre UPDS */}
      <section className="about" id="about">
        <div className="container">
          <h2>Sobre la Universidad</h2>
          <div className="about-grid">
            <div className="about-card">
              <div className="about-icon">🏫</div>
              <h3>Institución Acreditada</h3>
              <p>Universidad Privada Domingo Savio con más de 25 años de trayectoria en educación superior.</p>
            </div>
            <div className="about-card">
              <div className="about-icon">👥</div>
              <h3>Profesionales Humanos</h3>
              <p>Formamos profesionales con valores humanos, éticos y comprometidos con la sociedad.</p>
            </div>
            <div className="about-card">
              <div className="about-icon">🌐</div>
              <h3>Educación Virtual</h3>
              <p>Plataforma educativa de última generación con tecnología 3D inmersiva.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Características */}
      <section className="features" id="features">
        <div className="container">
          <h2>Características del Metaverso UPDS</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-number">01</div>
              <h3>Campus Virtual en 3D</h3>
              <p>Explora un campus completo en entorno 3D inmersivo</p>
            </div>
            <div className="feature-card">
              <div className="feature-number">02</div>
              <h3>Aulas Interactivas</h3>
              <p>Clases en tiempo real con múltiples estudiantes y docentes</p>
            </div>
            <div className="feature-card">
              <div className="feature-number">03</div>
              <h3>VoIP Espacial</h3>
              <p>Audio 3D inmersivo que varía según la distancia</p>
            </div>
            <div className="feature-card">
              <div className="feature-number">04</div>
              <h3>Pizarra Digital</h3>
              <p>Herramientas colaborativas para enseñanza interactiva</p>
            </div>
            <div className="feature-card">
              <div className="feature-number">05</div>
              <h3>Avatares Personalizables</h3>
              <p>Crea y personaliza tu avatar 3D único</p>
            </div>
            <div className="feature-card">
              <div className="feature-number">06</div>
              <h3>Asistencia Automática</h3>
              <p>Registro automático de asistencia por presencia física</p>
            </div>
          </div>
        </div>
      </section>

      {/* Dirección */}
      <section className="contact" id="contact">
        <div className="container">
          <h2>Ubicación y Contacto</h2>
          <div className="contact-grid">
            <div className="contact-card">
              <div className="contact-icon">📍</div>
              <h3>Dirección</h3>
              <p>Calle Sucre Nro. 154<br/>La Paz, Bolivia</p>
            </div>
            <div className="contact-card">
              <div className="contact-icon">📞</div>
              <h3>Teléfono</h3>
              <p>+591 2 2440015<br/>+591 2 2440016</p>
            </div>
            <div className="contact-card">
              <div className="contact-icon">✉️</div>
              <h3>Email</h3>
              <p>info@upds.edu.bo<br/>educacion@upds.edu.bo</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-content">
          <p>&copy; 2026 Universidad Privada Domingo Savio. Todos los derechos reservados.</p>
          <p>🎓 Metaverso Educativo v1.0 - Ingeniería de Software</p>
        </div>
      </footer>
    </div>
  );
};
