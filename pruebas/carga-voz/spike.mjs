// Prueba de carga de la malla de voz (spike de la Fase 2).
//
// Abre N participantes en Chrome contra un mismo espacio, espera a que la
// malla se complete y mide durante una ventana fija: conexiones logradas,
// ancho de banda por participante, calidad del audio recibido (getStats, vía
// el mismo AudioClient.obtenerDiagnostico() del panel VOZ-05) y CPU.
//
// Requisitos: backend en BACKEND_URL, Vite (`npm run dev`) en APP_URL, Chrome
// instalado y Linux (la CPU se lee de /proc). Uso:
//   npm run carga:voz -- --escenario todos --n 2,4,8,12,16,20,25,30
//   npm run carga:voz -- --escenario uno    (un docente habla, el resto en silencio)
//   --repeticiones 3 --pausa 20   mide cada tamaño 3 veces con 20 s de reposo
//                                 entre medidas y reporta la mediana
//   --paneo equalpower            fuerza ese modelo de paneo en vez de HRTF
//
// Todos los participantes corren en esta máquina, así que el coste total
// crece como N². Cuando el host pasa de ~50 % (hyperthreading, frecuencia que
// baja con la temperatura) la CPU por participante deja de describir a un
// participante y describe al host: esas filas se marcan como saturadas.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';

const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > -1 ? process.argv[i + 1] : porDefecto;
};
const ESCENARIO = arg('escenario', 'todos');
const TAMANOS = arg('n', '2,4,6,8,10,12,15,20,25,30').split(',').map(Number);
const VENTANA_S = Number(arg('ventana', '20'));
const REPETICIONES = Number(arg('repeticiones', '1'));
const PAUSA_S = Number(arg('pausa', '3'));
const PANEO = arg('paneo', '');
const SALIDA = arg('salida', `resultados-${ESCENARIO}${PANEO ? `-${PANEO}` : ''}.json`);
const HOST_SATURADO_PCT = 50;

// Criterios de "audio aceptable", fijados antes de medir. Se exigen en el
// promedio de la ventana y en el peor 5 % de las llamadas (p95).
const CRITERIOS = {
  paresConectadosPct: 99,  // la malla tiene que cerrarse, no casi
  ocultoMedioPct: 2,       // audio reconstruido por paquetes tardíos o perdidos
  ocultoP95Pct: 5,
  jitterP95Ms: 30,
};
const ESPERA_MALLA_MS = 30_000;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const percentil = (valores, p) => {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  return orden[Math.min(orden.length - 1, Math.floor((p / 100) * orden.length))];
};
const media = (valores) => (valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null);
const ipAleatoria = () => `10.${(Math.random() * 256) | 0}.${(Math.random() * 256) | 0}.${1 + ((Math.random() * 254) | 0)}`;

// ---------------------------------------------------------------- CPU (Linux)
const TICKS_POR_S = Number(execFileSync('getconf', ['CLK_TCK']).toString().trim());

function arbolDeProcesos(raiz) {
  const hijos = new Map();
  for (const pid of readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
      if (!hijos.has(ppid)) hijos.set(ppid, []);
      hijos.get(ppid).push(Number(pid));
    } catch { /* el proceso terminó mientras se listaba */ }
  }
  const todos = [];
  const pila = [raiz];
  while (pila.length) {
    const pid = pila.pop();
    todos.push(pid);
    pila.push(...(hijos.get(pid) || []));
  }
  return todos;
}

// Segundos de CPU (usuario + sistema) consumidos por Chrome y sus hijos.
function cpuChrome(pidRaiz) {
  let ticks = 0;
  for (const pid of arbolDeProcesos(pidRaiz)) {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const campos = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      ticks += Number(campos[11]) + Number(campos[12]);
    } catch { /* idem */ }
  }
  return ticks / TICKS_POR_S;
}

// Fracción ocupada de toda la máquina, para saber si el host se saturó y la
// medición deja de describir a los participantes y pasa a describir al host.
function cpuHost() {
  const [, ...campos] = readFileSync('/proc/stat', 'utf8').split('\n')[0].trim().split(/\s+/);
  const n = campos.map(Number);
  const ocioso = n[3] + n[4];
  return { total: n.reduce((a, b) => a + b, 0), ocioso };
}

// ------------------------------------------------------ audio de la captura
// Voz sintetizada en bucle: más parecida al habla real que el pitido que
// Chrome genera por defecto. Si no hay espeak-ng, queda el pitido.
function prepararVoz() {
  const dir = mkdtempSync(join(tmpdir(), 'carga-voz-'));
  const wav = join(dir, 'voz.wav');
  try {
    const texto =
      'Buenos días a todos. Hoy vamos a repasar los requisitos no funcionales del proyecto, ' +
      'empezando por el rendimiento, la disponibilidad y la seguridad. ' +
      'Anoten las preguntas que tengan y las vemos al final de la clase.';
    execFileSync('espeak-ng', ['-v', 'es', '-s', '150', '-w', wav, texto], { stdio: 'ignore' });
    return existsSync(wav) ? wav : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ backend
async function tokenInvitado() {
  const res = await fetch(`${BACKEND_URL}/api/auth/guest`, {
    method: 'POST',
    // Un invitado por IP simulada: el cupo de invitados es por IP
    headers: { 'X-Forwarded-For': ipAleatoria() },
  });
  if (!res.ok) throw new Error(`/api/auth/guest respondió ${res.status}`);
  return (await res.json()).token;
}

async function idCampus(token) {
  const res = await fetch(`${BACKEND_URL}/api/espacios`, { headers: { Authorization: `Bearer ${token}` } });
  const espacios = await res.json();
  const campus = espacios.find((e) => e.tipo === 'campus');
  if (!campus) throw new Error('No hay un espacio de tipo campus activo');
  return campus.id;
}

// ------------------------------------------------------------------- medida
async function medirTamano(browser, pidChrome, n, espacioId) {
  const tokens = await Promise.all(Array.from({ length: n }, tokenInvitado));
  const contexto = await browser.newContext();
  await contexto.grantPermissions(['microphone']);
  const paginas = await Promise.all(tokens.map(() => contexto.newPage()));

  // Todos entran a la vez, como al empezar una clase
  const inicio = Date.now();
  await Promise.all(
    paginas.map((p, i) =>
      p.goto(`${APP_URL}/pruebas/carga-voz/cliente.html?token=${tokens[i]}&espacio=${espacioId}${PANEO ? `&paneo=${PANEO}` : ''}`)
    )
  );

  let mallaMs = null;
  let diagnosticos = [];
  while (Date.now() - inicio < ESPERA_MALLA_MS) {
    await esperar(1000);
    diagnosticos = await Promise.all(paginas.map((p) => p.evaluate(() => (window.carga ? window.carga.medir() : null))));
    if (diagnosticos.every((d) => d && d.conectados === n - 1)) {
      mallaMs = Date.now() - inicio;
      break;
    }
  }

  if (ESCENARIO === 'uno') {
    await Promise.all(paginas.slice(1).map((p) => p.evaluate(() => window.carga.silenciar(true))));
  }

  // Calentamiento, y muestra inicial de la ventana
  await esperar(5000);
  await Promise.all(paginas.map((p) => p.evaluate(() => window.carga.medir())));
  const cpu0 = cpuChrome(pidChrome);
  const host0 = cpuHost();
  const t0 = Date.now();

  await esperar(VENTANA_S * 1000);

  diagnosticos = await Promise.all(paginas.map((p) => p.evaluate(() => window.carga.medir())));
  const segundos = (Date.now() - t0) / 1000;
  const cpuNucleos = (cpuChrome(pidChrome) - cpu0) / segundos;
  const host1 = cpuHost();
  const hostOcupadoPct = 100 * (1 - (host1.ocioso - host0.ocioso) / (host1.total - host0.total));

  await contexto.close();

  const llamadas = diagnosticos.flatMap((d) => d.peers);
  // En el escenario "uno" sólo interesa la calidad con la que llega quien habla
  const conAudio = ESCENARIO === 'uno' ? llamadas.filter((l) => (l.kbpsEntrada ?? 0) > 16) : llamadas;
  const oculto = conAudio.map((l) => l.ocultoPct).filter((v) => v !== null);
  const jitter = conAudio.map((l) => l.jitterMs).filter((v) => v !== null);
  const perdida = conAudio.map((l) => l.perdidaPct).filter((v) => v !== null);
  const subida = diagnosticos.map((d) => d.kbpsSalidaTotal);
  const bajada = diagnosticos.map((d) => d.kbpsEntradaTotal);
  const pares = diagnosticos.reduce((t, d) => t + d.conectados, 0);

  const r = {
    n,
    mallaMs,
    paresConectadosPct: n > 1 ? (100 * pares) / (n * (n - 1)) : 100,
    subidaMediaKbps: media(subida),
    subidaMaxKbps: Math.max(...subida),
    bajadaMediaKbps: media(bajada),
    kbpsPorLlamada: media(llamadas.map((l) => l.kbpsSalida).filter((v) => v !== null)),
    ocultoMedioPct: media(oculto),
    ocultoP95Pct: percentil(oculto, 95),
    perdidaMediaPct: media(perdida),
    jitterP95Ms: percentil(jitter, 95),
    cpuNucleosTotal: cpuNucleos,
    cpuPorParticipantePct: (100 * cpuNucleos) / n,
    hostOcupadoPct,
  };
  r.hostSaturado = r.hostOcupadoPct > HOST_SATURADO_PCT;
  r.aceptable =
    r.paresConectadosPct >= CRITERIOS.paresConectadosPct &&
    (r.ocultoMedioPct ?? 0) <= CRITERIOS.ocultoMedioPct &&
    (r.ocultoP95Pct ?? 0) <= CRITERIOS.ocultoP95Pct &&
    (r.jitterP95Ms ?? 0) <= CRITERIOS.jitterP95Ms;
  return r;
}

// --------------------------------------------------------------------- main
const fmt = (v, d = 0) => (v === null || v === undefined ? '—' : v.toFixed(d));

const voz = prepararVoz();
const servidor = await chromium.launchServer({
  executablePath: CHROME_PATH,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    ...(voz ? [`--use-file-for-fake-audio-capture=${voz}`] : []),
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const pidChrome = servidor.process().pid;
const browser = await chromium.connect(servidor.wsEndpoint());

const espacioId = await idCampus(await tokenInvitado());
console.log(
  `Escenario "${ESCENARIO}", paneo ${PANEO || 'HRTF'}, ventana ${VENTANA_S} s, ${REPETICIONES} repetición(es), ` +
  `audio: ${voz ? 'voz sintetizada' : 'pitido de Chrome'}, espacio ${espacioId}`
);
console.log('   N  malla s  pares %  ↑ kbps  ↓ kbps  oculto % (p95)  jitter p95  CPU/part.  host %  ¿acept.?');

// Mediana campo a campo entre repeticiones (los booleanos, por mayoría)
function mediana(medidas) {
  const r = {};
  for (const clave of Object.keys(medidas[0])) {
    const valores = medidas.map((m) => m[clave]);
    if (typeof valores[0] === 'boolean') r[clave] = valores.filter(Boolean).length * 2 > valores.length;
    else r[clave] = percentil(valores.filter((v) => v !== null), 50) ?? null;
  }
  r.repeticiones = medidas;
  return r;
}

const resultados = [];
for (const n of TAMANOS) {
  const medidas = [];
  for (let i = 0; i < REPETICIONES; i++) {
    medidas.push(await medirTamano(browser, pidChrome, n, espacioId));
    // Reposo: que el servidor procese las desconexiones y la CPU se enfríe
    await esperar(PAUSA_S * 1000);
  }
  const r = mediana(medidas);
  resultados.push(r);
  console.log(
    `${String(n).padStart(4)}  ${fmt(r.mallaMs && r.mallaMs / 1000, 1).padStart(7)}  ${fmt(r.paresConectadosPct, 1).padStart(7)}` +
    `  ${fmt(r.subidaMediaKbps).padStart(6)}  ${fmt(r.bajadaMediaKbps).padStart(6)}` +
    `  ${fmt(r.ocultoMedioPct, 2).padStart(8)} (${fmt(r.ocultoP95Pct, 1)})` +
    `  ${fmt(r.jitterP95Ms, 1).padStart(10)}  ${fmt(r.cpuPorParticipantePct, 1).padStart(8)} %  ${fmt(r.hostOcupadoPct).padStart(5)}` +
    `  ${r.aceptable ? 'sí' : 'NO'}${r.hostSaturado ? '  (host saturado)' : ''}`
  );
}

writeFileSync(
  SALIDA,
  JSON.stringify({ escenario: ESCENARIO, paneo: PANEO || 'HRTF', repeticiones: REPETICIONES, ventanaS: VENTANA_S, audio: voz ? 'voz' : 'pitido', criterios: CRITERIOS, resultados }, null, 2)
);
console.log(`\nResultados en ${SALIDA}`);
await browser.close();
await servidor.close();
