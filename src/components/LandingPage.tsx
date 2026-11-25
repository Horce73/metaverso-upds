import React from 'react';
import {
  IconoSol,
  IconoLuna,
  IconoCampus,
  IconoAula,
  IconoVoz,
  IconoPizarra,
  IconoAvatar,
  IconoAsistencia,
  IconoPin,
  IconoTelefono,
  IconoCorreo,
  IconoPuerta,
} from './Iconos.js';

interface LandingPageProps {
  onNavigateLogin: () => void;
  onGuestLoginDirect: () => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

/**
 * Plano esquemático del campus. Es la imagen principal de la página porque
 * resume lo que hace distinto al Metaverso: lo que oyes depende de dónde estás.
 * Los círculos son el alcance de la voz de cada persona; quien queda fuera
 * del círculo no se oye. Es una ilustración, no un mapa fiel.
 */
const PlanoHero: React.FC = () => (
  <svg
    className="lp-plano"
    viewBox="0 0 600 520"
    role="img"
    aria-label="Plano del campus con cuatro aulas, un patio y una torre. Un docente dentro del aula 102 con tres estudiantes; el círculo que lo rodea marca hasta dónde llega su voz."
  >
    <defs>
      <pattern id="lp-cuadricula" width="30" height="30" patternUnits="userSpaceOnUse">
        <path d="M30 0H0V30" className="lp-p-cuadricula" />
      </pattern>
    </defs>

    <rect width="600" height="520" className="lp-p-fondo" />
    <rect width="600" height="520" fill="url(#lp-cuadricula)" />

    {/* Calle */}
    <rect x="0" y="456" width="600" height="64" className="lp-p-calle" />
    <path d="M0 488H600" className="lp-p-eje" />

    {/* Edificio antiguo: cuatro aulas y la galería */}
    <rect x="40" y="70" width="330" height="150" className="lp-p-edificio" />
    <path d="M122.5 70v150M205 70v150M287.5 70v150" className="lp-p-pared" />
    <rect x="40" y="220" width="330" height="26" className="lp-p-galeria" />
    <g className="lp-p-texto lp-p-texto-aula">
      <text x="52" y="90">101</text>
      <text x="134.5" y="90">102</text>
      <text x="217" y="90">103</text>
      <text x="299.5" y="90">104</text>
    </g>
    <g className="lp-p-puerta">
      <path d="M72 220h22M154 220h22M236 220h22M318 220h22" />
    </g>

    {/* Torre */}
    <rect x="410" y="70" width="150" height="250" className="lp-p-edificio" />
    <path d="M410 104H560M410 138H560M410 172H560M410 206H560M410 240H560M410 274H560" className="lp-p-pared" />
    <text x="422" y="90" className="lp-p-texto lp-p-texto-aula">Torre</text>

    {/* Patio */}
    <rect x="40" y="276" width="330" height="150" className="lp-p-patio" />
    <text x="52" y="298" className="lp-p-texto lp-p-texto-aula">Patio</text>

    {/* Alcance de la voz */}
    <circle cx="164" cy="150" r="40" className="lp-p-voz lp-p-voz-onda" />
    <circle cx="164" cy="150" r="40" className="lp-p-voz" />
    <circle cx="132" cy="360" r="46" className="lp-p-voz lp-p-voz-quieta" />
    <circle cx="188" cy="378" r="46" className="lp-p-voz lp-p-voz-quieta" />

    {/* Personas */}
    <g>
      <circle cx="164" cy="150" r="7" className="lp-p-yo" />
      <circle cx="143" cy="130" r="5" className="lp-p-persona" />
      <circle cx="185" cy="170" r="5" className="lp-p-persona" />
      <circle cx="140" cy="172" r="5" className="lp-p-persona" />
      <circle cx="252" cy="150" r="5" className="lp-p-persona lp-p-lejos" />
      <circle cx="132" cy="360" r="5" className="lp-p-persona" />
      <circle cx="188" cy="378" r="5" className="lp-p-persona" />
    </g>

    {/* Etiquetas */}
    <g className="lp-p-etiqueta">
      <rect x="125" y="194" width="78" height="22" rx="11" />
      <text x="164" y="209" textAnchor="middle">Mtra. Quispe</text>
    </g>
    <g className="lp-p-etiqueta lp-p-etiqueta-viva">
      <rect x="40" y="251" width="176" height="22" rx="11" />
      <circle cx="55" cy="262" r="3.5" className="lp-p-vivo" />
      <text x="66" y="266">Aula 102 · 4 presentes</text>
    </g>
  </svg>
);

const CARACTERISTICAS = [
  {
    icono: <IconoCampus />,
    titulo: 'Campus virtual en 3D',
    texto: 'Recorre un campus completo desde el navegador, sin instalar nada.',
  },
  {
    icono: <IconoAula />,
    titulo: 'Aulas interactivas',
    texto: 'Clases en tiempo real con varios estudiantes y docentes a la vez.',
  },
  {
    icono: <IconoVoz />,
    titulo: 'Voz espacial',
    texto: 'El audio sube o baja según la distancia entre avatares, como en un aula real.',
  },
  {
    icono: <IconoPizarra />,
    titulo: 'Pizarra digital',
    texto: 'Herramientas para dibujar y explicar en conjunto durante la clase.',
  },
  {
    icono: <IconoAvatar />,
    titulo: 'Avatares personalizables',
    texto: 'Crea tu avatar 3D y cambia su apariencia cuando quieras.',
  },
  {
    icono: <IconoAsistencia />,
    titulo: 'Asistencia automática',
    texto: 'La asistencia se registra al entrar al aula, sin pasar lista.',
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({
  onNavigateLogin,
  onGuestLoginDirect,
  theme = 'dark',
  onToggleTheme,
}) => {
  const isLight = theme === 'light';

  const logoHeader = isLight ? '/upds/Logotipo (2).png' : '/upds/Logotipo (1).png';
  const sloganImg = isLight ? '/upds/Slogan (1).png' : '/upds/Slogan (2).png';

  return (
    <div className="landing-page lp">
      <header className="lp-header">
        <div className="lp-header-in">
          <a className="lp-marca" href="#/" aria-label="Universidad Privada Domingo Savio, inicio">
            <img src={logoHeader} alt="Universidad Privada Domingo Savio" />
          </a>
          <nav className="lp-nav" aria-label="Principal">
            <a href="#about">La universidad</a>
            <a href="#features">Qué incluye</a>
            <a href="#contact">Contacto</a>
            {onToggleTheme && (
              <button
                type="button"
                className="lp-tema"
                onClick={onToggleTheme}
                aria-label={isLight ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
                title={isLight ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
              >
                {isLight ? <IconoLuna /> : <IconoSol />}
              </button>
            )}
            <button type="button" className="lp-btn lp-btn-solido lp-btn-chico" onClick={onNavigateLogin}>
              Ingresar
            </button>
          </nav>
        </div>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-hero-texto">
            <h1>
              <span>Entra al campus.</span> <span>La clase ya empezó.</span>
            </h1>
            <p className="lp-bajada">
              El metaverso educativo de la UPDS Sede Sucre: aulas en 3D, voz que se oye según la distancia y
              asistencia registrada al entrar.
            </p>
            <div className="lp-acciones">
              <button type="button" className="lp-btn lp-btn-solido" onClick={onNavigateLogin}>
                Entrar al campus
              </button>
              <button type="button" className="lp-btn lp-btn-linea" onClick={onGuestLoginDirect}>
                <IconoPuerta />
                Probar como invitado
              </button>
            </div>
          </div>
          <div className="lp-hero-plano">
            <PlanoHero />
          </div>
        </section>

        <section className="lp-seccion lp-sobre" id="about">
          <div className="lp-seccion-in lp-sobre-in">
            <div className="lp-sobre-cab">
              <h2>La universidad</h2>
              <img className="lp-slogan" src={sloganImg} alt="Profesionales más humanos" />
            </div>
            <dl className="lp-sobre-lista">
              <div>
                <dt>Institución acreditada</dt>
                <dd>
                  Universidad Privada Domingo Savio, con más de 25 años de trayectoria en educación superior.
                </dd>
              </div>
              <div>
                <dt>Profesionales humanos</dt>
                <dd>Formamos profesionales con valores humanos y éticos, comprometidos con la sociedad.</dd>
              </div>
              <div>
                <dt>Educación virtual</dt>
                <dd>Una plataforma con tecnología 3D para que la clase ocurra donde estés.</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="lp-seccion" id="features">
          <div className="lp-seccion-in">
            <h2>Qué incluye el Metaverso UPDS</h2>
            <ul className="lp-caract">
              {CARACTERISTICAS.map((c) => (
                <li key={c.titulo}>
                  <span className="lp-caract-icono">{c.icono}</span>
                  <h3>{c.titulo}</h3>
                  <p>{c.texto}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lp-seccion lp-contacto" id="contact">
          <div className="lp-seccion-in">
            <h2>Ubicación y contacto</h2>
            <ul className="lp-contacto-lista">
              <li>
                <span className="lp-contacto-icono">
                  <IconoPin />
                </span>
                <div>
                  <h3>Dirección</h3>
                  <p>
                    Calle Cacique Titu Nro. 175
                    <br />
                    Sucre, Bolivia
                  </p>
                </div>
              </li>
              <li>
                <span className="lp-contacto-icono">
                  <IconoTelefono />
                </span>
                <div>
                  <h3>Teléfono</h3>
                  <p>
                    +591 74163220
                    <br />
                    (591-4) 6462625
                  </p>
                </div>
              </li>
              <li>
                <span className="lp-contacto-icono">
                  <IconoCorreo />
                </span>
                <div>
                  <h3>Correo</h3>
                  <p>
                    <a href="mailto:infoupds.sucre@upds.edo.bo">infoupds.sucre@upds.edo.bo</a>
                  </p>
                </div>
              </li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="lp-pie">
        <div className="lp-pie-in">
          <img src={logoHeader} alt="UPDS" />
          <p>&copy; 2026 Universidad Privada Domingo Savio. Todos los derechos reservados.</p>
          <p>Metaverso Educativo v2.0 · Facultad de Ingeniería</p>
        </div>
      </footer>
    </div>
  );
};
