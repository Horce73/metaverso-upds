// Mide el costo de dibujar la escena 3D (3D-02/3D-05) en un navegador real:
// llamadas de dibujo por cuadro, texturas creadas en GPU y tiempo de script
// del hilo principal, mientras N-1 participantes simulados (sockets crudos,
// sin navegador) caminan sin parar por el mismo espacio.
//
// Por defecto Chromium headless usa la GPU real vía ANGLE/EGL (en esta
// laptop, la Intel UHD integrada: buena referencia de un equipo modesto).
// Sin esos flags cae a SwiftShader y dibuja a 1-2 FPS, que no sirve para
// comparar. CHROME_ARGS los reemplaza; la salida imprime qué GPU se usó.
//
// Uso:
//   npm run carga:render -- --espacio aula --id 2 --n 30
//   npm run carga:render -- --espacio campus --n 30 --ventana 10
//   npm run carga:render -- --calidad baja
//   CHROME_PATH=/ruta/a/chrome npm run carga:render
import { chromium } from 'playwright-core';
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const CHROME_ARGS = (process.env.CHROME_ARGS || '--use-angle=gl-egl --ignore-gpu-blocklist --enable-gpu').split(' ').filter(Boolean);

const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > -1 ? process.argv[i + 1] : porDefecto;
};
const N = Number(arg('n', '30'));
const VENTANA_S = Number(arg('ventana', '10'));
const TIPO_ESPACIO = arg('espacio', 'aula');
const ID_ESPACIO = arg('id', TIPO_ESPACIO === 'aula' ? '2' : undefined);
const TASA_MOVE_MS = 33;
// Fija el nivel de calidad de arranque (3D-05); sin esto lo elige la app.
const CALIDAD = arg('calidad', undefined);

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function loginInvitado() {
  const res = await fetch(`${BACKEND_URL}/api/auth/guest`, { method: 'POST' });
  if (!res.ok) throw new Error(`guest login fallo: ${res.status}`);
  return res.json();
}

// El aula no admite invitados: ahí cada participante es un usuario
// registrado desechable con clave aleatoria de esta corrida (igual que
// pruebas/carga-voz/spike.mjs). IP distinta por pedido para no chocar con
// los límites de registro y login.
const ipAleatoria = () => `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
async function loginRegistrado() {
  const email = `carga.render.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}@upds.edu.bo`;
  const clave = randomUUID();
  const pedir = (ruta, body) =>
    fetch(`${BACKEND_URL}${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ipAleatoria() },
      body: JSON.stringify(body),
    });
  const reg = await pedir('/api/auth/register', { email, password: clave, nombre: 'Carga', apellido: 'render', rol: 'estudiante', acepta_terminos: true });
  if (!reg.ok) throw new Error(`registro respondió ${reg.status}`);
  const login = await pedir('/api/auth/login', { email, password: clave });
  if (!login.ok) throw new Error(`login respondió ${login.status}`);
  return login.json();
}
const login = () => (TIPO_ESPACIO === 'aula' ? loginRegistrado() : loginInvitado());

async function obtenerEspacio(token) {
  const res = await fetch(`${BACKEND_URL}/api/espacios`, { headers: { Authorization: `Bearer ${token}` } });
  const espacios = await res.json();
  const lista = Array.isArray(espacios) ? espacios : espacios.espacios || [];
  const espacio = lista.find((e) => (ID_ESPACIO ? String(e.id) === ID_ESPACIO : e.tipo === TIPO_ESPACIO));
  if (espacio) return espacio;
  // /api/espacios no lista las aulas a un invitado; la app igual entra si el
  // espacio activo ya está en sessionStorage, así que alcanza con el id.
  if (ID_ESPACIO) return { id: Number(ID_ESPACIO), nombre: `Espacio ${ID_ESPACIO}`, tipo: TIPO_ESPACIO };
  throw new Error(`no se encontro un espacio tipo ${TIPO_ESPACIO} (pasar --id)`);
}

function conectar(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BACKEND_URL, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
    const timer = setTimeout(() => reject(new Error('timeout de conexion')), 8000);
    socket.once('connect', () => { clearTimeout(timer); resolve(socket); });
    socket.once('connect_error', (err) => { clearTimeout(timer); reject(err); });
  });
}

// Se inyecta antes de que cargue la app: cuenta llamadas de dibujo y
// texturas en el contexto WebGL, y cuadros por requestAnimationFrame.
function instrumentarWebGL() {
  const c = { dibujos: 0, texturasCreadas: 0, texturasBorradas: 0, cuadros: 0 };
  window.__render = c;
  const envolver = (proto) => {
    if (!proto) return;
    for (const m of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const orig = proto[m];
      if (orig) proto[m] = function (...a) { c.dibujos++; return orig.apply(this, a); };
    }
    const crear = proto.createTexture;
    proto.createTexture = function (...a) { c.texturasCreadas++; return crear.apply(this, a); };
    const borrar = proto.deleteTexture;
    proto.deleteTexture = function (...a) { c.texturasBorradas++; return borrar.apply(this, a); };
  };
  envolver(window.WebGL2RenderingContext?.prototype);
  envolver(window.WebGLRenderingContext?.prototype);
  const tick = () => { c.cuadros++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

async function main() {
  console.log(`Midiendo render en ${TIPO_ESPACIO} con N=${N} (1 navegador + ${N - 1} simulados), ventana=${VENTANA_S}s`);
  const local = await login();
  const espacio = await obtenerEspacio(local.token);

  const bots = [];
  for (let i = 0; i < N - 1; i++) {
    const { token } = await login();
    const socket = await conectar(token);
    await new Promise((resolve, reject) => {
      socket.once('join_rechazado', (d) => reject(new Error(`join rechazado: ${d?.motivo}`)));
      socket.once('space_users', resolve);
      socket.once('current_users', resolve);
      socket.emit('join_space', {
        espacioId: espacio.id,
        espacioTipo: espacio.tipo,
        user: { id: null, nombreVisible: `bot_${i}`, peerId: '', apariencia: {} },
      });
    });
    // Repartidos alrededor del origen, dentro del radio de relevancia del
    // campus (3D-04) para que el navegador los reciba a todos.
    bots.push({ socket, x: (i % 6) * 2.5 - 6, z: Math.floor(i / 6) * 2.5 - 4, fase: i });
  }

  const browser = await chromium.launch({ executablePath: CHROME_PATH, args: CHROME_ARGS });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(instrumentarWebGL);
  await page.addInitScript(([l, e, c]) => {
    localStorage.setItem('token', l.token);
    localStorage.setItem('user', JSON.stringify(l.user));
    if (l.avatar) localStorage.setItem('avatar', JSON.stringify(l.avatar));
    sessionStorage.setItem('espacioActivo', JSON.stringify(e));
    if (c) localStorage.setItem('calidadGrafica', c);
  }, [local, espacio, CALIDAD]);
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));

  await page.goto(`${APP_URL}/#/metaverso`);
  await page.waitForSelector('canvas', { timeout: 30000 });
  const gpu = await page.evaluate(() => {
    const g = document.createElement('canvas').getContext('webgl2');
    const e = g?.getExtension('WEBGL_debug_renderer_info');
    return g ? (e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER)) : 'sin WebGL';
  });
  console.log(`Escena montada en el navegador. GPU: ${gpu}`);

  let moviendo = true;
  const t0 = Date.now();
  const timers = bots.map((b) => setInterval(() => {
    if (!moviendo) return;
    const t = (Date.now() - t0) / 1000 + b.fase;
    b.socket.emit('move', {
      position: [b.x + Math.sin(t) * 1.5, 0, b.z + Math.cos(t) * 1.5],
      rotation: [0, t % (Math.PI * 2), 0],
      estaSentado: false,
      t: Date.now() - t0,
    });
  }, TASA_MOVE_MS));

  await esperar(6000); // escena cargada y avatares remotos montados
  if (process.env.CAPTURA) await page.screenshot({ path: process.env.CAPTURA });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const metricas = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const antesCdp = await metricas();
  const antes = await page.evaluate(() => ({ ...window.__render }));
  await esperar(VENTANA_S * 1000);
  const despues = await page.evaluate(() => ({ ...window.__render }));
  const despuesCdp = await metricas();

  moviendo = false;
  timers.forEach(clearInterval);

  const cuadros = despues.cuadros - antes.cuadros;
  const dibujos = despues.dibujos - antes.dibujos;
  const texturas = despues.texturasCreadas - antes.texturasCreadas;
  const script = (despuesCdp.ScriptDuration - antesCdp.ScriptDuration) * 1000;
  const tareas = (despuesCdp.TaskDuration - antesCdp.TaskDuration) * 1000;

  console.log('');
  console.log('=== RESULTADO ===');
  console.log(`Cuadros en la ventana:            ${cuadros} (${(cuadros / VENTANA_S).toFixed(1)} FPS)`);
  console.log(`Llamadas de dibujo por cuadro:    ${cuadros ? (dibujos / cuadros).toFixed(0) : '-'}`);
  console.log(`Texturas creadas por segundo:     ${(texturas / VENTANA_S).toFixed(1)}`);
  console.log(`Texturas vivas al final:          ${despues.texturasCreadas - despues.texturasBorradas}`);
  console.log(`Script en hilo principal:         ${(script / VENTANA_S).toFixed(0)} ms por segundo`);
  console.log(`Tareas en hilo principal:         ${(tareas / VENTANA_S).toFixed(0)} ms por segundo`);
  console.log(`Script por cuadro:                ${cuadros ? (script / cuadros).toFixed(1) : '-'} ms`);
  const nivel = await page.evaluate(() => localStorage.getItem('calidadGrafica'));
  console.log(`Nivel de calidad al final:        ${nivel ?? '(el de arranque, sin cambios)'}`);
  if (errores.length) console.log(`Errores de página: ${errores.slice(0, 3).join(' | ')}`);

  await browser.close();
  bots.forEach((b) => b.socket.disconnect());
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
