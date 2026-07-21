import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'upds-metaverso-super-secret-key-2026';

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
