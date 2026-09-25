// Saneamiento del chat en el servidor (SEC-05). No depende de que el cliente
// escape la salida: valida el texto y construye el mensaje difundido con una
// lista cerrada de campos, sin reenviar nada que el cliente haya agregado.

export const MAX_LARGO_CHAT = 500;

// Caracteres de control (salvo salto de linea), de ancho cero y de control de
// direccion bidi: permiten mensajes invisibles o texto que se muestra al reves
// de como esta escrito.
const INVISIBLES = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

export type ResultadoChat = { ok: true; texto: string } | { ok: false; motivo: string };

export function sanearTextoChat(entrada: unknown): ResultadoChat {
  if (typeof entrada !== 'string') return { ok: false, motivo: 'El mensaje debe ser texto.' };

  const texto = entrada
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(INVISIBLES, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!texto) return { ok: false, motivo: 'El mensaje está vacío.' };
  if (texto.length > MAX_LARGO_CHAT) {
    return { ok: false, motivo: `El mensaje supera los ${MAX_LARGO_CHAT} caracteres.` };
  }
  return { ok: true, texto };
}
