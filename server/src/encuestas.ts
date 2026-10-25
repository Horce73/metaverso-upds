// Encuestas en vivo del aula (AULA-05): validación y conteo, sin base de
// datos para poder probarlos. La persistencia está en encuestasServidor.ts.
import { sanearTextoChat } from './chat.js';

export const MIN_OPCIONES = 2;
export const MAX_OPCIONES = 6;
const MAX_PREGUNTA = 200;
const MAX_OPCION = 80;

export type ResultadoValidacion =
  | { ok: true; pregunta: string; opciones: string[] }
  | { ok: false; motivo: string };

export function validarEncuesta(entrada: { pregunta?: unknown; opciones?: unknown }): ResultadoValidacion {
  const pregunta = sanearTextoChat(entrada?.pregunta);
  if (!pregunta.ok) return { ok: false, motivo: 'Escribe la pregunta.' };
  if (pregunta.texto.length > MAX_PREGUNTA) return { ok: false, motivo: `La pregunta supera los ${MAX_PREGUNTA} caracteres.` };
  if (!Array.isArray(entrada.opciones)) return { ok: false, motivo: 'Faltan las opciones.' };

  const opciones: string[] = [];
  for (const o of entrada.opciones) {
    const saneada = sanearTextoChat(o);
    if (!saneada.ok) continue; // las vacías se ignoran
    if (saneada.texto.length > MAX_OPCION) return { ok: false, motivo: `Una opción supera los ${MAX_OPCION} caracteres.` };
    opciones.push(saneada.texto);
  }
  if (opciones.length < MIN_OPCIONES || opciones.length > MAX_OPCIONES) {
    return { ok: false, motivo: `Pon entre ${MIN_OPCIONES} y ${MAX_OPCIONES} opciones.` };
  }
  if (new Set(opciones.map((o) => o.toLocaleLowerCase('es'))).size !== opciones.length) {
    return { ok: false, motivo: 'Hay opciones repetidas.' };
  }
  return { ok: true, pregunta: pregunta.texto, opciones };
}

/** Votos por opción, en el orden de las opciones. Ignora opciones fuera de rango. */
export function contarVotos(votos: number[], cantidadOpciones: number): number[] {
  const conteo = new Array(cantidadOpciones).fill(0);
  for (const v of votos) if (Number.isInteger(v) && v >= 0 && v < cantidadOpciones) conteo[v]++;
  return conteo;
}
