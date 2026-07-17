import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Configuración de la base de datos PostgreSQL
const poolConfig = {
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/metaverso_upds',
};

export const pool = new Pool(poolConfig);

let useMock = false;

// Probar conexión a la base de datos
pool.connect((err, client, release) => {
  if (err) {
    console.warn('⚠️ No se pudo conectar a la base de datos PostgreSQL.');
    console.warn('⚠️ Usando el almacenamiento temporal en memoria (mock) para el desarrollo.');
    useMock = true;
  } else {
    console.log('✅ Conexión exitosa a PostgreSQL');
    release();
  }
});

// Estructuras en memoria para simulación (Mock DB)
export const mockDb = {
  usuarios: [] as any[],
  avatares: [] as any[],
  asignaturas: [
    {
      id: 'isw-501-id',
      codigo: 'ISW-501',
      nombre: 'Ingeniería de Software',
      docente_id: 'docente-id',
      gestion: '2026-2',
      activa: true
    }
  ],
  inscripciones: [] as { usuario_id: string; asignatura_id: string }[],
  espacios: [
    {
      id: 'campus-central-id',
      nombre: 'Campus Central UPDS',
      tipo: 'campus',
      asignatura_id: null,
      escena_url: '/escenas/campus.glb',
      capacidad_max: 100,
      activo: true
    },
    {
      id: 'aula-isw-id',
      nombre: 'Aula Ingeniería de Software',
      tipo: 'aula',
      asignatura_id: 'isw-501-id',
      escena_url: '/escenas/aula_isw.glb',
      capacidad_max: 40,
      activo: true
    }
  ],
  sesiones_clase: [] as any[],
  asistencias: [] as any[],
  materiales: [] as any[],
  pizarra_snapshots: [] as any[]
};

// Insertar datos mock iniciales (Docente de prueba)
import bcrypt from 'bcrypt';
const hashedDefaultPass = await bcrypt.hash('123456', 10);
const defaultDocente = {
  id: 'docente-id',
  registro_upds: 'DOC-1010',
  email: 'docente.isw@upds.edu.bo',
  password_hash: hashedDefaultPass,
  nombre: 'Carlos',
  apellido: 'Docente',
  rol: 'docente',
  activo: true,
  acepta_terminos: true,
  creado_en: new Date()
};
mockDb.usuarios.push(defaultDocente);

// Crear el primer avatar del docente
mockDb.avatares.push({
  id: 'avatar-docente-id',
  usuario_id: 'docente-id',
  nombre_visible: 'Ing. Carlos',
  modelo_url: null, // Avatar simple
  apariencia: { colorCabello: '#4a3728', colorCamisa: '#2e6f40', colorPantalon: '#222222', escala: 1.0 },
  actualizado_en: new Date()
});

// Función helper para realizar consultas genéricas que soporten el fallback
export async function query(text: string, params?: any[]) {
  if (useMock) {
    throw new Error('Base de datos en modo mock. Usa las funciones mock directas.');
  }
  return pool.query(text, params);
}

export function isUsingMock() {
  return useMock;
}
