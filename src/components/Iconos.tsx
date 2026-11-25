import React from 'react';

/**
 * Iconos de línea del sitio (landing y login). Un solo trazo, 1.75 px, para
 * que se lean como una familia y no como emojis de distinto estilo.
 * Son decorativos: el texto de al lado dice lo mismo, por eso aria-hidden.
 */
type Props = { size?: number; className?: string };

const base = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
  className,
});

export const IconoSol: React.FC<Props> = ({ size = 18, className }) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </svg>
);

export const IconoLuna: React.FC<Props> = ({ size = 18, className }) => (
  <svg {...base(size, className)}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
  </svg>
);

export const IconoCampus: React.FC<Props> = ({ size = 22, className }) => (
  <svg {...base(size, className)}>
    <path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6M9 11h.01M15 11h.01" />
  </svg>
);

export const IconoAula: React.FC<Props> = ({ size = 22, className }) => (
  <svg {...base(size, className)}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4M7 9h6M7 12h4" />
  </svg>
);

export const IconoVoz: React.FC<Props> = ({ size = 22, className }) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="12" r="2.2" />
    <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" />
  </svg>
);

export const IconoPizarra: React.FC<Props> = ({ size = 22, className }) => (
  <svg {...base(size, className)}>
    <rect x="3" y="4" width="18" height="13" rx="1.5" />
    <path d="M7 14l3-4 3 2 4-5M8 21l2-4M16 21l-2-4" />
  </svg>
);

export const IconoAvatar: React.FC<Props> = ({ size = 22, className }) => (
  <svg {...base(size, className)}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
  </svg>
);

export const IconoAsistencia: React.FC<Props> = ({ size = 22, className }) => (
  <svg {...base(size, className)}>
    <rect x="4" y="4" width="16" height="17" rx="2" />
    <path d="M9 4V2.5M15 4V2.5M8.5 13l2.5 2.5 4.5-5" />
  </svg>
);

export const IconoPin: React.FC<Props> = ({ size = 20, className }) => (
  <svg {...base(size, className)}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.3" />
  </svg>
);

export const IconoTelefono: React.FC<Props> = ({ size = 20, className }) => (
  <svg {...base(size, className)}>
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
  </svg>
);

export const IconoCorreo: React.FC<Props> = ({ size = 20, className }) => (
  <svg {...base(size, className)}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3.5 7 8.5 6 8.5-6" />
  </svg>
);

export const IconoCandado: React.FC<Props> = ({ size = 18, className }) => (
  <svg {...base(size, className)}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

export const IconoPuerta: React.FC<Props> = ({ size = 18, className }) => (
  <svg {...base(size, className)}>
    <path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10" />
  </svg>
);

export const IconoFlecha: React.FC<Props> = ({ size = 18, className }) => (
  <svg {...base(size, className)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
