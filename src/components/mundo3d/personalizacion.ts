// Apariencia del avatar (AVATAR-01). Separada de AvatarModel.tsx a propósito:
// ese archivo importa three.js y @react-three/fiber, y Login.tsx necesita estos
// valores en el paso 2 del registro antes de que el usuario entre al mundo 3D.
// Si este archivo importara de AvatarModel.tsx, Login quedaría enganchado a
// three.js desde el primer render y 3D-01 (dividir el bundle) no tendría efecto.
//
// Lo que se guarda en la base (avatares.apariencia) y viaja por el socket es
// PersonalizacionAvatar: un objeto suelto, que puede venir de versiones
// anteriores (colorRopa, estiloCabello, accesorios booleanos…) o de un cliente
// que manda cualquier cosa. Antes de dibujar o editar se pasa por
// normalizarApariencia, que devuelve una Apariencia completa y válida.

export const ESTILOS_CABELLO = [
  { id: 'corto', etiqueta: 'Corto' },
  { id: 'rapado', etiqueta: 'Rapado' },
  { id: 'tupe', etiqueta: 'Tupé' },
  { id: 'flequillo', etiqueta: 'Flequillo' },
  { id: 'rizado', etiqueta: 'Rizado' },
  { id: 'afro', etiqueta: 'Afro' },
  { id: 'largo', etiqueta: 'Largo' },
  { id: 'coleta', etiqueta: 'Coleta' },
  { id: 'trenzas', etiqueta: 'Trenzas' },
  { id: 'bun', etiqueta: 'Moño' },
  { id: 'calvo', etiqueta: 'Calvo' },
] as const;

export const ESTILOS_VELLO = [
  { id: 'ninguno', etiqueta: 'Ninguno' },
  { id: 'bigote', etiqueta: 'Bigote' },
  { id: 'perilla', etiqueta: 'Perilla' },
  { id: 'candado', etiqueta: 'Candado' },
  { id: 'barba', etiqueta: 'Barba' },
] as const;

export const COMPLEXIONES = [
  { id: 'delgada', etiqueta: 'Delgada' },
  { id: 'media', etiqueta: 'Media' },
  { id: 'robusta', etiqueta: 'Robusta' },
] as const;

export const FORMAS_OJOS = [
  { id: 'redondos', etiqueta: 'Redondos' },
  { id: 'almendrados', etiqueta: 'Almendrados' },
  { id: 'grandes', etiqueta: 'Grandes' },
] as const;

export const CEJAS = [
  { id: 'finas', etiqueta: 'Finas' },
  { id: 'gruesas', etiqueta: 'Gruesas' },
  { id: 'arqueadas', etiqueta: 'Arqueadas' },
] as const;

export const EXPRESIONES = [
  { id: 'alegre', etiqueta: '😊 Alegre' },
  { id: 'guiño', etiqueta: '😉 Guiño' },
  { id: 'serio', etiqueta: '😐 Serio' },
  { id: 'sorprendido', etiqueta: '😮 Sorpresa' },
] as const;

export const PRENDAS_SUPERIORES = [
  { id: 'polera', etiqueta: 'Polera' },
  { id: 'camisa', etiqueta: 'Camisa' },
  { id: 'chompa', etiqueta: 'Chompa' },
  { id: 'deportiva', etiqueta: 'Deportiva' },
  { id: 'saco', etiqueta: 'Saco' },
] as const;

export const PRENDAS_INFERIORES = [
  { id: 'pantalon', etiqueta: 'Pantalón' },
  { id: 'jean', etiqueta: 'Jean' },
  { id: 'buzo', etiqueta: 'Buzo' },
  { id: 'falda', etiqueta: 'Falda' },
  { id: 'short', etiqueta: 'Short' },
] as const;

export const CALZADOS = [
  { id: 'zapatillas', etiqueta: 'Zapatillas' },
  { id: 'zapatos', etiqueta: 'Zapatos' },
  { id: 'botas', etiqueta: 'Botas' },
] as const;

export const SOMBREROS = [
  { id: 'ninguno', etiqueta: 'Nada' },
  { id: 'gorra', etiqueta: 'Gorra' },
  { id: 'chullo', etiqueta: 'Chullo' },
  { id: 'boina', etiqueta: 'Boina' },
  { id: 'sombrero', etiqueta: 'Sombrero' },
] as const;

export const GAFAS = [
  { id: 'ninguna', etiqueta: 'Sin gafas' },
  { id: 'redondas', etiqueta: 'Redondas' },
  { id: 'cuadradas', etiqueta: 'Cuadradas' },
  { id: 'sol', etiqueta: 'De sol' },
] as const;

type Id<T extends readonly { id: string }[]> = T[number]['id'];

export type EstiloCabello = Id<typeof ESTILOS_CABELLO>;
export type EstiloVello = Id<typeof ESTILOS_VELLO>;
export type Complexion = Id<typeof COMPLEXIONES>;
export type FormaOjos = Id<typeof FORMAS_OJOS>;
export type Cejas = Id<typeof CEJAS>;
export type Expresion = Id<typeof EXPRESIONES>;
export type PrendaSuperior = Id<typeof PRENDAS_SUPERIORES>;
export type PrendaInferior = Id<typeof PRENDAS_INFERIORES>;
export type Calzado = Id<typeof CALZADOS>;
export type Sombrero = Id<typeof SOMBREROS>;
export type Gafas = Id<typeof GAFAS>;

/** Apariencia completa y válida: lo único que dibuja el avatar y edita el personalizador. */
export interface Apariencia {
  version: 2;
  cuerpo: { complexion: Complexion; altura: number };
  piel: string;
  rostro: { ojos: FormaOjos; colorOjos: string; cejas: Cejas; expresion: Expresion; rubor: boolean };
  cabello: { estilo: EstiloCabello; color: string };
  velloFacial: { estilo: EstiloVello; color: string };
  ropa: {
    superior: PrendaSuperior;
    colorPrimario: string;
    colorSecundario: string;
    inferior: PrendaInferior;
    colorInferior: string;
    calzado: Calzado;
    colorCalzado: string;
  };
  accesorios: {
    sombrero: Sombrero;
    colorSombrero: string;
    gafas: Gafas;
    mochila: boolean;
    colorMochila: string;
    audifonos: boolean;
    bufanda: boolean;
    colorBufanda: string;
  };
}

/**
 * Lo que se guarda y viaja: una Apariencia, o un objeto de una versión
 * anterior. Todo opcional; normalizarApariencia completa lo que falta.
 */
export type PersonalizacionAvatar = Partial<Omit<Apariencia, 'accesorios'>> & {
  accesorios?: Partial<Apariencia['accesorios']> & { sombrero?: Sombrero | boolean; gafas?: Gafas | boolean };
  // Campos de la versión 1
  colorRopa?: string;
  colorPiel?: string;
  colorCabello?: string;
  estiloCabello?: string;
  expresionRostro?: string;
  escala?: number;
};

export const PALETA_PIEL = ['#ffe0c4', '#f7cfa6', '#eab88a', '#d9a066', '#c68642', '#a8693a', '#8d5524', '#6b3e1f', '#4a2a14'];
export const PALETA_CABELLO = ['#0f0d0b', '#2c1d11', '#4a2e1b', '#6f4a2f', '#a0673a', '#c58f4d', '#e1c16e', '#b8b8b8', '#f2f2f2', '#9c2f2f', '#3b5bdb', '#8e44ad'];
export const PALETA_OJOS = ['#3b2414', '#5a3a22', '#2f6b3a', '#2b5f8f', '#6b7b8c', '#1a1a1a'];
export const PALETA_ROPA = [
  '#0033a0', '#1d4ed8', '#3498db', '#0ea5e9', '#14b8a6', '#10b981', '#65a30d', '#eab308',
  '#f97316', '#dc2626', '#be185d', '#8b5cf6', '#f8fafc', '#94a3b8', '#334155', '#111827',
  '#7c4a2d', '#c9a27a',
];
export const PALETA_PANTALON = ['#111827', '#1e293b', '#334155', '#1e3a8a', '#3b5b8c', '#5b6b7f', '#7c4a2d', '#c9a27a', '#e5e7eb', '#14532d'];
export const PALETA_CALZADO = ['#111827', '#f8fafc', '#7c2d12', '#78350f', '#1d4ed8', '#dc2626', '#64748b'];

export const APARIENCIA_POR_DEFECTO: Apariencia = {
  version: 2,
  cuerpo: { complexion: 'media', altura: 1 },
  piel: '#d9a066',
  rostro: { ojos: 'redondos', colorOjos: '#3b2414', cejas: 'finas', expresion: 'alegre', rubor: true },
  cabello: { estilo: 'corto', color: '#2c1d11' },
  velloFacial: { estilo: 'ninguno', color: '#2c1d11' },
  ropa: {
    superior: 'polera',
    colorPrimario: '#0033a0',
    colorSecundario: '#f8fafc',
    inferior: 'jean',
    colorInferior: '#3b5b8c',
    calzado: 'zapatillas',
    colorCalzado: '#f8fafc',
  },
  accesorios: {
    sombrero: 'ninguno',
    colorSombrero: '#dc2626',
    gafas: 'ninguna',
    mochila: false,
    colorMochila: '#1e293b',
    audifonos: false,
    bufanda: false,
    colorBufanda: '#dc2626',
  },
};

/** Compatibilidad: el nombre con el que lo importan Login y el registro. */
export const PERSONALIZACION_POR_DEFECTO: PersonalizacionAvatar = APARIENCIA_POR_DEFECTO;

const HEX = /^#[0-9a-f]{6}$/i;

const color = (v: unknown, defecto: string) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : defecto);
const uno = <T extends string>(v: unknown, opciones: readonly { id: T }[], defecto: T): T =>
  opciones.some((o) => o.id === v) ? (v as T) : defecto;
const bool = (v: unknown, defecto: boolean) => (typeof v === 'boolean' ? v : defecto);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Apariencia completa y válida a partir de lo que haya guardado (cualquier versión) o recibido. */
export function normalizarApariencia(entrada: unknown): Apariencia {
  let crudo: unknown = entrada;
  if (typeof crudo === 'string') {
    try {
      crudo = JSON.parse(crudo);
    } catch {
      crudo = {};
    }
  }
  const p = obj(crudo);
  const d = APARIENCIA_POR_DEFECTO;
  const cuerpo = obj(p.cuerpo);
  const rostro = obj(p.rostro);
  const cabello = obj(p.cabello);
  const vello = obj(p.velloFacial);
  const ropa = obj(p.ropa);
  const acc = obj(p.accesorios);

  const alturaCruda = typeof cuerpo.altura === 'number' ? cuerpo.altura : typeof p.escala === 'number' ? p.escala : d.cuerpo.altura;
  const colorCabello = color(cabello.color ?? p.colorCabello, d.cabello.color);
  const colorPrimario = color(ropa.colorPrimario ?? p.colorRopa, d.ropa.colorPrimario);

  // Versión 1: sombrero y gafas eran booleanos
  const sombrero = acc.sombrero === true ? 'sombrero' : uno(acc.sombrero, SOMBREROS, d.accesorios.sombrero);
  const gafas = acc.gafas === true ? 'cuadradas' : uno(acc.gafas, GAFAS, d.accesorios.gafas);

  return {
    version: 2,
    cuerpo: {
      complexion: uno(cuerpo.complexion, COMPLEXIONES, d.cuerpo.complexion),
      altura: Number.isFinite(alturaCruda) ? Math.min(1.1, Math.max(0.9, alturaCruda)) : d.cuerpo.altura,
    },
    piel: color(p.piel ?? p.colorPiel, d.piel),
    rostro: {
      ojos: uno(rostro.ojos, FORMAS_OJOS, d.rostro.ojos),
      colorOjos: color(rostro.colorOjos, d.rostro.colorOjos),
      cejas: uno(rostro.cejas, CEJAS, d.rostro.cejas),
      expresion: uno(rostro.expresion ?? p.expresionRostro, EXPRESIONES, d.rostro.expresion),
      rubor: bool(rostro.rubor, d.rostro.rubor),
    },
    cabello: { estilo: uno(cabello.estilo ?? p.estiloCabello, ESTILOS_CABELLO, d.cabello.estilo), color: colorCabello },
    velloFacial: { estilo: uno(vello.estilo, ESTILOS_VELLO, d.velloFacial.estilo), color: color(vello.color, colorCabello) },
    ropa: {
      superior: uno(ropa.superior, PRENDAS_SUPERIORES, d.ropa.superior),
      colorPrimario,
      colorSecundario: color(ropa.colorSecundario, d.ropa.colorSecundario),
      inferior: uno(ropa.inferior, PRENDAS_INFERIORES, d.ropa.inferior),
      colorInferior: color(ropa.colorInferior, d.ropa.colorInferior),
      calzado: uno(ropa.calzado, CALZADOS, d.ropa.calzado),
      colorCalzado: color(ropa.colorCalzado, d.ropa.colorCalzado),
    },
    accesorios: {
      sombrero,
      colorSombrero: color(acc.colorSombrero, d.accesorios.colorSombrero),
      gafas,
      mochila: bool(acc.mochila, d.accesorios.mochila),
      colorMochila: color(acc.colorMochila, d.accesorios.colorMochila),
      audifonos: bool(acc.audifonos, d.accesorios.audifonos),
      bufanda: bool(acc.bufanda, d.accesorios.bufanda),
      colorBufanda: color(acc.colorBufanda, d.accesorios.colorBufanda),
    },
  };
}

/** Clave estable de una apariencia: dos avatares con la misma clave se ven iguales. */
export function claveApariencia(a: Apariencia): string {
  return JSON.stringify(a);
}
