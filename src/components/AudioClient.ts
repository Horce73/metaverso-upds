import { Peer } from 'peerjs';

export type EstadoVoz = 'iniciando' | 'sin-microfono' | 'conectado' | 'reconectando' | 'error';

// STUN público como último recurso. Los TURN reales llegan desde /api/ice-servers
// para no hornear credenciales en el bundle y poder rotarlas sin recompilar.
const ICE_POR_DEFECTO: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// iOS/Safari no reproducen audio de un MediaStream remoto a través de
// createMediaStreamSource(): el grafo se conecta pero suena en silencio.
// En esos navegadores caemos a <audio> con volumen calculado por distancia.
function soportaAudioEspacialRemoto(): boolean {
  const ua = navigator.userAgent;
  const esIOS = /iP(hone|ad|od)/.test(ua) || (/Mac/.test(ua) && 'ontouchend' in document);
  const esSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
  return !esIOS && !esSafari;
}

export class AudioClient {
  private peer: Peer | null = null;
  private localStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private pannerNodes = new Map<string, PannerNode>(); // peerId -> PannerNode
  private audioElements = new Map<string, HTMLAudioElement>(); // peerId -> AudioElement
  private activeCalls = new Map<string, any>(); // peerId -> Call
  private posicionesPendientes = new Map<string, [number, number, number]>();
  private intentosFallidos = new Map<string, number>();
  private temporizadores = new Set<ReturnType<typeof setTimeout>>();
  private onCallConnectedCallback: ((peerId: string) => void) | null = null;

  private posicionListener: [number, number, number] = [0, 0, 0];
  private usarAudioEspacial = soportaAudioEspacialRemoto();
  private micDisponible = false;
  private destruido = false;
  private reintentosReconexion = 0;
  private resumeHandler: (() => void) | null = null;

  private userId: string;
  private onPeerIdReady: (peerId: string) => void;
  private onError: (err: any) => void;
  private onEstado: (estado: EstadoVoz, detalle?: string) => void;

  constructor(
    userId: string,
    onPeerIdReady: (peerId: string) => void,
    onError: (err: any) => void,
    onEstado?: (estado: EstadoVoz, detalle?: string) => void
  ) {
    this.userId = userId;
    this.onPeerIdReady = onPeerIdReady;
    this.onError = onError;
    this.onEstado = onEstado || (() => {});
    this.init();
  }

  private emitirEstado(estado: EstadoVoz, detalle?: string) {
    if (!this.destruido) this.onEstado(estado, detalle);
  }

  private programar(fn: () => void, ms: number) {
    const id = setTimeout(() => {
      this.temporizadores.delete(id);
      if (!this.destruido) fn();
    }, ms);
    this.temporizadores.add(id);
    return id;
  }

  public async ensureAudioContextActive() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume();
        console.log('🔊 Web Audio Context reanudado');
      } catch (err) {
        console.warn('⚠️ No se pudo reanudar AudioContext:', err);
      }
    }
  }

  // Pide los servidores ICE al backend. Si falla, seguimos con STUN público:
  // suficiente en LAN, insuficiente entre redes distintas.
  private async obtenerIceServers(): Promise<RTCIceServer[]> {
    try {
      const res = await fetch('/api/ice-servers');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
          const tieneTurn = data.iceServers.some((s: RTCIceServer) =>
            String(Array.isArray(s.urls) ? s.urls[0] : s.urls).startsWith('turn')
          );
          if (!tieneTurn) {
            console.warn('⚠️ El backend no expone TURN. Las llamadas entre redes distintas fallarán.');
          }
          return data.iceServers;
        }
      }
    } catch (err) {
      console.warn('⚠️ No se pudo leer /api/ice-servers, usando STUN público:', err);
    }
    return ICE_POR_DEFECTO;
  }

  // Stream silencioso para poder seguir en la llamada aunque no haya micrófono:
  // sin un stream, PeerJS no puede iniciar ni responder llamadas y el usuario
  // se queda sin escuchar a nadie, no sólo sin hablar.
  private crearStreamSilencioso(): MediaStream {
    const ctx = this.audioCtx!;
    const destino = ctx.createMediaStreamDestination();
    const oscilador = ctx.createOscillator();
    const ganancia = ctx.createGain();
    ganancia.gain.value = 0;
    oscilador.connect(ganancia);
    ganancia.connect(destino);
    oscilador.start();
    return destino.stream;
  }

  private async obtenerMicrofono(): Promise<MediaStream> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      this.micDisponible = true;
      console.log('🎤 Micrófono local accedido con éxito');
      return stream;
    } catch (err) {
      this.micDisponible = false;
      console.warn('⚠️ Sin micrófono (permiso denegado o no disponible). Entrarás en modo sólo escucha:', err);
      this.emitirEstado('sin-microfono', 'Sólo escucha: no se pudo acceder al micrófono');
      return this.crearStreamSilencioso();
    }
  }

  private async init() {
    try {
      this.emitirEstado('iniciando');

      // 1. AudioContext primero: lo necesita incluso el stream silencioso de respaldo
      // @ts-ignore
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtx();
      console.log('🔊 Web Audio Context inicializado');

      this.resumeHandler = () => this.ensureAudioContextActive();
      window.addEventListener('click', this.resumeHandler, { passive: true });
      window.addEventListener('keydown', this.resumeHandler, { passive: true });
      window.addEventListener('touchstart', this.resumeHandler, { passive: true });

      if (!this.usarAudioEspacial) {
        console.log('ℹ️ Navegador sin audio espacial remoto fiable: usando atenuación por distancia');
      }

      // 2. Micrófono (o stream silencioso si no hay)
      this.localStream = await this.obtenerMicrofono();

      // 3. Servidores ICE desde el backend
      const iceServers = await this.obtenerIceServers();
      if (this.destruido) return;

      // 4. Servidor PeerJS integrado en el backend (mismo origen que la web,
      //    así funciona igual en localhost, LAN y detrás del túnel HTTPS)
      this.peer = new Peer(this.userId, {
        host: window.location.hostname,
        port: window.location.port
          ? Number(window.location.port)
          : (window.location.protocol === 'https:' ? 443 : 80),
        path: '/peer',
        secure: window.location.protocol === 'https:',
        config: { iceServers },
      });

      this.peer.on('open', (id) => {
        console.log(`📡 Conectado al servidor PeerJS con ID: ${id}`);
        this.reintentosReconexion = 0;
        this.ensureAudioContextActive();
        this.emitirEstado(this.micDisponible ? 'conectado' : 'sin-microfono');
        this.onPeerIdReady(id);
      });

      // La señalización se cae con frecuencia detrás de túneles y proxies
      // (timeout de WebSocket ocioso). Sin esto el peer queda vivo en local
      // pero invisible para el servidor: nadie puede volver a llamarte.
      this.peer.on('disconnected', () => {
        if (this.destruido) return;
        this.reintentosReconexion += 1;
        const espera = Math.min(1000 * this.reintentosReconexion, 10000);
        console.warn(`🔌 Señalización PeerJS caída. Reconectando en ${espera}ms (intento ${this.reintentosReconexion})`);
        this.emitirEstado('reconectando', `Reintento ${this.reintentosReconexion}`);
        this.programar(() => {
          if (this.peer && !this.peer.destroyed && this.peer.disconnected) {
            try {
              this.peer.reconnect();
            } catch (err) {
              console.warn('⚠️ Falló reconnect() de PeerJS:', err);
            }
          }
        }, espera);
      });

      this.peer.on('close', () => {
        console.warn('🔌 Peer cerrado por el servidor');
        this.emitirEstado('error', 'Conexión de voz cerrada');
      });

      this.peer.on('error', (err: any) => {
        const errType = err?.type || '';
        if (errType === 'peer-unavailable') {
          console.warn(`⚠️ Peer no disponible temporalmente (${err.message}).`);
          return;
        }
        if (errType === 'network') {
          console.warn('⚠️ Error de red con el servidor PeerJS, se reintentará');
          this.emitirEstado('reconectando', 'Sin señalización');
          return;
        }
        console.error('⚠️ Error en PeerJS:', err);
        this.emitirEstado('error', err?.message || errType);
        this.onError(err);
      });

      // 5. Llamadas entrantes
      this.peer.on('call', (call) => {
        console.log(`📞 Recibiendo llamada entrante de: ${call.peer}`);
        if (this.activeCalls.has(call.peer)) {
          console.log(`⚠️ Ignorando llamada entrante duplicada de: ${call.peer}`);
          return;
        }
        call.answer(this.localStream || undefined);
        this.handleIncomingStream(call);
      });

    } catch (err) {
      console.error('⚠️ No se pudo inicializar el canal de voz:', err);
      this.emitirEstado('error', (err as any)?.message);
      this.onError(err);
    }
  }

  // Llamar a otro usuario cuando entra a la sala
  public callUser(remotePeerId: string, retries = 2) {
    if (this.destruido || !remotePeerId) return;
    if (!this.peer || !this.localStream || this.activeCalls.has(remotePeerId)) return;
    if ((this.intentosFallidos.get(remotePeerId) || 0) >= 4) {
      console.warn(`⛔ Demasiados intentos fallidos con ${remotePeerId}, se deja de reintentar`);
      return;
    }

    console.log(`📞 Llamando a: ${remotePeerId}...`);
    try {
      const call = this.peer.call(remotePeerId, this.localStream);
      if (!call) {
        if (retries > 0) this.programar(() => this.callUser(remotePeerId, retries - 1), 1500);
        return;
      }
      this.handleIncomingStream(call);
    } catch (err) {
      console.warn(`⚠️ Error al iniciar llamada con ${remotePeerId}:`, err);
      if (retries > 0) this.programar(() => this.callUser(remotePeerId, retries - 1), 1500);
    }
  }

  // Vigila el estado ICE: sin esto una llamada que nunca negocia ruta se ve
  // "conectada" en la UI y simplemente no se oye nada.
  private vigilarIce(call: any, remotePeerId: string) {
    const enganchar = () => {
      if (this.destruido) return;
      const pc: RTCPeerConnection | undefined = call.peerConnection;
      if (!pc) {
        this.programar(enganchar, 300);
        return;
      }
      pc.addEventListener('iceconnectionstatechange', () => {
        const estado = pc.iceConnectionState;
        console.log(`🧊 ICE con ${remotePeerId}: ${estado}`);

        if (estado === 'connected' || estado === 'completed') {
          this.intentosFallidos.delete(remotePeerId);
        }

        if (estado === 'failed') {
          const intentos = (this.intentosFallidos.get(remotePeerId) || 0) + 1;
          this.intentosFallidos.set(remotePeerId, intentos);
          console.error(
            `❌ ICE falló con ${remotePeerId}: no hay ruta de red entre los dos equipos. ` +
            `Revisa que /api/ice-servers devuelva un TURN válido.`
          );
          this.emitirEstado('error', 'Sin ruta de red (falta TURN)');
          this.removeUserAudio(remotePeerId);
          if (intentos < 4) this.programar(() => this.callUser(remotePeerId, 1), 2000);
        }
      });
    };
    enganchar();
  }

  // Procesar el stream de audio entrante y aplicar efecto espacial
  private handleIncomingStream(call: any) {
    const remotePeerId = call.peer;
    this.activeCalls.set(remotePeerId, call);
    this.vigilarIce(call, remotePeerId);

    call.on('stream', (remoteStream: MediaStream) => {
      console.log(`🔊 Recibido stream de audio de: ${remotePeerId}`);
      if (this.audioElements.has(remotePeerId)) return;
      if (!this.audioCtx) return;
      this.ensureAudioContextActive();

      // Elemento de audio oculto: en Chromium mantiene vivo el MediaStreamTrack.
      // volume 0 cuando el sonido sale por el grafo Web Audio; volumen real
      // cuando caemos al modo de atenuación por distancia.
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.autoplay = true;
      (audio as any).playsInline = true;
      audio.volume = this.usarAudioEspacial ? 0 : 1;
      audio.play().catch(e => console.warn('Error autoplay audio:', e));
      this.audioElements.set(remotePeerId, audio);

      if (this.usarAudioEspacial) {
        const source = this.audioCtx.createMediaStreamSource(remoteStream);

        const panner = this.audioCtx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 6;
        panner.maxDistance = 10000;
        panner.rolloffFactor = 0.3;
        panner.coneInnerAngle = 360;
        panner.coneOuterAngle = 360;

        panner.positionX.value = 0;
        panner.positionY.value = 0;
        panner.positionZ.value = 0;

        source.connect(panner);
        panner.connect(this.audioCtx.destination);
        this.pannerNodes.set(remotePeerId, panner);
      }

      // Aplicar la última posición conocida: si el avatar remoto está quieto,
      // nunca llegará un 'move' que corrija la posición por defecto (0,0,0).
      const pendiente = this.posicionesPendientes.get(remotePeerId);
      if (pendiente) this.updateSourcePosition(remotePeerId, pendiente);

      if (this.onCallConnectedCallback) {
        this.onCallConnectedCallback(remotePeerId);
      }
    });

    call.on('close', () => {
      this.removeUserAudio(remotePeerId);
    });

    call.on('error', (err: any) => {
      console.error(`Error en llamada con ${remotePeerId}:`, err);
      this.removeUserAudio(remotePeerId);
    });
  }

  // Actualizar la posición de la cámara del usuario (oyente)
  public updateListenerPosition(position: [number, number, number], rotation: [number, number, number]) {
    if (!this.audioCtx) return;
    this.posicionListener = position;

    if (!this.usarAudioEspacial) {
      // Modo respaldo: recalcular volúmenes contra la nueva posición del oyente
      this.posicionesPendientes.forEach((pos, peerId) => this.aplicarVolumenPorDistancia(peerId, pos));
      return;
    }

    const listener = this.audioCtx.listener;

    if (listener.positionX) {
      listener.positionX.value = position[0];
      listener.positionY.value = position[1];
      listener.positionZ.value = position[2];
    } else {
      // Fallback navegadores antiguos
      // @ts-ignore
      listener.setPosition(position[0], position[1], position[2]);
    }

    // El avatar rota con atan2(dir.x, dir.z), así que su vector frontal
    // es (sin θ, 0, cos θ).
    const forwardX = Math.sin(rotation[1]);
    const forwardZ = Math.cos(rotation[1]);

    if (listener.forwardX) {
      listener.forwardX.value = forwardX;
      listener.forwardY.value = 0;
      listener.forwardZ.value = forwardZ;
      listener.upX.value = 0;
      listener.upY.value = 1;
      listener.upZ.value = 0;
    } else {
      // Fallback
      // @ts-ignore
      listener.setOrientation(forwardX, 0, forwardZ, 0, 1, 0);
    }
  }

  // Respaldo para navegadores sin audio espacial remoto: misma curva
  // "inverse" que el PannerNode, aplicada al volumen del <audio>.
  private aplicarVolumenPorDistancia(remotePeerId: string, position: [number, number, number]) {
    const audio = this.audioElements.get(remotePeerId);
    if (!audio) return;
    const dx = position[0] - this.posicionListener[0];
    const dy = position[1] - this.posicionListener[1];
    const dz = position[2] - this.posicionListener[2];
    const distancia = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const refDistance = 6;
    const rolloff = 0.3;
    const ganancia = refDistance / (refDistance + rolloff * Math.max(0, distancia - refDistance));
    audio.volume = Math.min(1, Math.max(0, ganancia));
  }

  // Actualizar la posición 3D del emisor de voz de otro avatar
  public updateSourcePosition(remotePeerId: string, position: [number, number, number]) {
    // Guardar siempre: la llamada puede seguir negociando y el panner aún no existir.
    this.posicionesPendientes.set(remotePeerId, position);

    if (!this.usarAudioEspacial) {
      this.aplicarVolumenPorDistancia(remotePeerId, position);
      return;
    }

    const panner = this.pannerNodes.get(remotePeerId);
    if (panner) {
      panner.positionX.value = position[0];
      panner.positionY.value = position[1];
      panner.positionZ.value = position[2];
    }
  }

  // Registrar callback para cuando se conecta una llamada
  public onCallConnected(callback: (peerId: string) => void) {
    this.onCallConnectedCallback = callback;
  }

  public tieneMicrofono(): boolean {
    return this.micDisponible;
  }

  // Limpiar y remover audio de un usuario desconectado
  public removeUserAudio(remotePeerId: string) {
    console.log(`🗑️ Removiendo audio del Peer: ${remotePeerId}`);

    const call = this.activeCalls.get(remotePeerId);
    if (call) {
      call.close();
      this.activeCalls.delete(remotePeerId);
    }

    const audio = this.audioElements.get(remotePeerId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      this.audioElements.delete(remotePeerId);
    }

    const panner = this.pannerNodes.get(remotePeerId);
    if (panner) {
      panner.disconnect();
      this.pannerNodes.delete(remotePeerId);
    }
  }

  // Silenciar / Activar micrófono
  public setMute(muted: boolean) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !muted;
      });
      console.log(`🎤 Micrófono local: ${muted ? 'Silenciado' : 'Activo'}`);
    }
  }

  // Limpieza total al salir del espacio
  public destroy() {
    console.log('🧹 Destruyendo AudioClient...');
    this.destruido = true;

    this.temporizadores.forEach((id) => clearTimeout(id));
    this.temporizadores.clear();

    // Sin esto se acumula un listener por cada entrada a un espacio,
    // cada uno reteniendo un AudioContext ya cerrado.
    if (this.resumeHandler) {
      window.removeEventListener('click', this.resumeHandler);
      window.removeEventListener('keydown', this.resumeHandler);
      window.removeEventListener('touchstart', this.resumeHandler);
      this.resumeHandler = null;
    }

    this.activeCalls.forEach((call) => call.close());
    this.activeCalls.clear();
    this.audioElements.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
    });
    this.audioElements.clear();
    this.pannerNodes.forEach((panner) => panner.disconnect());
    this.pannerNodes.clear();
    this.posicionesPendientes.clear();
    this.intentosFallidos.clear();

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
    }
  }
}
