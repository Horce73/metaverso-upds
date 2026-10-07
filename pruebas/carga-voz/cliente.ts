// Participante de la prueba de carga de la malla de voz (spike de la Fase 2).
// Usa el AudioClient real (PeerJS, audio espacial HRTF, getStats) y el mismo
// protocolo de socket que App.tsx, sin la escena 3D: lo que se mide es el
// coste de la voz, no el del render. La prueba lo abre con
// ?token=<jwt>&espacio=<id> y lo maneja a través de window.carga.
import { io } from 'socket.io-client';
import { AudioClient, type EstadoVoz } from '../../src/components/AudioClient.js';
import type { DiagnosticoVoz, MuestraPrevia } from '../../src/components/diagnosticoVoz.js';
import { esDifusor } from '../../src/components/zonasVoz.js';

interface ControlCarga {
  unido: () => boolean;
  estadoVoz: () => EstadoVoz;
  medir: () => Promise<DiagnosticoVoz>;
  silenciar: (silenciado: boolean) => void;
  ganancias: () => Record<string, number>;
  reduccionLimitador: () => number;
}

declare global {
  interface Window {
    carga: ControlCarga;
  }
}

const params = new URLSearchParams(location.search);
const token = params.get('token') ?? '';
const espacioId = Number(params.get('espacio'));
const salida = document.getElementById('estado')!;

// ?paneo=equalpower fuerza ese modelo en todos los PannerNode del AudioClient,
// para separar cuánto de la CPU se va en el audio espacial HRTF.
const paneoForzado = params.get('paneo') as PanningModelType | null;
if (paneoForzado) {
  const descriptor = Object.getOwnPropertyDescriptor(PannerNode.prototype, 'panningModel')!;
  Object.defineProperty(PannerNode.prototype, 'panningModel', {
    ...descriptor,
    set(this: PannerNode) {
      descriptor.set!.call(this, paneoForzado);
    },
  });
}

const socket = io({ auth: { token }, transports: ['websocket'] });
const peerIdsPorSocket = new Map<string, string>();
let unido = false;
let estadoVoz: EstadoVoz = 'iniciando';

// Cada participante ocupa un lugar fijo, derivado de su peerId, dentro de un
// aula de 20 × 20 m. Con todos en el origen, cada fuente HRTF queda encima del
// oyente: un caso que la app nunca produce y que dispara la CPU del panner.
const posicionDe = (id: string): [number, number, number] => {
  let h = 0;
  for (const c of id) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0;
  return [((h % 1000) / 1000) * 20 - 10, 0, ((Math.floor(h / 1000) % 1000) / 1000) * 20 - 10];
};

// ?zonas=1&x=..&z=.. entra al aula con las zonas de audio (VOZ-03) como la
// app: posición fija dada por la prueba y anunciada con 'move', y las
// llamadas las abre y cuelga AudioClient según distancia y rol.
const conZonas = params.get('zonas') === '1';

const unirse = (peerId: string) => {
  socket.emit('join_space', { espacioId, user: { peerId } });
  unido = true;
};

const miPeerId = `carga_${Math.random().toString(36).slice(2, 10)}`;
const cliente = new AudioClient(
  miPeerId,
  unirse,
  (err) => {
    salida.textContent = `error de voz: ${err?.message ?? err}`;
  },
  (estado, detalle) => {
    estadoVoz = estado;
    salida.textContent = `${estado}${detalle ? `: ${detalle}` : ''}`;
  },
  // ?dtx=0 negocia Opus sin DTX, como antes de la decisión 0001, para comparar
  { dtx: params.get('dtx') !== '0' }
);

const miPosicion: [number, number, number] = conZonas
  ? [Number(params.get('x')), 0, Number(params.get('z'))]
  : posicionDe(miPeerId);
cliente.updateListenerPosition(miPosicion, [0, 0, 0]);
if (conZonas) cliente.configurarZonas('aula', false);

interface UsuarioRemoto {
  peerId?: string;
  roles?: string[];
  position?: [number, number, number];
}

// Sin zonas, malla completa como en la Fase 2: quien llega llama a los que ya
// estaban y los que ya estaban no llaman al recién llegado. Con zonas, igual
// que App.tsx: se registra a cada uno y AudioClient decide.
const alRecibirUsuarios = (usuarios: Record<string, UsuarioRemoto>) => {
  Object.entries(usuarios).forEach(([socketId, u]) => {
    if (!u.peerId) return;
    peerIdsPorSocket.set(socketId, u.peerId);
    if (conZonas) {
      if (u.position) cliente.updateSourcePosition(u.peerId, u.position);
      cliente.registrarParticipante(u.peerId, esDifusor(u.roles ?? [], 'aula'));
    } else {
      cliente.updateSourcePosition(u.peerId, posicionDe(u.peerId));
      cliente.callUser(u.peerId);
    }
  });
};
socket.on('join_aceptado', (data: { roles: string[] }) => {
  if (!conZonas) return;
  cliente.configurarZonas('aula', esDifusor(data.roles, 'aula'));
  socket.emit('move', { position: miPosicion, rotation: [0, 0, 0], estaSentado: false });
});
// Igual que App.tsx: con el trabajo en grupos (AULA-07) la voz queda en la mesa
socket.on('modo_grupos', (data: { activo: boolean }) => cliente.fijarModoGrupos(data.activo));
// Igual que App.tsx: quien tiene la palabra (AULA-03) difunde a toda el aula
socket.on('estado_preguntas', (estado: { palabra: { socketId: string; peerId: string } | null }) => {
  cliente.fijarPalabra(estado.palabra?.peerId || null, estado.palabra?.socketId === socket.id);
});
socket.on('space_users', alRecibirUsuarios);
socket.on('current_users', alRecibirUsuarios);
socket.on('user_joined', (data: { socketId: string; user: UsuarioRemoto }) => {
  if (!data.user.peerId) return;
  peerIdsPorSocket.set(data.socketId, data.user.peerId);
  if (conZonas) cliente.registrarParticipante(data.user.peerId, esDifusor(data.user.roles ?? [], 'aula'));
  else cliente.updateSourcePosition(data.user.peerId, posicionDe(data.user.peerId));
});
socket.on('user_moved', (data: { socketId: string; position: [number, number, number] }) => {
  const peerId = peerIdsPorSocket.get(data.socketId);
  if (conZonas && peerId) cliente.updateSourcePosition(peerId, data.position);
});
socket.on('user_left', (data: { socketId: string }) => {
  const peerId = peerIdsPorSocket.get(data.socketId);
  if (peerId) cliente.olvidarParticipante(peerId);
  peerIdsPorSocket.delete(data.socketId);
});
socket.on('join_rechazado', (data: { motivo: string }) => {
  salida.textContent = `join rechazado: ${data.motivo}`;
});

const muestras = new Map<string, MuestraPrevia>();
window.carga = {
  unido: () => unido,
  estadoVoz: () => estadoVoz,
  medir: () => cliente.obtenerDiagnostico(muestras),
  silenciar: (silenciado) => cliente.setMute(silenciado),
  // Volumen de la atenuación lateral de cada voz recibida (VOZ-03), para
  // comprobar que baja mientras habla el docente. Lee un campo privado.
  reduccionLimitador: () => cliente.reduccionLimitador(),
  ganancias: () =>
    Object.fromEntries(
      [...((cliente as unknown as { ganancias: Map<string, GainNode> }).ganancias)].map(([id, g]) => [id, g.gain.value])
    ),
};
