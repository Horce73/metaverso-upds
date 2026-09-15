// Suite de regresion QA: corre contra un backend real y una base con los datos
// semilla de las migraciones. Se ejecuta en CI en cada pull request y en local
// con `npm run test:qa` (backend levantado en BACKEND_URL).
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/metaverso_upds';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

// Debe coincidir con el umbral de /api/auth/login en src/index.ts
const INTENTOS_ANTES_DE_BLOQUEO = 5;

const ESTUDIANTE = { email: 'ana.rojas@upds.edu.bo', password: '123456' };
const ADMIN = { email: 'admin@upds.edu.bo', password: '123456' };

const pool = new pg.Pool({ connectionString: DATABASE_URL });

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  🟢 [PASÓ] ${message}`);
    passed++;
  } else {
    console.error(`  🔴 [FALLÓ] ${message}`);
    failed++;
  }
}

// Ejecuta un caso aislando sus excepciones: un fallo de red en un caso no
// debe abortar el resto de la suite.
async function caso(message, fn) {
  try {
    assert(await fn(), message);
  } catch (err) {
    assert(false, `${message}: ${err.message}`);
  }
}

function api(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${BACKEND_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
}

function login(credenciales) {
  return api('/api/auth/login', { method: 'POST', body: credenciales });
}

async function desbloquear(email) {
  await pool.query('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE email = $1', [email]);
}

async function resetTestData() {
  console.log('🔄 Reiniciando datos de prueba en la base de datos...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT id FROM usuarios WHERE email = $1', [ESTUDIANTE.email]);
    if (rows.length === 0) throw new Error(`No existe el usuario semilla ${ESTUDIANTE.email}`);
    const id = rows[0].id;

    await client.query('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1', [id]);
    await client.query(`
      UPDATE datos_personales SET
        documento_identidad = '11223344 CHS',
        fecha_nacimiento = '2003-08-21',
        nacionalidad = 'Boliviana/o',
        genero = 'FEMENINO',
        domicilio = 'CLL. FICTICIA NRO 45',
        tipo_sangre = 'O+',
        estado_civil = 'SOLTERO(A)',
        actualizado_en = NOW()
      WHERE usuario_id = $1
    `, [id]);
    await client.query(
      "DELETE FROM bitacora WHERE usuario_id = $1 AND evento IN ('actualizacion_datos', 'login_ok', 'login_fallido', 'login_bloqueado')",
      [id]
    );
    await client.query('COMMIT');
    console.log('✅ Base de datos lista.');
    return id;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function runTests() {
  const idEstudiante = await resetTestData();
  console.log('\n🚀 Iniciando Suite de Pruebas de QA...\n');

  // ---------------------------------------------------------------------------
  // Pilar 1 y 4: Funcionales y de seguridad - login y bloqueo de cuentas
  // ---------------------------------------------------------------------------
  console.log('=== PILAR 1: Pruebas Funcionales ===');

  await caso('Login exitoso de estudiante retorna token', async () => {
    const res = await login(ESTUDIANTE);
    const data = await res.json();
    return res.status === 200 && Boolean(data.token) && data.user?.rol === 'estudiante';
  });

  await caso('Login sin contraseña retorna 400', async () => {
    const res = await login({ email: ESTUDIANTE.email });
    return res.status === 400;
  });

  await caso('Login con email inexistente retorna 401', async () => {
    const res = await login({ email: 'nadie@upds.edu.bo', password: '123456' });
    return res.status === 401;
  });

  for (let i = 1; i <= INTENTOS_ANTES_DE_BLOQUEO; i++) {
    await caso(`Intento fallido ${i}/${INTENTOS_ANTES_DE_BLOQUEO} retorna 401`, async () => {
      const res = await login({ email: ESTUDIANTE.email, password: 'wrongpassword' });
      return res.status === 401;
    });
  }

  await caso('Tras el umbral la cuenta queda bloqueada (423) incluso con la clave correcta', async () => {
    const res = await login(ESTUDIANTE);
    const data = await res.json();
    return res.status === 423 && data.error.includes('bloqueada');
  });

  await desbloquear(ESTUDIANTE.email);

  let tokenEstudiante = '';
  await caso('Tras desbloquear, el login vuelve a funcionar', async () => {
    const res = await login(ESTUDIANTE);
    const data = await res.json();
    tokenEstudiante = data.token;
    return res.status === 200 && Boolean(data.token);
  });

  await caso('Login como invitado retorna token y rol correcto', async () => {
    const res = await api('/api/auth/guest', { method: 'POST' });
    const data = await res.json();
    return res.status === 200 && Boolean(data.token) && data.user.rol === 'invitado';
  });

  await caso('GET /api/auth/yo con token válido identifica al usuario', async () => {
    const res = await api('/api/auth/yo', { token: tokenEstudiante });
    const data = await res.json();
    return res.status === 200 && JSON.stringify(data).includes(ESTUDIANTE.email);
  });

  // ---------------------------------------------------------------------------
  // Pilar 2 y 3: Integracion y defectos - datos personales
  // ---------------------------------------------------------------------------
  console.log('\n=== PILAR 2 y 3: Pruebas de Integración y Defectos ===');

  await caso('GET datos-personales retorna valores iniciales correctos', async () => {
    const res = await api('/api/usuario/datos-personales', { token: tokenEstudiante });
    const data = await res.json();
    return res.status === 200 && data.documento_identidad === '11223344 CHS';
  });

  await caso('PUT datos-personales parcial mantiene documento_identidad (regresión COALESCE)', async () => {
    const res = await api('/api/usuario/datos-personales', {
      method: 'PUT', token: tokenEstudiante, body: { domicilio: 'CLL. MODIFICADA QA' }
    });
    const data = await res.json();
    return res.status === 200
      && data.datos.domicilio === 'CLL. MODIFICADA QA'
      && data.datos.documento_identidad === '11223344 CHS';
  });

  // ---------------------------------------------------------------------------
  // Pilar 4: Seguridad
  // ---------------------------------------------------------------------------
  console.log('\n=== PILAR 4: Testing de Seguridad ===');

  await caso('Ruta protegida sin token retorna 401', async () => {
    const res = await api('/api/usuario/datos-personales');
    return res.status === 401;
  });

  await caso('Ruta protegida con token manipulado es rechazada', async () => {
    const res = await api('/api/usuario/datos-personales', { token: `${tokenEstudiante}x` });
    return res.status === 401 || res.status === 403;
  });

  await caso('Enviar genero inválido retorna 400', async () => {
    const res = await api('/api/usuario/datos-personales', {
      method: 'PUT', token: tokenEstudiante, body: { genero: 'ALIEN' }
    });
    return res.status === 400;
  });

  await caso('Enviar documento duplicado retorna 409', async () => {
    // '5566778 CHS' pertenece al docente semilla
    const res = await api('/api/usuario/datos-personales', {
      method: 'PUT', token: tokenEstudiante, body: { documento_identidad: '5566778 CHS' }
    });
    return res.status === 409;
  });

  await caso('Estudiante accediendo a bitácora admin retorna 403', async () => {
    const res = await api('/api/admin/bitacora', { token: tokenEstudiante });
    return res.status === 403;
  });

  await caso('Admin consulta la bitácora y ve el evento actualizacion_datos del estudiante', async () => {
    const loginRes = await login(ADMIN);
    const { token } = await loginRes.json();
    const res = await api('/api/admin/bitacora?limit=20', { token });
    const data = await res.json();
    return res.status === 200
      && data.some(b => b.usuario_id === idEstudiante && b.evento === 'actualizacion_datos');
  });

  console.log('\n=== CONCLUSIÓN ===');
  console.log(`Pruebas Totales: ${passed + failed}`);
  console.log(`Pasaron: ${passed}`);
  console.log(`Fallaron: ${failed}`);
}

runTests()
  .catch(err => {
    console.error('❌ La suite no pudo ejecutarse:', err);
    failed++;
  })
  .finally(async () => {
    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  });
