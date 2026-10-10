// Mide el trafico de 'user_moved' en el campus (3D-04): cuantos mensajes
// recibe cada participante cuando todos se mueven sin parar, repartidos en
// dos grupos separados (plaza vs isla de aulas, igual que ISLA_2_OFFSET_Z en
// Campus.tsx). No usa navegador: son clientes de socket.io crudos, livianos,
// pensados para N grandes sin saturar esta maquina como sí lo hace la malla
// de voz con audio real (ver pruebas/carga-voz).
//
// Uso:
//   npm run carga:trafico -- --n 30
//   npm run carga:trafico -- --n 30 --ventana 10
import { io } from 'socket.io-client';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > -1 ? process.argv[i + 1] : porDefecto;
};
const N = Number(arg('n', '30'));
const VENTANA_S = Number(arg('ventana', '8'));
const TASA_MOVE_MS = 30;
const DISPERSO = process.argv.includes('--disperso'); // mismo cap que el cliente real (~33/s moviendose)

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function obtenerToken() {
  const res = await fetch(`${BACKEND_URL}/api/auth/guest`, { method: 'POST' });
  if (!res.ok) throw new Error(`guest login fallo: ${res.status}`);
  const data = await res.json();
  return data.token;
}

async function obtenerCampusId() {
  const token = await obtenerToken();
  const res = await fetch(`${BACKEND_URL}/api/espacios`, { headers: { Authorization: `Bearer ${token}` } });
  const espacios = await res.json();
  const campus = (Array.isArray(espacios) ? espacios : espacios.espacios || []).find((e) => e.tipo === 'campus');
  if (!campus) throw new Error('no se encontro un espacio tipo campus');
  return campus.id;
}

function conectar(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BACKEND_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    const timer = setTimeout(() => reject(new Error('timeout de conexion')), 8000);
    socket.once('connect', () => { clearTimeout(timer); resolve(socket); });
    socket.once('connect_error', (err) => { clearTimeout(timer); reject(err); });
  });
}

async function main() {
  console.log(`Midiendo trafico de posicion en el campus con N=${N}, ventana=${VENTANA_S}s`);
  const campusId = await obtenerCampusId();

  const participantes = [];
  for (let i = 0; i < N; i++) {
    const token = await obtenerToken();
    const socket = await conectar(token);
    // Dos escenarios segun --disperso:
    //  - agrupado (por defecto): mitad en la plaza (z~0), mitad en la isla
    //    de aulas (z~-27, igual que ISLA_2_OFFSET_Z) - el piso conservador,
    //    exactamente dos focos pegados entre si.
    //  - disperso: posiciones repartidas al azar en toda el area del campus,
    //    mas parecido a estudiantes caminando sueltos entre clases.
    let x, z;
    if (DISPERSO) {
      x = (Math.random() * 60) - 30;
      z = (Math.random() * 45) - 32;
    } else {
      const grupo = i % 2 === 0 ? 0 : -27;
      x = (i % 10) * 1.5 - 7;
      z = grupo + ((i % 3) - 1) * 1.2;
    }

    let recibidos = 0;
    socket.on('user_moved', () => { recibidos++; });

    await new Promise((resolve) => {
      socket.once('space_users', () => resolve());
      socket.once('current_users', () => resolve());
      socket.emit('join_space', {
        espacioId: campusId,
        espacioTipo: 'campus',
        user: { id: null, nombreVisible: `carga_${i}`, peerId: '', apariencia: {} },
      });
    });

    participantes.push({ socket, x, z, recibidos: () => recibidos });
  }

  console.log(`${N} participantes conectados y unidos al campus.`);

  let moviendo = true;
  const timers = participantes.map((p, i) => setInterval(() => {
    if (!moviendo) return;
    p.x += 0.05; // movimiento continuo real, no estatico: nunca lo filtra el "solo diferencias"
    p.socket.emit('move', { position: [p.x, 0, p.z], rotation: [0, 0, 0], estaSentado: false });
  }, TASA_MOVE_MS + (i % 3))); // pequeno jitter para no sincronizar los N en el mismo tick

  await esperar(VENTANA_S * 1000);
  moviendo = false;
  timers.forEach(clearInterval);
  await esperar(300); // drenar mensajes en vuelo

  const totalRecibidos = participantes.reduce((acc, p) => acc + p.recibidos(), 0);
  const promedioPorParticipante = totalRecibidos / N;
  const formulaSinFiltro = (N - 1) * N * (VENTANA_S * 1000 / TASA_MOVE_MS); // broadcast a toda la sala, aproximado

  console.log('');
  console.log('=== RESULTADO ===');
  console.log(`'user_moved' recibidos en total:      ${totalRecibidos}`);
  console.log(`Promedio por participante:             ${promedioPorParticipante.toFixed(1)}`);
  console.log(`Estimado SIN filtro (broadcast a sala): ~${Math.round(formulaSinFiltro)} (referencia, no medido)`);
  console.log(`Reduccion aproximada:                   ${(100 * (1 - totalRecibidos / formulaSinFiltro)).toFixed(1)}%`);

  participantes.forEach((p) => p.socket.disconnect());
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
