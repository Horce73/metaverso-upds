import { Peer } from 'peerjs';

export class AudioClient {
  private peer: Peer | null = null;
  private localStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private pannerNodes = new Map<string, PannerNode>(); // peerId -> PannerNode
  private audioElements = new Map<string, HTMLAudioElement>(); // peerId -> AudioElement
  private activeCalls = new Map<string, any>(); // peerId -> Call
  private onCallConnectedCallback: ((peerId: string) => void) | null = null;

  private userId: string;
  private onPeerIdReady: (peerId: string) => void;
  private onError: (err: any) => void;

  constructor(
    userId: string,
    onPeerIdReady: (peerId: string) => void,
    onError: (err: any) => void
  ) {
    this.userId = userId;
    this.onPeerIdReady = onPeerIdReady;
    this.onError = onError;
    this.init();
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

  private async init() {
    try {
      // 1. Obtener micrófono local
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      console.log('🎤 Micrófono local accedido con éxito');

      // 2. Inicializar Web Audio API Context
      // @ts-ignore
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtx();
      console.log('🔊 Web Audio Context inicializado');

      const resumeAudio = () => this.ensureAudioContextActive();
      window.addEventListener('click', resumeAudio, { passive: true });
      window.addEventListener('keydown', resumeAudio, { passive: true });
      window.addEventListener('touchstart', resumeAudio, { passive: true });

      // 3. Conectarse al servidor PeerJS que corre en nuestro backend Node
      // Conectarse al servidor PeerJS integrado en el backend
      this.peer = new Peer(this.userId, {
        host: window.location.hostname,
        port: window.location.port ? Number(window.location.port) : (window.location.protocol === 'https:' ? 443 : 80),
        path: '/peer',
        secure: window.location.protocol === 'https:',
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      this.peer.on('open', (id) => {
        console.log(`📡 Conectado al servidor PeerJS con ID: ${id}`);
        this.ensureAudioContextActive();
        this.onPeerIdReady(id);
      });

      this.peer.on('error', (err: any) => {
        const errType = err?.type || '';
        if (errType === 'peer-unavailable') {
          console.warn(`⚠️ Peer no disponible temporalmente (${err.message}). Se reintentará si permanece en la sala.`);
          return;
        }
        console.error('⚠️ Error en PeerJS:', err);
        this.onError(err);
      });

      // 4. Escuchar llamadas entrantes de otros usuarios
      this.peer.on('call', (call) => {
        console.log(`📞 Recibiendo llamada entrante de: ${call.peer}`);
        if (this.localStream) {
          // Evitar llamadas duplicadas cruzadas (SDP Glare) si ya existe llamada con este peer
          if (this.activeCalls.has(call.peer)) {
            console.log(`⚠️ Ignorando llamada entrante duplicada de: ${call.peer}`);
            return;
          }
          call.answer(this.localStream); // Responder con nuestro audio
          this.handleIncomingStream(call);
        }
      });

    } catch (err) {
      console.error('⚠️ No se pudo acceder al micrófono o inicializar audio espacial:', err);
      this.onError(err);
    }
  }

  // Llamar a otro usuario cuando entra a la sala
  public callUser(remotePeerId: string, retries = 2) {
    if (!this.peer || !this.localStream || !remotePeerId || this.activeCalls.has(remotePeerId)) return;

    console.log(`📞 Llamando a: ${remotePeerId}...`);
    try {
      const call = this.peer.call(remotePeerId, this.localStream);
      if (!call) {
        if (retries > 0) {
          setTimeout(() => this.callUser(remotePeerId, retries - 1), 1500);
        }
        return;
      }
      this.handleIncomingStream(call);
    } catch (err) {
      console.warn(`⚠️ Error al iniciar llamada con ${remotePeerId}:`, err);
      if (retries > 0) {
        setTimeout(() => this.callUser(remotePeerId, retries - 1), 1500);
      }
    }
  }

  // Procesar el stream de audio entrante y aplicar efecto espacial
  private handleIncomingStream(call: any) {
    const remotePeerId = call.peer;
    this.activeCalls.set(remotePeerId, call);

    call.on('stream', (remoteStream: MediaStream) => {
      console.log(`🔊 Recibido stream de audio de: ${remotePeerId}`);

      // Evitar crear múltiples nodos para el mismo Peer
      if (this.pannerNodes.has(remotePeerId)) return;

      if (!this.audioCtx) return;
      this.ensureAudioContextActive();

      // 1. Crear elemento de audio oculto para reproduccion (volume 0 en lugar de muted=true para mantener activo el MediaStreamTrack en Chromium)
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.volume = 0;
      audio.play().catch(e => console.warn('Error autoplay audio:', e));
      this.audioElements.set(remotePeerId, audio);

      // 2. Crear fuente de nodo a partir del stream de audio
      const source = this.audioCtx.createMediaStreamSource(remoteStream);

      // 3. Crear nodo Panner para audio espacial (3D)
      const panner = this.audioCtx.createPanner();
      panner.panningModel = 'HRTF'; // Modelo de alta fidelidad espacial (Head-Related Transfer Function)
      panner.distanceModel = 'inverse';
      panner.refDistance = 6;      // Distancia de referencia
      panner.maxDistance = 10000;   // Distancia máxima de atenuación
      panner.rolloffFactor = 0.3;     // Factor de reducción de volumen con la distancia
      panner.coneInnerAngle = 360;
      panner.coneOuterAngle = 360;

      // Posición inicial por defecto
      panner.positionX.value = 0;
      panner.positionY.value = 0;
      panner.positionZ.value = 0;

      // 4. Conectar nodos: Fuente -> Panner -> Destino (Parlantes)
      source.connect(panner);
      panner.connect(this.audioCtx.destination);

      this.pannerNodes.set(remotePeerId, panner);

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
    const listener = this.audioCtx.listener;

    // Métodos modernos y compatibles para posicionar el listener
    if (listener.positionX) {
      listener.positionX.value = position[0];
      listener.positionY.value = position[1];
      listener.positionZ.value = position[2];
    } else {
      // Fallback navegadores antiguos
      // @ts-ignore
      listener.setPosition(position[0], position[1], position[2]);
    }

    // Orientación (hacia dónde mira el oyente)
    // Asumimos un vector de dirección basado en la rotación (mirando hacia adelante en el eje Z)
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

  // Actualizar la posición 3D del emisor de voz de otro avatar
  public updateSourcePosition(remotePeerId: string, position: [number, number, number]) {
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
    this.activeCalls.forEach((call) => call.close());
    this.audioElements.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
    });
    this.pannerNodes.forEach((panner) => panner.disconnect());

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }

    if (this.peer) {
      this.peer.destroy();
    }

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
    }
  }
}
