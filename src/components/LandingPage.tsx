import React from 'react';

interface LandingPageProps {
  onNavigateLogin: () => void;
  onGuestLoginDirect: () => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onNavigateLogin,
  onGuestLoginDirect,
  theme = 'dark',
  onToggleTheme,
}) => {
  const isLight = theme === 'light';

  const logoHeader = isLight ? '/upds/Logotipo (2).png' : '/upds/Logotipo (1).png';
  const isologoHero = isLight ? '/upds/Isologo (3).png' : '/upds/Isologo (2).png';
  const sloganImg = isLight ? '/upds/Slogan (1).png' : '/upds/Slogan (2).png';

  return (
    <div className="landing-page">
      {/* Header Profesional */}
      <header className="landing-header">
        <div className="header-container">
          <div className="logo-section">
            <img
              src={logoHeader}
              alt="Universidad Privada Domingo Savio"
              style={{ height: '42px', objectFit: 'contain' }}
            />
          </div>
          <nav className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <a href="#about">Sobre UPDS</a>
            <a href="#features">Características</a>
            <a href="#contact">Contacto</a>
            {onToggleTheme && (
              <button
                className="theme-toggle-btn"
                onClick={onToggleTheme}
                title={isLight ? 'Cambiar a Modo Oscuro' : 'Cambiar a Modo Claro'}
              >
                {isLight ? '🌙 Modo Oscuro' : '☀️ Modo Claro'}
              </button>
            )}
            <button className="btn-nav" onClick={onNavigateLogin}>
              Ingresar
            </button>
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
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <button className="btn-primary large" onClick={onNavigateLogin}>
              Acceder al Metaverso
            </button>
            <button className="btn-secondary large" onClick={onGuestLoginDirect}>
              Ingresar como Invitado 🚪
            </button>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-cube">
            <img
              src={isologoHero}
              alt="Isologo UPDS"
              className="hero-cube-logo"
            />
          </div>
        </div>
      </section>

      {/* Sobre UPDS */}
      <section className="about" id="about">
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <h2>Sobre la Universidad</h2>
            <img
              src={sloganImg}
              alt="Slogan UPDS"
              style={{ height: '36px', objectFit: 'contain', marginTop: '12px', opacity: 0.9 }}
            />
          </div>
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

      {/* Ubicación y Contacto */}
      <section className="contact" id="contact">
        <div className="container">
          <h2>Ubicación y Contacto</h2>
          <div className="contact-grid">
            <div className="contact-card">
              <div className="contact-icon">📍</div>
              <h3>Dirección</h3>
              <p>Calle Cacique Titu Nro. 175<br />Sucre, Bolivia</p>
            </div>
            <div className="contact-card">
              <div className="contact-icon">📞</div>
              <h3>Teléfono</h3>
              <p>+591 74163220<br />(591-4) 6462625</p>
            </div>
            <div className="contact-card">
              <div className="contact-icon">✉️</div>
              <h3>Email</h3>
              <p>infoupds.sucre@upds.edo.bo<br /></p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <img
            src={logoHeader}
            alt="UPDS Logo Footer"
            style={{ height: '36px', objectFit: 'contain' }}
          />
          <p>&copy; 2026 Universidad Privada Domingo Savio. Todos los derechos reservados.</p>
          <p>🎓 Metaverso Educativo v2.0 - Facultad de Ingeniería</p>
        </div>
      </footer>
    </div>
  );
};
