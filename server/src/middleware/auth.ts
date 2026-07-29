import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { pool } from '../db.js';

// Este módulo se importa desde index.ts antes de que index.ts llame a
// dotenv.config() (los imports de ES modules se resuelven antes que el resto
// del cuerpo del módulo importador), así que carga su propio .env aquí para
// no depender de ese orden.
dotenv.config();

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET no está definido en el entorno');
}
const JWT_SECRET = process.env.JWT_SECRET;

export function authenticateJWT(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.sendStatus(401);

  const token = authHeader.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err) return res.sendStatus(403);
    req.user = decoded;
    next();
  });
}

export function requiereRol(...rolesPermitidos: string[]) {
  return async (req: any, res: any, next: any) => {
    try {
      const result = await pool.query(
        `SELECT r.nombre
         FROM usuario_roles ur
         JOIN roles r ON r.id = ur.rol_id
         WHERE ur.usuario_id = $1`,
        [req.user.userId]
      );
      const roles = result.rows.map((r: any) => r.nombre);
      const tieneRol = roles.some((r: string) => rolesPermitidos.includes(r));
      if (!tieneRol) {
        return res.status(403).json({ error: 'Acceso denegado: rol insuficiente' });
      }
      req.user.roles = roles;
      next();
    } catch {
      res.status(500).json({ error: 'Error de servidor' });
    }
  };
}

export const requiereAdmin = requiereRol('administrador');
