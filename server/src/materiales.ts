// Materiales del aula (AULA-06). El docente titular de la asignatura sube
// archivos desde el aula, los alumnos inscritos los abren o descargan, y el
// docente puede mostrar uno a toda la clase. Las tablas materiales y
// sesion_materiales ya venían en el esquema inicial.
import express, { type Express } from 'express';
import type { Server } from 'socket.io';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pool } from './db.js';
import { authenticateJWT } from './middleware/auth.js';
import { bitacora } from './helpers.js';

export const LIMITE_MATERIAL_BYTES = 20 * 1024 * 1024;

const DIRECTORIO = path.resolve(process.env.MATERIALES_DIR || 'uploads/materiales');

// Extensiones admitidas. Sólo PDF e imágenes se sirven para verse en el
// navegador, y sólo si el contenido coincide con la extensión; el resto se
// descarga. SVG queda fuera: puede llevar scripts.
const TIPOS: Record<string, { tipo: string; mime: string; enLinea?: (b: Buffer) => boolean }> = {
  pdf: { tipo: 'pdf', mime: 'application/pdf', enLinea: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  png: { tipo: 'imagen', mime: 'image/png', enLinea: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  jpg: { tipo: 'imagen', mime: 'image/jpeg', enLinea: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  jpeg: { tipo: 'imagen', mime: 'image/jpeg', enLinea: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  gif: { tipo: 'imagen', mime: 'image/gif', enLinea: (b) => b.subarray(0, 4).toString('latin1') === 'GIF8' },
  webp: {
    tipo: 'imagen',
    mime: 'image/webp',
    enLinea: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  ppt: { tipo: 'ppt', mime: 'application/vnd.ms-powerpoint' },
  pptx: { tipo: 'pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  doc: { tipo: 'otro', mime: 'application/msword' },
  docx: { tipo: 'otro', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  xls: { tipo: 'otro', mime: 'application/vnd.ms-excel' },
  xlsx: { tipo: 'otro', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  txt: { tipo: 'otro', mime: 'text/plain; charset=utf-8' },
  zip: { tipo: 'otro', mime: 'application/zip' },
};

export const EXTENSIONES_MATERIAL = Object.keys(TIPOS);

interface Acceso {
  asignaturaId: number;
  /** Docente titular de la asignatura o administrador: puede subir, borrar y mostrar. */
  gestiona: boolean;
  /** Puede ver y descargar: quien gestiona o un alumno inscrito. */
  ve: boolean;
}

function idValido(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function accesoAsignatura(userId: unknown, asignaturaId: number, docenteId: number): Promise<Acceso> {
  const uid = idValido(userId);
  if (!uid) return { asignaturaId, gestiona: false, ve: false };
  const { rows } = await pool.query(
    `SELECT
       EXISTS (SELECT 1 FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id
               WHERE ur.usuario_id = $1 AND r.nombre = 'administrador') AS admin,
       EXISTS (SELECT 1 FROM inscripciones WHERE usuario_id = $1 AND asignatura_id = $2) AS inscrito`,
    [uid, asignaturaId]
  );
  const gestiona = rows[0].admin || uid === docenteId;
  return { asignaturaId, gestiona, ve: gestiona || rows[0].inscrito };
}

async function accesoAula(userId: unknown, espacioId: number): Promise<Acceso | null> {
  const { rows } = await pool.query(
    `SELECT a.id AS asignatura_id, a.docente_id
     FROM espacios e JOIN asignaturas a ON a.id = e.asignatura_id
     WHERE e.id = $1 AND e.tipo = 'aula' AND e.activo = TRUE`,
    [espacioId]
  );
  if (rows.length === 0) return null;
  return accesoAsignatura(userId, rows[0].asignatura_id, rows[0].docente_id);
}

async function materialConAcceso(userId: unknown, materialId: number) {
  const { rows } = await pool.query(
    `SELECT m.*, a.docente_id FROM materiales m JOIN asignaturas a ON a.id = m.asignatura_id WHERE m.id = $1`,
    [materialId]
  );
  if (rows.length === 0) return null;
  const acceso = await accesoAsignatura(userId, rows[0].asignatura_id, rows[0].docente_id);
  return { material: rows[0], acceso };
}

function extensionDe(nombre: string): string {
  return path.extname(nombre).slice(1).toLowerCase();
}

// Lo que ve el cliente: nunca la ruta en disco.
function publico(m: any) {
  return {
    id: m.id,
    titulo: m.titulo,
    tipo: m.tipo,
    extension: extensionDe(m.archivo_url),
    tamano_bytes: m.tamano_bytes === null ? null : Number(m.tamano_bytes),
    subido_en: m.subido_en,
    subido_por: m.subido_por_nombre ?? undefined,
  };
}

// Cuerpo crudo con límite propio; un archivo demasiado grande responde 413 en JSON.
const cuerpoArchivo = (req: any, res: any, next: any) =>
  express.raw({ type: () => true, limit: LIMITE_MATERIAL_BYTES })(req, res, (err: any) => {
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: `El archivo supera los ${LIMITE_MATERIAL_BYTES / 1024 / 1024} MB` });
    }
    next(err);
  });

export function registrarRutasMateriales(app: Express, io: Server) {
  mkdir(DIRECTORIO, { recursive: true }).catch((err) => console.error('No se pudo crear el directorio de materiales:', err));

  app.get('/api/aulas/:espacioId/materiales', authenticateJWT, async (req: any, res) => {
    try {
      const espacioId = idValido(req.params.espacioId);
      const acceso = espacioId && (await accesoAula(req.user?.userId, espacioId));
      if (!acceso) return res.status(404).json({ error: 'Aula no encontrada' });
      if (!acceso.ve) return res.status(403).json({ error: 'No estás inscrito en esta asignatura' });
      const { rows } = await pool.query(
        `SELECT m.*, u.nombre || ' ' || u.apellido AS subido_por_nombre
         FROM materiales m JOIN usuarios u ON u.id = m.subido_por
         WHERE m.asignatura_id = $1 ORDER BY m.subido_en DESC`,
        [acceso.asignaturaId]
      );
      res.json({ puedeGestionar: acceso.gestiona, materiales: rows.map(publico) });
    } catch (err) {
      console.error('Error al listar materiales:', err);
      res.status(500).json({ error: 'Error al listar materiales' });
    }
  });

  // Permiso antes de leer el cuerpo: quien no puede subir no llega a mandar 20 MB.
  const puedeSubir = async (req: any, res: any, next: any) => {
    try {
      const espacioId = idValido(req.params.espacioId);
      const acceso = espacioId && (await accesoAula(req.user?.userId, espacioId));
      if (!acceso) return res.status(404).json({ error: 'Aula no encontrada' });
      if (!acceso.gestiona) return res.status(403).json({ error: 'Solo el docente de la asignatura puede subir materiales' });
      req.acceso = acceso;
      next();
    } catch (err) {
      next(err);
    }
  };

  // El archivo viaja como cuerpo crudo; título y nombre original, en la URL.
  app.post('/api/aulas/:espacioId/materiales', authenticateJWT, puedeSubir, cuerpoArchivo, async (req: any, res) => {
    try {
      const acceso: Acceso = req.acceso;
      const titulo = String(req.query.titulo ?? '').trim();
      const extension = extensionDe(String(req.query.nombre ?? ''));
      const datos: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (titulo.length === 0 || titulo.length > 150) {
        return res.status(400).json({ error: 'El título es obligatorio (máx. 150 caracteres)' });
      }
      if (!TIPOS[extension]) {
        return res.status(400).json({ error: `Tipo de archivo no admitido. Se aceptan: ${EXTENSIONES_MATERIAL.join(', ')}` });
      }
      if (datos.length === 0) return res.status(400).json({ error: 'El archivo está vacío' });

      const nombreEnDisco = `${randomUUID()}.${extension}`;
      await writeFile(path.join(DIRECTORIO, nombreEnDisco), datos);
      const { rows } = await pool.query(
        `INSERT INTO materiales (asignatura_id, subido_por, tipo, titulo, archivo_url, tamano_bytes)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [acceso.asignaturaId, req.user.userId, TIPOS[extension].tipo, titulo, nombreEnDisco, datos.length]
      );
      await bitacora(req.user.userId, 'subir_material', `${titulo} (${extension}, ${datos.length} B)`, req.ip);
      res.status(201).json(publico(rows[0]));
    } catch (err) {
      console.error('Error al subir material:', err);
      res.status(500).json({ error: 'Error al subir material' });
    }
  });

  app.get('/api/materiales/:id/archivo', authenticateJWT, async (req: any, res) => {
    try {
      const id = idValido(req.params.id);
      const encontrado = id && (await materialConAcceso(req.user?.userId, id));
      if (!encontrado) return res.status(404).json({ error: 'Material no encontrado' });
      if (!encontrado.acceso.ve) return res.status(403).json({ error: 'No estás inscrito en esta asignatura' });

      const { material } = encontrado;
      const extension = extensionDe(material.archivo_url);
      const info = TIPOS[extension] ?? { tipo: 'otro', mime: 'application/octet-stream' };
      const ruta = path.join(DIRECTORIO, path.basename(material.archivo_url));
      const datos = await readFile(ruta).catch(() => null);
      if (!datos) return res.status(410).json({ error: 'El archivo ya no está disponible' });

      const enLinea = info.enLinea?.(datos) ?? false;
      const nombre = `${material.titulo}.${extension}`;
      const ascii = nombre.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
      res.setHeader('Content-Type', enLinea ? info.mime : info.mime.startsWith('text/') ? info.mime : 'application/octet-stream');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader(
        'Content-Disposition',
        `${enLinea ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`
      );
      res.send(datos);
    } catch (err) {
      console.error('Error al servir material:', err);
      res.status(500).json({ error: 'Error al descargar material' });
    }
  });

  app.delete('/api/materiales/:id', authenticateJWT, async (req: any, res) => {
    try {
      const id = idValido(req.params.id);
      const encontrado = id && (await materialConAcceso(req.user?.userId, id));
      if (!encontrado) return res.status(404).json({ error: 'Material no encontrado' });
      if (!encontrado.acceso.gestiona) return res.status(403).json({ error: 'Solo el docente de la asignatura puede borrarlo' });

      await pool.query('DELETE FROM materiales WHERE id = $1', [id]);
      await unlink(path.join(DIRECTORIO, path.basename(encontrado.material.archivo_url))).catch(() => {});
      await bitacora(req.user.userId, 'borrar_material', encontrado.material.titulo, req.ip);
      res.status(204).end();
    } catch (err) {
      console.error('Error al borrar material:', err);
      res.status(500).json({ error: 'Error al borrar material' });
    }
  });

  // Abre el material en la pantalla de toda el aula y, si hay clase en curso,
  // lo deja registrado como mostrado en esa sesión.
  app.post('/api/materiales/:id/mostrar', authenticateJWT, async (req: any, res) => {
    try {
      const id = idValido(req.params.id);
      const espacioId = idValido(req.body?.espacioId);
      const encontrado = id && (await materialConAcceso(req.user?.userId, id));
      if (!encontrado) return res.status(404).json({ error: 'Material no encontrado' });
      if (!encontrado.acceso.gestiona) return res.status(403).json({ error: 'Solo el docente de la asignatura puede mostrarlo' });
      const aula = espacioId && (await accesoAula(req.user.userId, espacioId));
      if (!aula || aula.asignaturaId !== encontrado.acceso.asignaturaId) {
        return res.status(400).json({ error: 'El material no pertenece a la asignatura de esa aula' });
      }

      const { rows: sesion } = await pool.query(
        `SELECT id FROM sesiones_clase WHERE espacio_id = $1 AND estado = 'en_curso' ORDER BY inicio_real DESC NULLS LAST LIMIT 1`,
        [espacioId]
      );
      if (sesion.length > 0) {
        await pool.query(
          `INSERT INTO sesion_materiales (sesion_id, material_id) VALUES ($1, $2)
           ON CONFLICT (sesion_id, material_id) DO UPDATE SET mostrado_en = NOW()`,
          [sesion[0].id, id]
        );
      }
      const { rows: autor } = await pool.query('SELECT nombre, apellido FROM usuarios WHERE id = $1', [req.user.userId]);
      io.to(String(espacioId)).emit('material_mostrado', {
        material: publico(encontrado.material),
        por: autor[0] ? `${autor[0].nombre} ${autor[0].apellido}` : 'El docente',
      });
      res.json({ registradoEnSesion: sesion.length > 0 ? sesion[0].id : null });
    } catch (err) {
      console.error('Error al mostrar material:', err);
      res.status(500).json({ error: 'Error al mostrar material' });
    }
  });
}
