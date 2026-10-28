// Saneado de la apariencia del avatar (AVATAR-01). El cliente es quien la
// interpreta (normalizarApariencia en src/components/mundo3d/personalizacion.ts);
// el servidor sólo se asegura de no guardar ni retransmitir a toda el aula
// algo que no sea una apariencia: claves cortas, valores simples y poca
// profundidad. Sin repetir acá la lista de opciones, que cambia más seguido.

const CLAVE = /^[a-zA-Z]{1,24}$/;
const MAX_CLAVES = 24;
const MAX_TEXTO = 24;
const MAX_PROFUNDIDAD = 2;

type Valor = string | number | boolean | { [clave: string]: Valor };

function sanear(v: unknown, profundidad: number): Valor | undefined {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.max(-1000, Math.min(1000, v)) : undefined;
  if (typeof v === 'string') return v.length <= MAX_TEXTO ? v : undefined;
  if (v && typeof v === 'object' && !Array.isArray(v) && profundidad < MAX_PROFUNDIDAD) {
    const salida: { [clave: string]: Valor } = {};
    for (const [k, valor] of Object.entries(v).slice(0, MAX_CLAVES)) {
      if (!CLAVE.test(k)) continue;
      const limpio = sanear(valor, profundidad + 1);
      if (limpio !== undefined) salida[k] = limpio;
    }
    return salida;
  }
  return undefined;
}

/** Objeto plano y acotado con lo que se reconoce como apariencia; {} si no hay nada usable. */
export function sanearApariencia(entrada: unknown): Record<string, Valor> {
  let v = entrada;
  if (typeof v === 'string' && v.length <= 4096) {
    try {
      v = JSON.parse(v);
    } catch {
      return {};
    }
  }
  const limpio = sanear(v, 0);
  return limpio && typeof limpio === 'object' ? limpio : {};
}
