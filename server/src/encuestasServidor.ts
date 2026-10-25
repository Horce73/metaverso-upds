// Encuestas en vivo del aula (AULA-05): persistencia. Una abierta por aula;
// crear una nueva cierra la anterior.
import { pool } from './db.js';
import { contarVotos } from './encuestas.js';

export interface EstadoEncuesta {
  id: number;
  pregunta: string;
  opciones: string[];
  abierta: boolean;
  total: number;
  /** null mientras está abierta para quien no la dirige: el resultado no debe influir en el voto */
  votos: number[] | null;
}

async function sesionEnCurso(espacioId: number): Promise<number | null> {
  const { rows } = await pool.query(
    "SELECT id FROM sesiones_clase WHERE espacio_id = $1 AND estado = 'en_curso' ORDER BY inicio_real DESC NULLS LAST LIMIT 1",
    [espacioId]
  );
  return rows[0]?.id ?? null;
}

export async function crearEncuesta(espacioId: number, autorId: number | null, pregunta: string, opciones: string[]): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE encuestas SET abierta = FALSE, cerrada_en = NOW() WHERE espacio_id = $1 AND abierta', [espacioId]);
    const { rows } = await client.query(
      `INSERT INTO encuestas (espacio_id, sesion_id, autor_id, pregunta, opciones)
       VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
      [espacioId, await sesionEnCurso(espacioId), autorId, pregunta, JSON.stringify(opciones)]
    );
    await client.query('COMMIT');
    return rows[0].id;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Registra (o cambia) el voto. false si la encuesta no está abierta en ese aula o la opción no existe. */
export async function votar(espacioId: number, encuestaId: number, usuarioId: number, opcion: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `INSERT INTO encuesta_votos (encuesta_id, usuario_id, opcion)
     SELECT e.id, $3::int, $4::smallint FROM encuestas e
     WHERE e.id = $1 AND e.espacio_id = $2 AND e.abierta AND $4::smallint >= 0 AND $4::smallint < jsonb_array_length(e.opciones)
     ON CONFLICT (encuesta_id, usuario_id) DO UPDATE SET opcion = EXCLUDED.opcion, votado_en = NOW()`,
    [encuestaId, espacioId, usuarioId, opcion]
  );
  return (rowCount ?? 0) > 0;
}

export async function cerrarEncuesta(espacioId: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    'UPDATE encuestas SET abierta = FALSE, cerrada_en = NOW() WHERE espacio_id = $1 AND abierta',
    [espacioId]
  );
  return (rowCount ?? 0) > 0;
}

/**
 * La encuesta vigente del aula: la abierta, o la última cerrada de la clase en
 * curso (para que quien llega tarde vea el resultado). null si no hay.
 */
export async function encuestaVigente(espacioId: number): Promise<{ estado: EstadoEncuesta; votosPorUsuario: Map<number, number> } | null> {
  const sesionId = await sesionEnCurso(espacioId);
  const { rows } = await pool.query(
    `SELECT id, pregunta, opciones, abierta FROM encuestas
     WHERE espacio_id = $1 AND (abierta OR ($2::int IS NOT NULL AND sesion_id = $2))
     ORDER BY abierta DESC, creada_en DESC LIMIT 1`,
    [espacioId, sesionId]
  );
  const e = rows[0];
  if (!e) return null;
  const votos = (await pool.query('SELECT usuario_id, opcion FROM encuesta_votos WHERE encuesta_id = $1', [e.id])).rows;
  return {
    estado: {
      id: e.id,
      pregunta: e.pregunta,
      opciones: e.opciones,
      abierta: e.abierta,
      total: votos.length,
      votos: contarVotos(votos.map((v) => v.opcion), e.opciones.length),
    },
    votosPorUsuario: new Map(votos.map((v) => [v.usuario_id, v.opcion])),
  };
}
