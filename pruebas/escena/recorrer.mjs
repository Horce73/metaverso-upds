// Recorre el campus en un navegador real y saca capturas o mide la escena.
// Necesita la demo sembrada (docs/demo.md) y su clave en DEMO_CLAVE.
//
//   DEMO_CLAVE=… node pruebas/escena/recorrer.mjs <salida> <x,z,giro|-> pasos…
//
// Pasos: foto:nombre · w|a|s|d:ms · girar:dx,dy · clic:texto · esperar:ms
//        fps (cuadros por segundo en 4 s) · info:etiqueta (renderer.info)
// MOVIL=1 emula un Pixel 7; CALIDAD=alta|media|baja (por defecto alta);
// CHROMIUM=ruta al ejecutable si playwright-core no encuentra el suyo.
import { chromium, devices } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const [, , salida = 'capturas', posArg = '-', ...pasos] = process.argv;
const base = process.env.BASE_URL || 'http://localhost:5173';
const clave = process.env.DEMO_CLAVE;
if (!clave) throw new Error('Falta DEMO_CLAVE (la clave con la que se sembró la demo)');
mkdirSync(salida, { recursive: true });

const [px, pz, giro] = posArg.split(',').map(Number);
const ultima = posArg !== '-' ? { position: [px, 0, pz], rotation: [0, giro, 0] } : null;
const cabeceras = (token) => ({
  'Content-Type': 'application/json',
  'X-Forwarded-For': `10.9.${Math.floor(Math.random() * 250)}.3`,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});
const login = await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: cabeceras(), body: JSON.stringify({ email: 'docente@demo.local', password: clave }) })).json();
if (!login.token) throw new Error(`No se pudo entrar como docente@demo.local: ${JSON.stringify(login)}`);
const espacios = await (await fetch(`${base}/api/espacios`, { headers: cabeceras(login.token) })).json();
// ESPACIO=nombre para empezar en otro espacio (un aula, por ejemplo)
const campus = espacios.find((e) => e.nombre === (process.env.ESPACIO || 'Campus Central UPDS')) ?? espacios.find((e) => e.tipo === 'campus');

const navegador = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  // GPU real: sin esto Chromium dibuja por software a 1-2 FPS
  args: ['--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const contexto = await navegador.newContext(process.env.MOVIL ? { ...devices['Pixel 7'] } : { viewport: { width: 1280, height: 720 } });
await contexto.addInitScript(
  ([token, user, avatar, espacio, calidad]) => {
    if (sessionStorage.getItem('recorrer')) return;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('avatar', JSON.stringify(avatar));
    localStorage.setItem('calidadGrafica', calidad);
    sessionStorage.setItem('espacioActivo', JSON.stringify(espacio));
    sessionStorage.setItem('recorrer', '1');
  },
  [login.token, login.user, { ...login.avatar, ultima_posicion: ultima }, campus, process.env.CALIDAD || 'alta']
);
// three.js avisa a las devtools cada renderer que crea: así se lee renderer.info
await contexto.addInitScript(() => {
  const devtools = new EventTarget();
  devtools.addEventListener('observe', (e) => {
    if (e.detail?.isWebGLRenderer) window.__renderers = [...(window.__renderers || []), e.detail];
    if (e.detail?.isScene) window.__escenas = [...(window.__escenas || []), e.detail];
  });
  window.__THREE_DEVTOOLS__ = devtools;
});

const pagina = await contexto.newPage();
const errores = [];
pagina.on('pageerror', (e) => errores.push(e.message));
pagina.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errores.push(`${m.type()}: ${m.text()}`));
await pagina.goto(`${base}/#/metaverso`);
await pagina.waitForTimeout(8000);
// Al docente que entra a un aula sin clase le aparece el modal de crear curso
if (await pagina.locator('#titulo-crear-curso').count()) await pagina.getByLabel('Cerrar').first().click();
const ocultar = pagina.getByLabel('Ocultar panel');
if (await ocultar.count()) await ocultar.click();

let n = 0;
for (const paso of pasos) {
  const [accion, valor = ''] = paso.split(/:(.*)/s);
  if (accion === 'foto') {
    await pagina.waitForTimeout(600);
    await pagina.screenshot({ path: `${salida}/${String(n++).padStart(2, '0')}-${valor}.png` });
  } else if (['w', 'a', 's', 'd'].includes(accion)) {
    await pagina.keyboard.down(`Key${accion.toUpperCase()}`);
    await pagina.waitForTimeout(Number(valor));
    await pagina.keyboard.up(`Key${accion.toUpperCase()}`);
  } else if (accion === 'girar') {
    const [dx, dy] = valor.split(',').map(Number);
    await pagina.mouse.move(640, 400);
    await pagina.mouse.down();
    await pagina.mouse.move(640 + dx, 400 + dy, { steps: 10 });
    await pagina.mouse.up();
  } else if (accion === 'clic') {
    await pagina.getByText(valor).first().click();
  } else if (accion === 'esperar') {
    await pagina.waitForTimeout(Number(valor));
  } else if (accion === 'fps') {
    const fps = await pagina.evaluate(
      () =>
        new Promise((listo) => {
          let cuadros = 0;
          const inicio = performance.now();
          const contar = () => (++cuadros, performance.now() - inicio < 4000 ? requestAnimationFrame(contar) : listo(cuadros / 4));
          requestAnimationFrame(contar);
        })
    );
    console.log(`FPS ${fps.toFixed(1)}`);
  } else if (accion === 'mallas') {
    // Mallas visibles agrupadas por tipo de geometría y material: qué se dibuja por separado
    const resumen = await pagina.evaluate(() => {
      const escena = (window.__escenas || []).at(-1);
      const cuenta = {};
      escena?.traverseVisible((o) => {
        if (!o.isMesh && !o.isSprite) return;
        const clave = `${o.type}:${o.geometry?.type}:${Array.isArray(o.material) ? 'multi' : o.material?.type}${o.material?.vertexColors ? '+vc' : ''}${o.material?.transparent ? '+tr' : ''}`;
        cuenta[clave] = (cuenta[clave] || 0) + 1;
      });
      return Object.entries(cuenta).sort((a, b) => b[1] - a[1]).slice(0, 15);
    });
    console.log(`MALLAS ${valor}`, JSON.stringify(resumen));
  } else if (accion === 'sueltas') {
    // Piezas de avatar visibles sin fusionar: de qué tipo de padre cuelgan
    const r = await pagina.evaluate(() => {
      const escena = (window.__escenas || []).at(-1);
      const filas = [];
      escena?.traverseVisible((o) => {
        if (!o.isMesh || o.geometry?.type !== 'IcosahedronGeometry') return;
        let p = o.parent, cadena = [];
        for (let i = 0; i < 4 && p; i++, p = p.parent) cadena.push(`${p.type}${p.children.length}`);
        filas.push(`${JSON.stringify(o.userData)} ${o.material.color?.getHexString()} ← ${cadena.join(' ← ')}`);
      });
      return filas.slice(0, 12);
    });
    console.log('SUELTAS', r.join('\n'));
  } else if (accion === 'info') {
    const info = await pagina.evaluate(() => {
      // El último renderer creado es el de la escena que está a la vista
      const r = (window.__renderers || []).at(-1);
      return r && {
        dibujos: r.info.render.calls,
        triangulos: r.info.render.triangles,
        geometrias: r.info.memory.geometries,
        texturas: r.info.memory.textures,
        programas: r.info.programs?.length,
      };
    });
    console.log(`INFO ${valor} ${JSON.stringify(info)}`);
  }
}
if (errores.length) console.log('Consola:', errores.slice(0, 10));
await navegador.close();
