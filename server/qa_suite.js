// Suite de regresion QA: corre contra un backend real y una base con los datos
// semilla de las migraciones. Se ejecuta en CI en cada pull request y en local
// con `npm run test:qa` (backend levantado en BACKEND_URL).
import pg from 'pg';
import { io } from 'socket.io-client';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/metaverso_upds';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

// Debe coincidir con el umbral de /api/auth/login en src/index.ts
const INTENTOS_ANTES_DE_BLOQUEO = 5;

const ESTUDIANTE = { email: 'ana.rojas@upds.edu.bo', password: '123456' };
const ADMIN = { email: 'admin@upds.edu.bo', password: '123456' };
const DOCENTE = { email: 'docente.isw@upds.edu.bo', password: '123456' };
const ESTUDIANTE_2 = { email: 'maria.flores@upds.edu.bo', password: '123456' };
const ESTUDIANTE_3 = { email: 'luis.garcia@upds.edu.bo', password: '123456' };
// Segundo docente, creado por la propia suite la primera vez que corre
const DOCENTE_2 = { email: 'docente2.qa@upds.edu.bo', password: '123456' };

const pool = new pg.Pool({ connectionString: DATABASE_URL });

// Cada corrida se presenta con su propia IP (el backend confia en
// X-Forwarded-For desde loopback): corridas seguidas no comparten cupo de
// limites de tasa, y de paso se prueba que req.ip sale del proxy.
const ipAleatoria = () =>
  `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 254)}`;
const IP_CORRIDA = ipAleatoria();

// Clave incorrecta generada en cada corrida: un literal lo marcan los
// escaneres de secretos del repositorio.
const CLAVE_INCORRECTA = `incorrecta-${Math.random().toString(36).slice(2)}`;

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

function api(path, { method = 'GET', token, body, ip = IP_CORRIDA } = {}) {
  const headers = { 'X-Forwarded-For': ip };
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

// ---------------------------------------------------------------------------
// Utilidades de WebSocket
// ---------------------------------------------------------------------------
const socketsAbiertos = [];

// Resuelve con el socket conectado, o rechaza con el mensaje del connect_error.
function conectar(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BACKEND_URL, {
      auth: token === undefined ? {} : { token },
      // Solo polling: el upgrade a websocket choca hoy con el PeerServer montado
      // en el mismo servidor HTTP, y los navegadores terminan en polling igual.
      transports: ['polling'],
      reconnection: false,
      forceNew: true
    });
    socketsAbiertos.push(socket);
    const timer = setTimeout(() => reject(new Error('TIMEOUT')), 5000);
    socket.once('connect', () => { clearTimeout(timer); resolve(socket); });
    socket.once('connect_error', err => { clearTimeout(timer); reject(err); });
  });
}

// Resuelve con el payload del evento, o con null si no llega a tiempo.
function esperarEvento(socket, evento, ms = 1500, filtro = () => true) {
  return new Promise(resolve => {
    const handler = data => {
      if (!filtro(data)) return;
      clearTimeout(timer);
      socket.off(evento, handler);
      resolve(data);
    };
    const timer = setTimeout(() => { socket.off(evento, handler); resolve(null); }, ms);
    socket.on(evento, handler);
  });
}

async function entrar(socket, espacioId, extra = {}) {
  const ack = Promise.race([
    esperarEvento(socket, 'space_users', 3000).then(d => d && { ok: true }),
    esperarEvento(socket, 'join_rechazado', 3000).then(d => d && { ok: false, ...d })
  ]);
  socket.emit('join_space', { espacioId, ...extra });
  return (await ack) || { ok: false, motivo: 'sin respuesta' };
}

async function tokenDe(credenciales) {
  const res = await login(credenciales);
  const data = await res.json();
  if (!data.token) throw new Error(`No se pudo iniciar sesión como ${credenciales.email}`);
  return { token: data.token, id: data.user.id };
}

async function esperarFila(sql, params, ms = 3000) {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    const { rows } = await pool.query(sql, params);
    if (rows.length > 0) return rows;
    await new Promise(r => setTimeout(r, 100));
  }
  return [];
}

// Deja el aula piloto con una sesion en curso y sin asistencias de los
// estudiantes que usa la prueba, para que el registro sea observable.
async function prepararAula() {
  const { rows } = await pool.query(
    "SELECT id FROM espacios WHERE tipo = 'aula' AND nombre = 'Aula Ingenieria de Software'"
  );
  const aulaId = rows[0].id;
  const { rows: otra } = await pool.query(
    "SELECT id FROM espacios WHERE tipo = 'aula' AND id <> $1 ORDER BY id LIMIT 1", [aulaId]
  );
  const { rows: campus } = await pool.query("SELECT id FROM espacios WHERE tipo = 'campus' LIMIT 1");

  const enCurso = await pool.query(
    "SELECT id FROM sesiones_clase WHERE espacio_id = $1 AND estado = 'en_curso'", [aulaId]
  );
  if (enCurso.rows.length === 0) {
    await pool.query(
      `INSERT INTO sesiones_clase (espacio_id, docente_id, tema, inicio_programado, fin_programado, inicio_real, estado)
       SELECT $1, u.id, 'Sesion QA', NOW(), NOW() + INTERVAL '90 minutes', NOW(), 'en_curso'
       FROM usuarios u WHERE u.email = $2`,
      [aulaId, DOCENTE.email]
    );
  }
  await pool.query(
    `DELETE FROM asistencias WHERE usuario_id IN (SELECT id FROM usuarios WHERE email = ANY($1))
       AND sesion_id IN (SELECT id FROM sesiones_clase WHERE espacio_id = $2)`,
    [[ESTUDIANTE.email, ESTUDIANTE_2.email], aulaId]
  );
  return { aulaId, otraAulaId: otra[0].id, campusId: campus[0].id };
}

async function asistenciasEnAula(usuarioId, aulaId) {
  const { rows } = await pool.query(
    `SELECT a.id FROM asistencias a JOIN sesiones_clase s ON s.id = a.sesion_id
     WHERE a.usuario_id = $1 AND s.espacio_id = $2`,
    [usuarioId, aulaId]
  );
  return rows.length;
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

  // ---------------------------------------------------------------------------
  // Pilar 5: WebSocket - identidad derivada del token (SEC-01)
  // ---------------------------------------------------------------------------
  console.log('\n=== PILAR 5: WebSocket ===');

  const { aulaId, otraAulaId, campusId } = await prepararAula();
  const docente = await tokenDe(DOCENTE);
  const ana = await tokenDe(ESTUDIANTE);
  const maria = await tokenDe(ESTUDIANTE_2);

  await caso('Socket sin token es rechazado en el handshake', async () => {
    try { await conectar(undefined); return false; } catch (err) { return err.message === 'NO_AUTORIZADO'; }
  });

  await caso('Socket con token manipulado es rechazado en el handshake', async () => {
    try { await conectar(`${ana.token}x`); return false; } catch (err) { return err.message === 'NO_AUTORIZADO'; }
  });

  await caso('Socket de un usuario desactivado es rechazado aunque su token no haya vencido', async () => {
    const luis = await tokenDe(ESTUDIANTE_3);
    await pool.query('UPDATE usuarios SET activo = FALSE WHERE id = $1', [luis.id]);
    try { await conectar(luis.token); return false; }
    catch (err) { return err.message === 'NO_AUTORIZADO'; }
    finally { await pool.query('UPDATE usuarios SET activo = TRUE WHERE id = $1', [luis.id]); }
  });

  const sDocente = await conectar(docente.token);
  await entrar(sDocente, aulaId);
  const sMaria = await conectar(maria.token);
  await entrar(sMaria, otraAulaId);
  const sAna = await conectar(ana.token);

  await caso('join_space con user.id falsificado anuncia al usuario del token, no al suplantado', async () => {
    const anuncio = esperarEvento(sDocente, 'user_joined', 3000);
    const r = await entrar(sAna, aulaId, {
      espacioTipo: 'campus',
      user: { id: maria.id, nombreVisible: 'Maria F.', peerId: '' }
    });
    const data = await anuncio;
    return r.ok && data?.user?.userId === ana.id && data.user.nombreVisible !== 'Maria F.';
  });

  await caso('La asistencia se registra solo para el usuario del token', async () => {
    const filas = await esperarFila(
      `SELECT a.id FROM asistencias a JOIN sesiones_clase s ON s.id = a.sesion_id
       WHERE a.usuario_id = $1 AND s.espacio_id = $2`,
      [ana.id, aulaId]
    );
    return filas.length === 1 && (await asistenciasEnAula(maria.id, aulaId)) === 0;
  });

  await caso('Un invitado no puede unirse a un aula (solo al campus)', async () => {
    const res = await api('/api/auth/guest', { method: 'POST' });
    const { token } = await res.json();
    const sInvitado = await conectar(token);
    const aula = await entrar(sInvitado, aulaId);
    const campus = await entrar(sInvitado, campusId);
    return !aula.ok && campus.ok;
  });

  await caso('El chat usa el nombre del token como remitente', async () => {
    const recibido = esperarEvento(sDocente, 'chat_message', 2000);
    sAna.emit('send_chat', { espacioId: aulaId, message: { sender: 'Ing. Mendoza', text: 'hola QA' } });
    const msg = await recibido;
    return msg?.text === 'hola QA' && msg.sender !== 'Ing. Mendoza';
  });

  await caso('Un trazo dirigido a otra aula queda en la sala del emisor', async () => {
    const enOtra = esperarEvento(sMaria, 'stroke_received', 800);
    const enPropia = esperarEvento(sDocente, 'stroke_received', 800);
    sAna.emit('draw_stroke', { espacioId: otraAulaId, stroke: { puntos: [[0, 0]], qa: true } });
    const [otra, propia] = await Promise.all([enOtra, enPropia]);
    return otra === null && propia?.qa === true;
  });

  await caso('Un estudiante no puede anunciar el inicio de una clase', async () => {
    const recibido = esperarEvento(sDocente, 'clase_iniciada', 800, s => s?.qa === 'estudiante');
    sAna.emit('clase_iniciada', { qa: 'estudiante', espacio_id: aulaId });
    return (await recibido) === null;
  });

  await caso('Un docente sí puede anunciar el inicio de una clase', async () => {
    const recibido = esperarEvento(sAna, 'clase_iniciada', 1500, s => s?.qa === 'docente');
    sDocente.emit('clase_iniciada', { qa: 'docente', espacio_id: aulaId });
    return (await recibido) !== null;
  });

  // ---------------------------------------------------------------------------
  // Pilar 6: Roles y sesiones de clase (SEC-06)
  // ---------------------------------------------------------------------------
  console.log('\n=== PILAR 6: Roles y sesiones de clase ===');

  await api('/api/auth/register', {
    method: 'POST',
    body: { ...DOCENTE_2, nombre: 'Docente', apellido: 'QA', rol: 'docente' }
  }); // 409 en corridas posteriores: ya existe
  const docente2 = await tokenDe(DOCENTE_2);

  const curso = (token, body) => api('/api/clases/crear-curso', { method: 'POST', token, body });
  const docenteDeAsignatura = async codigo =>
    (await pool.query('SELECT docente_id FROM asignaturas WHERE codigo = $1', [codigo])).rows[0]?.docente_id;

  await caso('Un estudiante no puede crear curso ni iniciar clase (403)', async () => {
    const res = await curso(ana.token, { espacio_id: aulaId, nombre_curso: 'X', codigo_curso: 'QA-X', tema: 't' });
    return res.status === 403;
  });

  await caso('Un invitado recibe 403 (no 500) en rutas con rol', async () => {
    const { token } = await (await api('/api/auth/guest', { method: 'POST' })).json();
    const res = await curso(token, { espacio_id: aulaId, nombre_curso: 'X', codigo_curso: 'QA-X', tema: 't' });
    return res.status === 403;
  });

  await caso('No se puede iniciar clase en el campus', async () => {
    const res = await curso(docente.token, { espacio_id: campusId, nombre_curso: 'X', codigo_curso: 'QA-X', tema: 't' });
    return res.status === 400;
  });

  await caso('El docente titular inicia clase en su aula con su asignatura', async () => {
    const res = await curso(docente.token, {
      espacio_id: otraAulaId, nombre_curso: 'Base de Datos I', codigo_curso: 'BD-101', tema: 'Clase QA'
    });
    return res.status === 201;
  });

  await caso('Otro docente no puede apropiarse de una asignatura ajena por su código', async () => {
    const res = await curso(docente2.token, {
      espacio_id: otraAulaId, nombre_curso: 'Robada', codigo_curso: 'ISW-501', tema: 't'
    });
    return res.status === 403 && (await docenteDeAsignatura('ISW-501')) === docente.id;
  });

  await caso('Otro docente no puede interrumpir una clase en curso ajena', async () => {
    const res = await curso(docente2.token, {
      espacio_id: otraAulaId, nombre_curso: 'Curso QA 2', codigo_curso: 'QA-D2', tema: 't'
    });
    const { rows } = await pool.query(
      "SELECT docente_id FROM sesiones_clase WHERE espacio_id = $1 AND estado = 'en_curso'", [otraAulaId]
    );
    return res.status === 409 && rows.length === 1 && rows[0].docente_id === docente.id;
  });

  await caso('POST /api/sesiones rechaza una segunda sesión activa en la misma aula (409)', async () => {
    const res = await api('/api/sesiones', { method: 'POST', token: docente.token, body: { espacio_id: aulaId, tema: 'dup' } });
    return res.status === 409;
  });

  await caso('POST /api/sesiones exige rol docente (403 a estudiante)', async () => {
    const res = await api('/api/sesiones', { method: 'POST', token: ana.token, body: { espacio_id: aulaId, tema: 'x' } });
    return res.status === 403;
  });

  await caso('Un docente solo lista sus propias sesiones', async () => {
    const res = await api('/api/sesiones', { token: docente2.token });
    const data = await res.json();
    return res.status === 200 && Array.isArray(data) && data.every(s => s.docente_nombre === 'Docente');
  });

  // ---------------------------------------------------------------------------
  // Pilar 7: Limites de tasa (SEC-04)
  // ---------------------------------------------------------------------------
  console.log('\n=== PILAR 7: Límites de tasa ===');

  await caso('La bitácora registra la IP del cliente, no la del proxy', async () => {
    const ip = ipAleatoria();
    await api('/api/auth/login', { method: 'POST', ip, body: { email: ESTUDIANTE_3.email, password: CLAVE_INCORRECTA } });
    const { rows } = await pool.query(
      "SELECT ip FROM bitacora WHERE evento = 'login_fallido' ORDER BY id DESC LIMIT 1"
    );
    await desbloquear(ESTUDIANTE_3.email);
    return rows[0]?.ip === ip;
  });

  await caso('Tras 50 inicios de sesión fallidos desde una IP, el 51º recibe 429', async () => {
    const ip = ipAleatoria();
    const cuerpo = { email: 'no-existe.qa@upds.edu.bo', password: CLAVE_INCORRECTA };
    for (let i = 0; i < 50; i++) {
      const r = await api('/api/auth/login', { method: 'POST', ip, body: cuerpo });
      if (r.status !== 401) return false;
    }
    const res = await api('/api/auth/login', { method: 'POST', ip, body: cuerpo });
    // Otra IP no se ve afectada
    const otra = await api('/api/auth/login', { method: 'POST', ip: ipAleatoria(), body: cuerpo });
    return res.status === 429 && otra.status === 401;
  });

  await caso('Los inicios de sesión exitosos no consumen el cupo', async () => {
    const ip = ipAleatoria();
    for (let i = 0; i < 55; i++) {
      const r = await api('/api/auth/login', { method: 'POST', ip, body: ESTUDIANTE_3 });
      if (r.status !== 200) return false;
    }
    return true;
  });

  await caso('Tras 50 registros desde una IP, el 51º recibe 429', async () => {
    const ip = ipAleatoria();
    for (let i = 0; i < 50; i++) {
      await api('/api/auth/register', { method: 'POST', ip, body: {} });
    }
    const res = await api('/api/auth/register', { method: 'POST', ip, body: {} });
    return res.status === 429;
  });

  await caso('Un socket que inunda el chat solo difunde 10 mensajes por ventana', async () => {
    const luis = await tokenDe(ESTUDIANTE_3);
    const sLuis = await conectar(luis.token);
    await entrar(sLuis, aulaId);
    let recibidos = 0;
    const contar = m => { if (m?.text?.startsWith('flood-')) recibidos++; };
    sDocente.on('chat_message', contar);
    for (let i = 0; i < 25; i++) sLuis.emit('send_chat', { message: { text: `flood-${i}` } });
    await new Promise(r => setTimeout(r, 1500));
    sDocente.off('chat_message', contar);
    return recibidos === 10;
  });

  // ---------------------------------------------------------------------------
  // Pilar 8: CORS (SEC-03)
  // ---------------------------------------------------------------------------
  console.log('\n=== PILAR 8: CORS ===');

  const ORIGEN_AJENO = 'https://sitio-ajeno.qa.example';
  const ORIGEN_PERMITIDO = (process.env.CORS_ORIGINS || '').split(',')[0].trim();
  const preflight = origen => fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'OPTIONS',
    headers: { Origin: origen, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' }
  });

  await caso('Un origen ajeno no recibe permiso CORS en la API', async () => {
    const res = await preflight(ORIGEN_AJENO);
    const simple = await fetch(`${BACKEND_URL}/api/ice-servers`, { headers: { Origin: ORIGEN_AJENO } });
    return !res.headers.get('access-control-allow-origin') && !simple.headers.get('access-control-allow-origin');
  });

  await caso('Un origen ajeno no recibe permiso CORS en Socket.io', async () => {
    const res = await fetch(`${BACKEND_URL}/socket.io/?EIO=4&transport=polling`, { headers: { Origin: ORIGEN_AJENO } });
    const acao = res.headers.get('access-control-allow-origin');
    return acao !== '*' && acao !== ORIGEN_AJENO;
  });

  if (ORIGEN_PERMITIDO) {
    await caso('Un origen listado en CORS_ORIGINS sí recibe permiso', async () => {
      const res = await preflight(ORIGEN_PERMITIDO);
      return res.headers.get('access-control-allow-origin') === ORIGEN_PERMITIDO;
    });
  }

  // ---------------------------------------------------------------------------
  // Pilar 9: Saneamiento del chat (SEC-05)
  // ---------------------------------------------------------------------------
  console.log('\n=== PILAR 9: Saneamiento del chat ===');

  // Envia desde Ana y devuelve [rechazo, recibidoPorElDocente]
  const chatear = async message => {
    const rechazo = esperarEvento(sAna, 'chat_rechazado', 800);
    const recibido = esperarEvento(sDocente, 'chat_message', 800);
    sAna.emit('send_chat', { message });
    return Promise.all([rechazo, recibido]);
  };

  await caso('Un mensaje de más de 500 caracteres se rechaza y no se difunde', async () => {
    const [rechazo, recibido] = await chatear({ text: 'a'.repeat(501) });
    return rechazo !== null && recibido === null;
  });

  await caso('Un mensaje vacío o de solo espacios se rechaza', async () => {
    const [rechazo, recibido] = await chatear({ text: '   \n\t ' });
    return rechazo !== null && recibido === null;
  });

  await caso('Un texto que no es string se rechaza sin tumbar el socket', async () => {
    const [rechazo] = await chatear({ text: { $gt: '' } });
    return rechazo !== null && sAna.connected;
  });

  await caso('Se eliminan caracteres invisibles y de control bidi', async () => {
    const [, recibido] = await chatear({ text: 'ho\u200Bla\u202E qa\u0007' });
    return recibido?.text === 'hola qa';
  });

  await caso('Solo se difunden sender, text y enviadoEn (sin campos extra del cliente)', async () => {
    const [, recibido] = await chatear({ text: 'campos', html: '<img src=x onerror=alert(1)>', rol: 'administrador' });
    return recibido !== null && Object.keys(recibido).sort().join(',') === 'enviadoEn,sender,text';
  });

  for (const s of socketsAbiertos) s.disconnect();

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
