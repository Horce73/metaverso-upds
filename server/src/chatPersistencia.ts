// Chat guardado (A11Y-02). Lo que se difunde por socket se guarda también,
// y a quien entra a un espacio se le manda lo reciente.
import { pool } from './db.js';

export const MAX_HISTORIAL = 50;

export interface MensajeChat {
  id?: string;
  sender: string;
  text: string;
  enviadoEn: string;
}

// La clase en curso del aula, si hay: el historial de un aula es el de esa
// clase, no el de la anterior.
async function sesionEnCurso(espacioId: number): Promise<number | null> {
  const { rows } = await pool.query(
    "SELECT id FROM sesiones_clase WHERE espacio_id = $1 AND estado = 'en_curso' ORDER BY inicio_real DESC NULLS LAST LIMIT 1",
    [espacioId]
  );
  return rows[0]?.id ?? null;
}

/** Guarda el mensaje ya saneado y lo devuelve con su id y hora de la base. */
export async function guardarMensaje(espacioId: number, usuarioId: number | null, remitente: string, texto: string): Promise<MensajeChat> {
  const sesionId = await sesionEnCurso(espacioId);
  const { rows } = await pool.query(
    `INSERT INTO chat_mensajes (espacio_id, sesion_id, usuario_id, remitente, texto)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, enviado_en`,
    [espacioId, sesionId, usuarioId, remitente.slice(0, 120), texto]
  );
  return { id: String(rows[0].id), sender: remitente, text: texto, enviadoEn: rows[0].enviado_en.toISOString() };
}

/**
 * Los últimos mensajes del espacio, del más viejo al más nuevo. En un aula
 * con clase en curso, los de esa clase; si no, los de las últimas 24 horas.
 */
export async function historialDe(espacioId: number): Promise<MensajeChat[]> {
  const sesionId = await sesionEnCurso(espacioId);
  const { rows } = await pool.query(
    `SELECT id, remitente, texto, enviado_en FROM chat_mensajes
     WHERE espacio_id = $1
       AND ${sesionId ? 'sesion_id = $3' : "enviado_en > NOW() - INTERVAL '24 hours'"}
     ORDER BY enviado_en DESC, id DESC
     LIMIT $2`,
    sesionId ? [espacioId, MAX_HISTORIAL, sesionId] : [espacioId, MAX_HISTORIAL]
  );
  return rows.reverse().map((r) => ({ id: String(r.id), sender: r.remitente, text: r.texto, enviadoEn: r.enviado_en.toISOString() }));
}
