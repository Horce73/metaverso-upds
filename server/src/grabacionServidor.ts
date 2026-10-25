// Grabación de la clase como acta (AULA-04). El docente la activa desde el
// aula y todos ven el aviso; mientras dura se guardan los subtítulos finales
// y una captura de la pantalla compartida cada INTERVALO_CAPTURA_MS. El acta
// junta eso con lo que ya queda de la clase: chat, encuestas, materiales
// mostrados y entradas/salidas.
import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pool } from './db.js';
import { authenticateJWT } from './middleware/auth.js';
import { bitacora } from './helpers.js';
import { puedeVerAsignatura } from './reporteAsistencia.js';
import { fechaHora } from './asistencia.js';
import { nombreArchivo } from './csv.js';
import { tocaCapturar, ordenarActa, actaHtml, type EventoActa } from './acta.js';

const DIRECTORIO = path.resolve(process.env.GRABACIONES_DIR || 'uploads/grabaciones');
const ZONA_HORARIA = process.env.ZONA_HORARIA || 'America/La_Paz';

interface GrabacionActiva {
  id: number;
  sesionId: number;
  por: string;
  ultimaCaptura: number | null;
}

const activas = new Map<number, GrabacionActiva>();

export function estadoGrabacion(espacioId: number) {
  const g = activas.get(espacioId);
  return g ? { activa: true, por: g.por } : { activa: false };
}

/** Empieza a grabar la clase en curso del aula. null si no hay clase en curso. */
export async function iniciarGrabacion(espacioId: number, usuarioId: number | null, nombre: string): Promise<boolean> {
  if (activas.has(espacioId)) return true;
  const { rows } = await pool.query(
    "SELECT id FROM sesiones_clase WHERE espacio_id = $1 AND estado = 'en_curso' ORDER BY inicio_real DESC NULLS LAST LIMIT 1",
    [espacioId]
  );
  const sesionId = rows[0]?.id;
  if (!sesionId) return false;
  const { rows: g } = await pool.query(
    'INSERT INTO grabaciones (sesion_id, iniciada_por) VALUES ($1, $2) RETURNING id',
    [sesionId, usuarioId]
  );
  activas.set(espacioId, { id: g[0].id, sesionId, por: nombre, ultimaCaptura: null });
  await bitacora(usuarioId, 'grabacion_inicio', `sesion=${sesionId}`);
  return true;
}

export async function detenerGrabacion(espacioId: number): Promise<boolean> {
  const g = activas.get(espacioId);
  if (!g) return false;
  activas.delete(espacioId);
  await pool.query('UPDATE grabaciones SET fin = NOW() WHERE id = $1 AND fin IS NULL', [g.id]);
  return true;
}

/** Al terminar la clase (por la ruta que sea) se corta su grabación. */
export async function detenerGrabacionDeSesion(sesionId: number): Promise<void> {
  for (const [espacioId, g] of activas) if (g.sesionId === sesionId) await detenerGrabacion(espacioId);
  await pool.query('UPDATE grabaciones SET fin = NOW() WHERE sesion_id = $1 AND fin IS NULL', [sesionId]);
}

export async function grabarSubtitulo(espacioId: number, autor: string, texto: string): Promise<void> {
  const g = activas.get(espacioId);
  if (!g) return;
  await pool.query("INSERT INTO grabacion_eventos (grabacion_id, tipo, autor, texto) VALUES ($1, 'subtitulo', $2, $3)", [
    g.id,
    autor.slice(0, 120),
    texto,
  ]);
}

export async function grabarCaptura(espacioId: number, autor: string, cuadro: Buffer): Promise<void> {
  const g = activas.get(espacioId);
  if (!g || !tocaCapturar(g.ultimaCaptura, Date.now())) return;
  g.ultimaCaptura = Date.now();
  const extension = cuadro[0] === 0xff ? 'jpg' : 'webp';
  const archivo = `${randomUUID()}.${extension}`;
  await mkdir(DIRECTORIO, { recursive: true });
  await writeFile(path.join(DIRECTORIO, archivo), cuadro);
  await pool.query("INSERT INTO grabacion_eventos (grabacion_id, tipo, autor, archivo) VALUES ($1, 'pantalla', $2, $3)", [
    g.id,
    autor.slice(0, 120),
    archivo,
  ]);
}

async function asignaturaDeSesion(sesionId: number): Promise<{ asignatura_id: number | null; tema: string | null; inicio: Date; espacio: string } | null> {
  const { rows } = await pool.query(
    `SELECT COALESCE(sc.asignatura_id, e.asignatura_id) AS asignatura_id, sc.tema,
            COALESCE(sc.inicio_real, sc.inicio_programado) AS inicio, e.nombre AS espacio
     FROM sesiones_clase sc JOIN espacios e ON e.id = sc.espacio_id WHERE sc.id = $1`,
    [sesionId]
  );
  return rows[0] ?? null;
}

/** Todo lo que quedó de una clase, en orden. */
async function eventosDeSesion(sesionId: number): Promise<EventoActa[]> {
  const q = (sql: string) => pool.query(sql, [sesionId]).then((r) => r.rows);
  const iso = (d: Date) => new Date(d).toISOString();
  const [grabaciones, capturas, chat, tramos, materiales, encuestas] = await Promise.all([
    q('SELECT inicio, fin FROM grabaciones WHERE sesion_id = $1'),
    q(`SELECT ge.id, ge.tipo, ge.autor, ge.texto, ge.en FROM grabacion_eventos ge
       JOIN grabaciones g ON g.id = ge.grabacion_id WHERE g.sesion_id = $1`),
    q('SELECT remitente, texto, enviado_en FROM chat_mensajes WHERE sesion_id = $1'),
    q(`SELECT u.nombre, u.apellido, t.entrada, t.salida FROM asistencia_tramos t
       JOIN asistencias a ON a.id = t.asistencia_id JOIN usuarios u ON u.id = a.usuario_id WHERE a.sesion_id = $1`),
    q(`SELECT m.titulo, sm.mostrado_en FROM sesion_materiales sm JOIN materiales m ON m.id = sm.material_id
       WHERE sm.sesion_id = $1`),
    q(`SELECT e.pregunta, e.opciones, COALESCE(e.cerrada_en, e.creada_en) AS en,
              (SELECT json_agg(v.opcion) FROM encuesta_votos v WHERE v.encuesta_id = e.id) AS votos
       FROM encuestas e WHERE e.sesion_id = $1`),
  ]);
  const eventos: EventoActa[] = [];
  for (const g of grabaciones) {
    eventos.push({ tipo: 'grabacion_inicio', en: iso(g.inicio) });
    if (g.fin) eventos.push({ tipo: 'grabacion_fin', en: iso(g.fin) });
  }
  for (const c of capturas) {
    eventos.push(
      c.tipo === 'pantalla'
        ? { tipo: 'pantalla', en: iso(c.en), autor: c.autor, capturaId: String(c.id) }
        : { tipo: 'subtitulo', en: iso(c.en), autor: c.autor, texto: c.texto }
    );
  }
  for (const m of chat) eventos.push({ tipo: 'chat', en: iso(m.enviado_en), autor: m.remitente, texto: m.texto });
  for (const t of tramos) {
    const nombre = `${t.nombre} ${t.apellido}`.trim();
    eventos.push({ tipo: 'entrada', en: iso(t.entrada), autor: nombre });
    if (t.salida) eventos.push({ tipo: 'salida', en: iso(t.salida), autor: nombre });
  }
  for (const m of materiales) eventos.push({ tipo: 'material', en: iso(m.mostrado_en), texto: m.titulo });
  for (const e of encuestas) {
    const votos: number[] = e.votos ?? [];
    eventos.push({
      tipo: 'encuesta',
      en: iso(e.en),
      texto: e.pregunta,
      opciones: (e.opciones as string[]).map((texto, i) => ({ texto, votos: votos.filter((v) => v === i).length })),
    });
  }
  return ordenarActa(eventos);
}

export function registrarRutasGrabacion(app: Express) {
  // Clases con acta: las que se dictaron en asignaturas que quien consulta puede ver
  app.get('/api/actas', authenticateJWT, async (req: any, res) => {
    const { userId } = req.user;
    try {
      const { rows } = await pool.query(
        `SELECT sc.id, sc.tema, COALESCE(sc.inicio_real, sc.inicio_programado) AS inicio, sc.estado,
                e.nombre AS espacio, a.codigo AS asignatura_codigo, a.nombre AS asignatura,
                (SELECT COUNT(*)::int FROM grabaciones g WHERE g.sesion_id = sc.id) AS grabaciones
         FROM sesiones_clase sc
         JOIN espacios e ON e.id = sc.espacio_id
         JOIN asignaturas a ON a.id = COALESCE(sc.asignatura_id, e.asignatura_id)
         WHERE sc.estado IN ('en_curso', 'finalizada')
           AND (EXISTS (SELECT 1 FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id
                        WHERE ur.usuario_id = $1 AND r.nombre = 'administrador')
                OR a.docente_id = $1 OR sc.docente_id = $1)
         ORDER BY inicio DESC LIMIT 100`,
        [userId]
      );
      res.json(rows);
    } catch (err) {
      console.error('Error al listar actas:', err);
      res.status(500).json({ error: 'Error de servidor' });
    }
  });

  app.get('/api/actas/:sesionId', authenticateJWT, async (req: any, res) => {
    const { userId } = req.user;
    const sesionId = Number(req.params.sesionId);
    if (!Number.isInteger(sesionId)) return res.status(400).json({ error: 'Clase inválida' });
    try {
      const sesion = await asignaturaDeSesion(sesionId);
      if (!sesion?.asignatura_id) return res.status(404).json({ error: 'Clase no encontrada' });
      if (!(await puedeVerAsignatura(userId, sesion.asignatura_id))) {
        return res.status(403).json({ error: 'Sólo el docente de la asignatura o un administrador' });
      }
      const eventos = await eventosDeSesion(sesionId);

      if (req.query.formato === 'html') {
        // Capturas embebidas: el archivo se lee sin conexión ni sesión
        const imagenes = new Map<string, string>();
        const { rows } = await pool.query(
          `SELECT ge.id, ge.archivo FROM grabacion_eventos ge JOIN grabaciones g ON g.id = ge.grabacion_id
           WHERE g.sesion_id = $1 AND ge.tipo = 'pantalla'`,
          [sesionId]
        );
        for (const r of rows) {
          const datos = await readFile(path.join(DIRECTORIO, r.archivo)).catch(() => null);
          if (datos) imagenes.set(String(r.id), `data:image/${r.archivo.endsWith('.jpg') ? 'jpeg' : 'webp'};base64,${datos.toString('base64')}`);
        }
        const cuando = fechaHora(sesion.inicio, ZONA_HORARIA);
        await bitacora(userId, 'exportar_acta', `sesion=${sesionId}`, req.ip);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo(`acta_${cuando.slice(0, 10)}_${sesion.tema ?? 'clase'}`, 'html')}"`);
        return res.send(
          actaHtml(
            `Acta de clase: ${sesion.tema ?? 'Clase'}`,
            `${sesion.espacio} · ${cuando}`,
            eventos,
            (en) => fechaHora(new Date(en), ZONA_HORARIA).slice(11),
            (id) => imagenes.get(id) ?? null
          )
        );
      }
      res.json({ sesion: { id: sesionId, tema: sesion.tema, inicio: sesion.inicio, espacio: sesion.espacio }, eventos });
    } catch (err) {
      console.error('Error al armar el acta:', err);
      res.status(500).json({ error: 'Error de servidor' });
    }
  });

  // Imagen de una captura, con el mismo permiso que el acta
  app.get('/api/actas/captura/:eventoId', authenticateJWT, async (req: any, res) => {
    const { userId } = req.user;
    const eventoId = Number(req.params.eventoId);
    if (!Number.isInteger(eventoId)) return res.status(400).end();
    try {
      const { rows } = await pool.query(
        `SELECT ge.archivo, g.sesion_id FROM grabacion_eventos ge JOIN grabaciones g ON g.id = ge.grabacion_id
         WHERE ge.id = $1 AND ge.tipo = 'pantalla'`,
        [eventoId]
      );
      const fila = rows[0];
      const sesion = fila && (await asignaturaDeSesion(fila.sesion_id));
      if (!sesion?.asignatura_id) return res.status(404).end();
      if (!(await puedeVerAsignatura(userId, sesion.asignatura_id))) return res.status(403).end();
      const datos = await readFile(path.join(DIRECTORIO, fila.archivo)).catch(() => null);
      if (!datos) return res.status(404).end();
      res.setHeader('Content-Type', fila.archivo.endsWith('.jpg') ? 'image/jpeg' : 'image/webp');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.send(datos);
    } catch (err) {
      console.error('Error al servir captura:', err);
      res.status(500).end();
    }
  });
}
