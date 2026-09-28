// Participante de la prueba de carga de la malla de voz (spike de la Fase 2).
// Usa el AudioClient real (PeerJS, audio espacial HRTF, getStats) y el mismo
// protocolo de socket que App.tsx, sin la escena 3D: lo que se mide es el
// coste de la voz, no el del render. La prueba lo abre con
// ?token=<jwt>&espacio=<id> y lo maneja a través de window.carga.
import { io } from 'socket.io-client';
import { AudioClient, type EstadoVoz } from '../../src/components/AudioClient.js';
import type { DiagnosticoVoz, MuestraPrevia } from '../../src/components/diagnosticoVoz.js';

interface ControlCarga {
  unido: () => boolean;
  estadoVoz: () => EstadoVoz;
  medir: () => Promise<DiagnosticoVoz>;
  silenciar: (silenciado: boolean) => void;
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
  }
);

cliente.updateListenerPosition(posicionDe(miPeerId), [0, 0, 0]);

// Igual que App.tsx: quien llega llama a los que ya estaban; los que ya
// estaban no llaman al recién llegado (evita llamadas cruzadas).
const alRecibirUsuarios = (usuarios: Record<string, { peerId?: string }>) => {
  Object.entries(usuarios).forEach(([socketId, u]) => {
    if (!u.peerId) return;
    peerIdsPorSocket.set(socketId, u.peerId);
    cliente.updateSourcePosition(u.peerId, posicionDe(u.peerId));
    cliente.callUser(u.peerId);
  });
};
socket.on('space_users', alRecibirUsuarios);
socket.on('current_users', alRecibirUsuarios);
socket.on('user_joined', (data: { socketId: string; user: { peerId?: string } }) => {
  if (!data.user.peerId) return;
  peerIdsPorSocket.set(data.socketId, data.user.peerId);
  cliente.updateSourcePosition(data.user.peerId, posicionDe(data.user.peerId));
});
socket.on('user_left', (data: { socketId: string }) => {
  const peerId = peerIdsPorSocket.get(data.socketId);
  if (peerId) cliente.removeUserAudio(peerId);
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
};
