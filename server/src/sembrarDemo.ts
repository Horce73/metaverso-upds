// Datos de demostración (OPS-06): un docente, 12 estudiantes, una asignatura
// con su aula y seis clases ya dictadas, con asistencia, chat, una encuesta,
// un acta grabada y mapa de calor. Sirve para mostrar el proyecto con el
// tablero y las actas llenos, sin preparar nada a mano.
//
//   npm run demo:sembrar            crea (o rehace) los datos
//   npm run demo:sembrar -- --borrar sólo los borra
//
// Todo lo de demo se reconoce por el dominio @demo.local y la asignatura
// DEMO-101; volver a correrlo borra lo anterior y lo crea de nuevo. La clave
// de las cuentas sale de DEMO_CLAVE, o se genera y se muestra al final.
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { pool } from './db.js';
import { aplicarMigraciones } from './migraciones.js';

const DOMINIO = '@demo.local';
const CODIGO = 'DEMO-101';
const ESTUDIANTES = [
  'Valeria Quispe', 'Diego Mamani', 'Camila Rojas', 'Mateo Choque', 'Lucía Vargas', 'Andrés Flores',
  'Sofía Gutiérrez', 'Joaquín Torrez', 'Daniela Condori', 'Gabriel Céspedes', 'Isabella Peña', 'Santiago Rivero',
];
const TEMAS = [
  'Introducción a la ingeniería de requisitos',
  'Historias de usuario y criterios de aceptación',
  'Modelado de casos de uso',
  'Diagramas de clases',
  'Patrones de diseño: creacionales',
  'Repaso para el primer parcial',
];

// Generador con semilla: la demo sale igual cada vez que se siembra
function aleatorio(semilla: number) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

async function borrar() {
  // Las clases, asistencias, chat, encuestas, actas y mapas cuelgan del aula
  // (ON DELETE CASCADE): basta con borrar el aula, la asignatura y las cuentas.
  await pool.query(`DELETE FROM espacios WHERE asignatura_id IN (SELECT id FROM asignaturas WHERE codigo = $1)`, [CODIGO]);
  await pool.query('DELETE FROM asignaturas WHERE codigo = $1', [CODIGO]);
  await pool.query('DELETE FROM usuarios WHERE email LIKE $1', [`%${DOMINIO}`]);
}

async function crearUsuario(email: string, nombre: string, apellido: string, hash: string, rol: 'docente' | 'estudiante') {
  const { rows } = await pool.query(
    'INSERT INTO usuarios (email, password_hash, nombre, apellido) VALUES ($1, $2, $3, $4) RETURNING id',
    [email, hash, nombre, apellido]
  );
  const id: number = rows[0].id;
  await pool.query('INSERT INTO usuario_roles (usuario_id, rol_id) SELECT $1, id FROM roles WHERE nombre = $2', [id, rol]);
  await pool.query('INSERT INTO avatares (usuario_id, nombre_visible) VALUES ($1, $2)', [id, `${nombre} ${apellido[0]}.`]);
  return id;
}

async function sembrar(clave: string) {
  const azar = aleatorio(101);
  const hash = await bcrypt.hash(clave, 10);
  const carrera = (await pool.query('SELECT id FROM carreras ORDER BY id LIMIT 1')).rows[0]?.id ?? null;

  const docenteId = await crearUsuario(`docente${DOMINIO}`, 'Elena', 'Salazar', hash, 'docente');
  await pool.query(
    `INSERT INTO perfiles_docente (usuario_id, codigo_docente, especialidad, turno) VALUES ($1, 'DEMO-DOC', 'Ingeniería de Software', 'NOCHE')`,
    [docenteId]
  );

  const alumnos: { id: number; nombre: string }[] = [];
  for (const [i, completo] of ESTUDIANTES.entries()) {
    const [nombre, apellido] = completo.split(' ');
    const id = await crearUsuario(`estudiante${i + 1}${DOMINIO}`, nombre, apellido, hash, 'estudiante');
    await pool.query(
      `INSERT INTO perfiles_estudiante (usuario_id, registro_upds, carrera_id, turno, semestre) VALUES ($1, $2, $3, 'NOCHE', 5)`,
      [id, `DEMO-${String(i + 1).padStart(3, '0')}`, carrera]
    );
    alumnos.push({ id, nombre: `${nombre} ${apellido[0]}.` });
  }

  const asignaturaId = (
    await pool.query(
      `INSERT INTO asignaturas (codigo, nombre, carrera_id, docente_id, gestion) VALUES ($1, 'Ingeniería de Software (demo)', $2, $3, '2026-2') RETURNING id`,
      [CODIGO, carrera, docenteId]
    )
  ).rows[0].id;
  for (const a of alumnos) await pool.query('INSERT INTO inscripciones (usuario_id, asignatura_id) VALUES ($1, $2)', [a.id, asignaturaId]);
  const espacioId = (
    await pool.query(
      `INSERT INTO espacios (nombre, tipo, asignatura_id, escena_url, capacidad_max) VALUES ('Aula de demostración', 'aula', $1, '/escenas/aula.glb', 40) RETURNING id`,
      [asignaturaId]
    )
  ).rows[0].id;

  // Seis clases semanales de 90 minutos, la última hace una semana
  const DIA = 86400000;
  for (const [n, tema] of TEMAS.entries()) {
    const inicio = new Date(Date.now() - (TEMAS.length - n) * 7 * DIA);
    inicio.setHours(23, 0, 0, 0); // 19:00 en La Paz
    const fin = new Date(inicio.getTime() + 90 * 60000);
    const sesionId = (
      await pool.query(
        `INSERT INTO sesiones_clase (espacio_id, docente_id, asignatura_id, tema, inicio_programado, fin_programado, inicio_real, fin_real, estado)
         VALUES ($1, $2, $3, $4, $5, $6, $5, $6, 'finalizada') RETURNING id`,
        [espacioId, docenteId, asignaturaId, tema, inicio, fin]
      )
    ).rows[0].id;

    for (const a of alumnos) {
      const r = azar();
      if (r < 0.12) continue; // ausente
      const llegada = new Date(inicio.getTime() + (r < 0.27 ? 12 + azar() * 20 : azar() * 8) * 60000);
      const estado = llegada.getTime() > inicio.getTime() + 10 * 60000 ? 'tarde' : 'presente';
      const salida = new Date(fin.getTime() - (azar() < 0.15 ? azar() * 40 : 0) * 60000);
      const asistenciaId = (
        await pool.query(
          `INSERT INTO asistencias (sesion_id, usuario_id, hora_ingreso, hora_salida, estado) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [sesionId, a.id, llegada, salida, estado]
        )
      ).rows[0].id;
      await pool.query('INSERT INTO asistencia_tramos (asistencia_id, entrada, salida) VALUES ($1, $2, $3)', [asistenciaId, llegada, salida]);
    }

    const minuto = (m: number) => new Date(inicio.getTime() + m * 60000);
    const chat: [number, string, string][] = [
      [3, alumnos[0].nombre, 'Buenas noches, profe'],
      [4, 'Elena S.', 'Buenas noches. Empezamos en un minuto.'],
      [35, alumnos[3].nombre, '¿Esto entra en el parcial?'],
      [36, 'Elena S.', 'Sí, los ejemplos de hoy son tipo examen.'],
      [70, alumnos[6].nombre, '¿Puede subir las diapositivas a materiales?'],
    ];
    for (const [m, quien, texto] of chat) {
      await pool.query(
        'INSERT INTO chat_mensajes (espacio_id, sesion_id, remitente, texto, enviado_en) VALUES ($1, $2, $3, $4, $5)',
        [espacioId, sesionId, quien, texto, minuto(m)]
      );
    }

    // La última clase tiene encuesta y quedó grabada con subtítulos
    if (n === TEMAS.length - 1) {
      const encuestaId = (
        await pool.query(
          `INSERT INTO encuestas (espacio_id, sesion_id, autor_id, pregunta, opciones, abierta, creada_en, cerrada_en)
           VALUES ($1, $2, $3, '¿Qué tema quieren repasar más?', $4::jsonb, FALSE, $5, $6) RETURNING id`,
          [espacioId, sesionId, docenteId, JSON.stringify(['Casos de uso', 'Diagramas de clases', 'Patrones de diseño']), minuto(60), minuto(64)]
        )
      ).rows[0].id;
      for (const a of alumnos.slice(0, 10)) {
        await pool.query('INSERT INTO encuesta_votos (encuesta_id, usuario_id, opcion) VALUES ($1, $2, $3)', [encuestaId, a.id, Math.floor(azar() * 3)]);
      }
      const grabacionId = (
        await pool.query('INSERT INTO grabaciones (sesion_id, iniciada_por, inicio, fin) VALUES ($1, $2, $3, $4) RETURNING id', [
          sesionId,
          docenteId,
          minuto(5),
          minuto(88),
        ])
      ).rows[0].id;
      const subtitulos: [number, string][] = [
        [6, 'Hoy repasamos todo lo que entra en el primer parcial.'],
        [15, 'Un caso de uso describe lo que el actor logra, no cómo lo hace la pantalla.'],
        [42, 'En el diagrama de clases, la multiplicidad va en los dos extremos de la asociación.'],
        [80, 'Para la próxima clase, traigan resuelto el ejercicio tres.'],
      ];
      for (const [m, texto] of subtitulos) {
        await pool.query(
          "INSERT INTO grabacion_eventos (grabacion_id, tipo, autor, texto, en) VALUES ($1, 'subtitulo', 'Elena S.', $2, $3)",
          [grabacionId, texto, minuto(m)]
        );
      }
    }
  }

  // Mapa de calor: el frente del aula, los pupitres y la puerta
  for (let cx = -9; cx <= 9; cx++) {
    for (let cz = -9; cz <= 9; cz++) {
      const frente = Math.exp(-((cx * 2) ** 2 + (cz * 2 + 13) ** 2) / 30);
      const pupitre = [-5, -2, 1, 4].includes(cx) && [-3, 0, 2].includes(cz) ? 1 : 0;
      const segundos = Math.round(120 + 6000 * frente + 4000 * pupitre * (0.6 + azar() * 0.4));
      await pool.query(
        "INSERT INTO mapa_calor (espacio_id, dia, cx, cz, segundos) VALUES ($1, (NOW() AT TIME ZONE 'America/La_Paz')::date - 7, $2, $3, $4)",
        [espacioId, cx, cz, segundos]
      );
    }
  }
  return { asignaturaId, espacioId };
}

async function main() {
  await aplicarMigraciones(pool);
  await borrar();
  if (process.argv.includes('--borrar')) {
    console.log('Datos de demostración borrados.');
    return;
  }
  const generada = !process.env.DEMO_CLAVE;
  const clave = process.env.DEMO_CLAVE || randomBytes(9).toString('base64url');
  const { espacioId } = await sembrar(clave);
  console.log('Datos de demostración creados.');
  console.log(`  Docente:     docente${DOMINIO}`);
  console.log(`  Estudiantes: estudiante1${DOMINIO} … estudiante${ESTUDIANTES.length}${DOMINIO}`);
  console.log(`  Aula:        "Aula de demostración" (espacio ${espacioId}), asignatura ${CODIGO}`);
  console.log(generada ? `  Clave de todas las cuentas (generada): ${clave}` : '  Clave de todas las cuentas: la de DEMO_CLAVE');
}

main()
  .catch((err) => {
    console.error('No se pudieron sembrar los datos de demostración:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
