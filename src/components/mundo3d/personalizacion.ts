// Tipo y valor por defecto de la personalización del avatar, separados del
// componente AvatarModel.tsx a propósito: ese archivo importa three.js y
// @react-three/fiber, y Login.tsx necesita este valor por defecto en el paso 2
// del registro antes de que el usuario entre al mundo 3D. Si este archivo
// importara de AvatarModel.tsx, Login quedaría enganchado a three.js desde el
// primer render y 3D-01 (dividir el bundle) no tendría efecto.
export interface PersonalizacionAvatar {
  colorRopa?: string;
  colorPiel?: string;
  colorCabello?: string;
  estiloCabello?: 'corto' | 'largo' | 'tupe' | 'rizado' | 'bun' | 'calvo';
  expresionRostro?: 'alegre' | 'guiño' | 'serio' | 'sorprendido';
  escala?: number;
  accesorios?: {
    sombrero?: boolean;
    gafas?: boolean;
    mochila?: boolean;
  };
  ropa?: {
    colorPrimario: string;
    colorSecundario: string;
  };
  cabello?: {
    estilo: 'corto' | 'largo' | 'tupe' | 'rizado' | 'bun' | 'calvo';
    color: string;
  };
  velloFacial?: {
    estilo: 'ninguno' | 'barba' | 'bigote' | 'perilla' | 'candado';
    color: string;
  };
}

export const PERSONALIZACION_POR_DEFECTO: PersonalizacionAvatar = {
  colorRopa: '#3498db',
  colorPiel: '#e0ac69',
  colorCabello: '#2c1d11',
  estiloCabello: 'corto',
  expresionRostro: 'alegre',
  escala: 1,
  accesorios: { sombrero: false, gafas: false, mochila: false },
  ropa: {
    colorPrimario: '#3498db',
    colorSecundario: '#1d4ed8',
  },
  cabello: {
    estilo: 'corto',
    color: '#2c1d11',
  },
  velloFacial: {
    estilo: 'ninguno',
    color: '#2c1d11',
  },
};
