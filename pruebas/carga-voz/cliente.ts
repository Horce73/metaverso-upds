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

const socket = io({ auth: { token }, transports: ['websocket'] });
const peerIdsPorSocket = new Map<string, string>();
let unido = false;
let estadoVoz: EstadoVoz = 'iniciando';

const unirse = (peerId: string) => {
  socket.emit('join_space', { espacioId, user: { peerId } });
  unido = true;
};

const cliente = new AudioClient(
  `carga_${Math.random().toString(36).slice(2, 10)}`,
  unirse,
  (err) => {
    salida.textContent = `error de voz: ${err?.message ?? err}`;
  },
  (estado, detalle) => {
    estadoVoz = estado;
    salida.textContent = `${estado}${detalle ? `: ${detalle}` : ''}`;
  }
);

// Igual que App.tsx: quien llega llama a los que ya estaban; los que ya
// estaban no llaman al recién llegado (evita llamadas cruzadas).
const alRecibirUsuarios = (usuarios: Record<string, { peerId?: string }>) => {
  Object.entries(usuarios).forEach(([socketId, u]) => {
    if (!u.peerId) return;
    peerIdsPorSocket.set(socketId, u.peerId);
    cliente.callUser(u.peerId);
  });
};
socket.on('space_users', alRecibirUsuarios);
socket.on('current_users', alRecibirUsuarios);
socket.on('user_joined', (data: { socketId: string; user: { peerId?: string } }) => {
  if (data.user.peerId) peerIdsPorSocket.set(data.socketId, data.user.peerId);
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
