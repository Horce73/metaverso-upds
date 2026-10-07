// Pizarra del aula por operaciones (AULA-02). Un trazo es una operación con
// id propio, de que se apoya el lápiz a que se levanta. Mientras se dibuja,
// los puntos llegan por lotes y se reenvían al aula; al terminar, el trazo se
// guarda en pizarra_trazos. Deshacer y borrar marcan borrado_en.
import { pool } from './db.js';

export const MAX_PUNTOS_POR_LOTE = 200;
export const MAX_PUNTOS_POR_TRAZO = 5000;
// Lo que se reconstruye al entrar; una clase normal no se acerca
export const MAX_TRAZOS_VISIBLES = 3000;

export type Punto = [number, number];

export interface LoteTrazo {
  id: string;
  color: string;
  grosor: number;
  puntos: Punto[];
  fin: boolean;
}

interface TrazoEnCurso {
  id: string;
  espacioId: number;
  usuarioId: number;
  socketId: string;
  color: string;
  grosor: number;
  puntos: Punto[];
}

const enCurso = new Map<string, TrazoEnCurso>();
// Trazos que se están escribiendo en la base: deshacer uno recién terminado
// tiene que esperar a que exista la fila
const guardando = new Map<string, Promise<void>>();

const ID = /^[A-Za-z0-9_-]{8,64}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const coordenada = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= -0.05 && v <= 1.05;

/** Lote recibido del cliente, validado; null si no tiene la forma esperada. */
export function validarLote(data: any): LoteTrazo | null {
  if (!data || typeof data !== 'object') return null;
  const { id, color, grosor, puntos, fin } = data;
  if (typeof id !== 'string' || !ID.test(id)) return null;
  if (typeof color !== 'string' || !COLOR.test(color)) return null;
  if (typeof grosor !== 'number' || !(grosor > 0 && grosor <= 0.05)) return null;
  if (!Array.isArray(puntos) || puntos.length > MAX_PUNTOS_POR_LOTE) return null;
  if (!puntos.every((p) => Array.isArray(p) && p.length === 2 && coordenada(p[0]) && coordenada(p[1]))) return null;
  return { id, color, grosor, puntos: puntos as Punto[], fin: fin === true };
}

/**
 * Suma un lote al trazo en curso (o lo empieza). Devuelve el lote tal como
 * se reenvía al aula, o null si el trazo es de otro socket. Si el trazo
 * llega al tope de puntos, se cierra.
 */
export function agregarLote(lote: LoteTrazo, espacioId: number, usuarioId: number, socketId: string): LoteTrazo | null {
  let t = enCurso.get(lote.id);
  if (!t) {
    t = { id: lote.id, espacioId, usuarioId, socketId, color: lote.color, grosor: lote.grosor, puntos: [] };
    enCurso.set(lote.id, t);
  } else if (t.socketId !== socketId || t.espacioId !== espacioId) {
    return null;
  }
  const lugar = MAX_PUNTOS_POR_TRAZO - t.puntos.length;
  const puntos = lote.puntos.slice(0, Math.max(0, lugar));
  t.puntos.push(...puntos);
  return { id: t.id, color: t.color, grosor: t.grosor, puntos, fin: lote.fin || t.puntos.length >= MAX_PUNTOS_POR_TRAZO };
}

/** Cierra el trazo y lo guarda, asociado a la clase en curso del aula si la hay. */
export async function cerrarTrazo(id: string): Promise<void> {
  const t = enCurso.get(id);
  if (!t) return;
  enCurso.delete(id);
  if (t.puntos.length === 0) return;
  const escritura = insertar(t).finally(() => guardando.delete(id));
  guardando.set(id, escritura);
  await escritura;
}

async function insertar(t: TrazoEnCurso): Promise<void> {
  await pool.query(
    `INSERT INTO pizarra_trazos (id, espacio_id, sesion_id, usuario_id, color, grosor, puntos)
     VALUES ($1, $2,
       (SELECT id FROM sesiones_clase WHERE espacio_id = $2 AND estado = 'en_curso' ORDER BY inicio_real DESC NULLS LAST LIMIT 1),
       $3, $4, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    [t.id, t.espacioId, t.usuarioId || null, t.color, t.grosor, JSON.stringify(t.puntos)]
  );
}

/** Trazos que un socket dejó a medias (se desconectó o salió del aula): se guardan. */
export async function cerrarTrazosDe(socketId: string): Promise<string[]> {
  const ids = [...enCurso.values()].filter((t) => t.socketId === socketId).map((t) => t.id);
  for (const id of ids) await cerrarTrazo(id);
  return ids;
}

/** Lo que está a la vista en el aula: lo guardado y lo que se está dibujando. */
export async function trazosVisibles(espacioId: number) {
  const { rows } = await pool.query(
    `SELECT id, color, grosor, puntos FROM (
       SELECT id, color, grosor, puntos, creado_en FROM pizarra_trazos
       WHERE espacio_id = $1 AND borrado_en IS NULL
       ORDER BY creado_en DESC LIMIT $2
     ) t ORDER BY creado_en`,
    [espacioId, MAX_TRAZOS_VISIBLES]
  );
  const vivos = [...enCurso.values()]
    .filter((t) => t.espacioId === espacioId)
    .map(({ id, color, grosor, puntos }) => ({ id, color, grosor, puntos }));
  return [...rows, ...vivos];
}

/** Deshace un trazo: el autor el suyo; docente o admin, cualquiera. */
export async function deshacerTrazo(id: string, espacioId: number, usuarioId: number, puedeTodo: boolean): Promise<boolean> {
  if (typeof id !== 'string' || !ID.test(id)) return false;
  await guardando.get(id)?.catch(() => {});
  const { rowCount } = await pool.query(
    `UPDATE pizarra_trazos SET borrado_en = NOW()
     WHERE id = $1 AND espacio_id = $2 AND borrado_en IS NULL AND ($3 OR usuario_id = $4)`,
    [id, espacioId, puedeTodo, usuarioId]
  );
  return (rowCount ?? 0) > 0;
}

/** Borra toda la pizarra del aula (queda en el historial con borrado_en). */
export async function borrarTodo(espacioId: number): Promise<void> {
  for (const t of enCurso.values()) if (t.espacioId === espacioId) enCurso.delete(t.id);
  await pool.query('UPDATE pizarra_trazos SET borrado_en = NOW() WHERE espacio_id = $1 AND borrado_en IS NULL', [espacioId]);
}
