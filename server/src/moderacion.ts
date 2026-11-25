// Núcleo de la moderación (MOD-01, RF-35 y RF-37). Puro: sin base ni sockets,
// para probarlo con node --test. La capa de red (MOD-02) le pasa los roles,
// las sanciones y las reglas que lee de la base.

export type TipoSancion = 'silencio_voz' | 'silencio_chat' | 'expulsion' | 'veto_evento';

export interface Participante {
  userId: number; // 0 para invitados y oyentes
  roles: string[];
}

export interface ContextoModeracion {
  espacioTipo: 'campus' | 'aula';
  /** asignaturas.docente_id del aula; null en el campus. */
  docenteDelEspacioId: number | null;
}

/**
 * El admin modera en cualquier espacio; el docente, solo en el aula de su
 * asignatura. Nadie modera a un admin ni a sí mismo.
 */
export function puedeModerar(actor: Participante, objetivo: Participante, contexto: ContextoModeracion): boolean {
  if (objetivo.roles.includes('administrador')) return false;
  if (actor.userId > 0 && actor.userId === objetivo.userId) return false;
  if (actor.roles.includes('administrador')) return true;
  return (
    contexto.espacioTipo === 'aula' &&
    actor.roles.includes('docente') &&
    actor.userId > 0 &&
    actor.userId === contexto.docenteDelEspacioId
  );
}

export interface VigenciaSancion {
  tipo: TipoSancion;
  hasta: Date | null; // null: hasta que se levante
  levantadaEn: Date | null;
}

/** La sanción de ese tipo vigente en `ahora`, o undefined si no hay ninguna. */
export function estaSancionado<S extends VigenciaSancion>(sanciones: S[], tipo: TipoSancion, ahora = Date.now()): S | undefined {
  return sanciones.find((s) => s.tipo === tipo && !s.levantadaEn && (!s.hasta || s.hasta.getTime() > ahora));
}

export interface ReglasChat {
  palabrasBloqueadas: string[];
  bloquearEnlaces: boolean;
  maxMayusculasPct: number; // 100: sin límite
  modoLentoSeg: number; // 0: apagado
}

export type Veredicto = { ok: true } | { ok: false; motivo: string };

// Ráfaga: siempre activa y holgada, solo frena inundaciones. El modo lento,
// en cambio, lo activa el moderador para todo el espacio.
export const RAFAGA_MAX = 5;
export const RAFAGA_VENTANA_MS = 10_000;
// Con menos letras, «OK» o «UPDS» contarían como gritar
export const MIN_LETRAS_MAYUSCULAS = 8;

const ENLACE = /(https?:\/\/|www\.)\S|\b[\w-]+\.(com|net|org|bo|io|ly|gg|me|xyz|info|link)\b/i;

// Minúsculas, sin acentos y con las palabras separadas por un espacio, para
// comparar palabras completas: «sexto» no contiene la palabra «sex».
const palabras = (texto: string) =>
  ` ${texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(' ')} `;

/**
 * Reglas del filtro de chat sobre un texto ya saneado (sanearTextoChat).
 * `envios` son las horas (ms) de los mensajes aceptados antes a esta misma
 * persona en este espacio; quien llama agrega el nuevo si el veredicto es ok.
 */
export function evaluarMensaje(texto: string, reglas: ReglasChat, envios: number[], ahora = Date.now()): Veredicto {
  if (reglas.modoLentoSeg > 0 && envios.length) {
    const espera = Math.max(...envios) + reglas.modoLentoSeg * 1000 - ahora;
    if (espera > 0) return { ok: false, motivo: `El chat está en modo lento. Espera ${Math.ceil(espera / 1000)} s.` };
  }
  if (envios.filter((t) => ahora - t < RAFAGA_VENTANA_MS).length >= RAFAGA_MAX) {
    return { ok: false, motivo: 'Vas muy rápido. Espera unos segundos.' };
  }
  const delTexto = palabras(texto);
  if (reglas.palabrasBloqueadas.some((p) => palabras(p).trim() && delTexto.includes(palabras(p)))) {
    return { ok: false, motivo: 'Tu mensaje tiene una palabra que no se permite en este espacio.' };
  }
  if (reglas.bloquearEnlaces && ENLACE.test(texto)) {
    return { ok: false, motivo: 'En este espacio no se permiten enlaces.' };
  }
  if (reglas.maxMayusculasPct < 100) {
    const letras = texto.match(/\p{L}/gu)?.length ?? 0;
    const mayusculas = texto.match(/\p{Lu}/gu)?.length ?? 0;
    if (letras >= MIN_LETRAS_MAYUSCULAS && (mayusculas * 100) / letras > reglas.maxMayusculasPct) {
      return { ok: false, motivo: 'Escribe sin tantas mayúsculas.' };
    }
  }
  return { ok: true };
}
