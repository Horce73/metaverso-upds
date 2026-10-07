import { Peer } from 'peerjs';
import {
  resumirEstadisticas,
  totalizar,
  type DiagnosticoPeer,
  type DiagnosticoVoz,
  type MuestraPrevia,
} from './diagnosticoVoz.js';
import { activarDtx } from './sdpVoz.js';
import {
  parametrosPanner,
  perfilEntre,
  gananciaPorDistancia,
  planificarConexiones,
  type PerfilAudicion,
  type TipoEspacio,
} from './zonasVoz.js';

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

// Micrófono elegido por el usuario (VOZ-08), recordado entre sesiones. Si el
// dispositivo ya no existe, getUserMedia cae al predeterminado.
const CLAVE_MICROFONO = 'microfonoPreferido';

export function leerMicrofonoPreferido(): string | null {
  try {
    return localStorage.getItem(CLAVE_MICROFONO);
  } catch {
    return null;
  }
}

export function guardarMicrofonoPreferido(deviceId: string) {
  try {
    localStorage.setItem(CLAVE_MICROFONO, deviceId);
  } catch {
    /* sin almacenamiento: la elección dura sólo esta sesión */
  }
}

// Mientras habla quien difunde, las voces de proximidad bajan a este volumen
// para que una conversación lateral no tape la clase (VOZ-03).
const ATENUACION_LATERAL = 0.35;
// Mismo umbral de RMS que el anillo de "está hablando" (VOZ-02).
const UMBRAL_HABLA = 0.02;
// Sin esto la atenuación sube y baja entre palabra y palabra.
const RETENCION_ATENUACION_MS = 800;
const INTERVALO_ZONAS_MS = 400;
const INTERVALO_ATENUACION_MS = 100;

const RESTRICCIONES_VOZ = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export interface OpcionesAudioClient {
  /** Opus DTX (decisión 0001). Sólo la prueba de carga lo apaga, para comparar. */
  dtx?: boolean;
}

export class AudioClient {
  private peer: Peer | null = null;
  private localStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  // Mezcla de todas las voces remotas -> limitador -> altavoces (VOZ-07)
  private mezcla: GainNode | null = null;
  private limitador: DynamicsCompressorNode | null = null;
  private pannerNodes = new Map<string, PannerNode>(); // peerId -> PannerNode
  private ganancias = new Map<string, GainNode>(); // peerId -> GainNode (atenuación lateral)
  private audioElements = new Map<string, HTMLAudioElement>(); // peerId -> AudioElement
  private activeCalls = new Map<string, any>(); // peerId -> Call
  private posicionesPendientes = new Map<string, [number, number, number]>();
  private intentosFallidos = new Map<string, number>();
  private muestrasDiagnostico = new Map<string, MuestraPrevia>();
  // Nivel de voz por participante (VOZ-02): un AnalyserNode por stream remoto
  // y otro para el micrófono propio.
  private analizadores = new Map<string, AnalyserNode>();
  private analizadorLocal: AnalyserNode | null = null;
  private bufferNivel = new Float32Array(256);
  private temporizadores = new Set<ReturnType<typeof setTimeout>>();
  private intervalos = new Set<ReturnType<typeof setInterval>>();
  // Zonas de audio (VOZ-03). Con zona null la malla es completa y las llamadas
  // las decide quien usa la clase (así la mide la prueba de carga).
  private zona: TipoEspacio | null = null;
  private soyDifusor = false;
  private participantes = new Map<string, boolean>(); // peerId -> difunde por su rol
  // A quién le cedió la palabra el docente (AULA-03): difunde mientras la tenga
  private peerConPalabra: string | null = null;
  private tengoPalabra = false;
  // Trabajo en grupos (AULA-07): la voz de cada mesa queda en la mesa
  private modoGrupos = false;
  // Perfil aplicado a cada voz: con mesas depende de dónde está cada uno
  private perfilesAplicados = new Map<string, PerfilAudicion>();
  private ultimaVozDifusor = 0;
  // Participantes que este usuario silenció para sí (VOZ-04)
  private silenciados = new Set<string>();
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
  private opcionesLlamada: { sdpTransform?: (sdp: string) => string };

  constructor(
    userId: string,
    onPeerIdReady: (peerId: string) => void,
    onError: (err: any) => void,
    onEstado?: (estado: EstadoVoz, detalle?: string) => void,
    { dtx = true }: OpcionesAudioClient = {}
  ) {
    this.userId = userId;
    this.opcionesLlamada = dtx ? { sdpTransform: activarDtx } : {};
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
      const preferido = leerMicrofonoPreferido();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...RESTRICCIONES_VOZ,
          // 'ideal' y no 'exact': si ese micrófono ya no está, mejor otro que ninguno
          ...(preferido ? { deviceId: { ideal: preferido } } : {}),
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
      this.crearLimitador(this.audioCtx);
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
      if (this.micDisponible) this.analizadorLocal = this.crearAnalizador(this.localStream);

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
        call.answer(this.localStream || undefined, this.opcionesLlamada);
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
    if (!this.permiteLlamar(remotePeerId)) return;
    if ((this.intentosFallidos.get(remotePeerId) || 0) >= 4) {
      console.warn(`⛔ Demasiados intentos fallidos con ${remotePeerId}, se deja de reintentar`);
      return;
    }

    console.log(`📞 Llamando a: ${remotePeerId}...`);
    try {
      const call = this.peer.call(remotePeerId, this.localStream, this.opcionesLlamada);
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
      audio.muted = !this.usarAudioEspacial && this.silenciados.has(remotePeerId);
      audio.play().catch(e => console.warn('Error autoplay audio:', e));
      this.audioElements.set(remotePeerId, audio);

      if (this.usarAudioEspacial) {
        const source = this.audioCtx.createMediaStreamSource(remoteStream);

        // Nivel para el indicador de habla (VOZ-02). Sólo en este modo: en
        // iOS/Safari pasar el stream remoto por Web Audio puede silenciar
        // también el <audio> de respaldo, así que ahí el indicador no se enciende.
        const analizador = this.audioCtx.createAnalyser();
        analizador.fftSize = this.bufferNivel.length;
        source.connect(analizador);
        this.analizadores.set(remotePeerId, analizador);

        const panner = this.audioCtx.createPanner();
        panner.panningModel = 'HRTF';
        panner.coneInnerAngle = 360;
        panner.coneOuterAngle = 360;

        panner.positionX.value = 0;
        panner.positionY.value = 0;
        panner.positionZ.value = 0;

        const ganancia = this.audioCtx.createGain();
        ganancia.gain.value = this.gananciaObjetivo(remotePeerId, false);
        source.connect(panner);
        panner.connect(ganancia);
        ganancia.connect(this.mezcla ?? this.audioCtx.destination);
        this.pannerNodes.set(remotePeerId, panner);
        this.ganancias.set(remotePeerId, ganancia);
        this.aplicarPerfil(remotePeerId);
      }

      // Aplicar la última posición conocida: si el avatar remoto está quieto,
      // nunca llegará un 'move' que corrija la posición por defecto (0,0,0).
      const pendiente = this.posicionesPendientes.get(remotePeerId);
      if (pendiente) this.updateSourcePosition(remotePeerId, pendiente);

      if (this.onCallConnectedCallback) {
        this.onCallConnectedCallback(remotePeerId);
      }
    });

    // Sólo si sigue siendo la llamada vigente: con las zonas una llamada vieja
    // puede terminar de cerrarse cuando ya se abrió otra con el mismo par.
    call.on('close', () => {
      if (this.activeCalls.get(remotePeerId) === call) this.removeUserAudio(remotePeerId);
    });

    call.on('error', (err: any) => {
      console.error(`Error en llamada con ${remotePeerId}:`, err);
      if (this.activeCalls.get(remotePeerId) === call) this.removeUserAudio(remotePeerId);
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

  // Respaldo para navegadores sin audio espacial remoto: la misma curva que
  // el PannerNode de ese perfil, aplicada al volumen del <audio>.
  private aplicarVolumenPorDistancia(remotePeerId: string, position: [number, number, number]) {
    const audio = this.audioElements.get(remotePeerId);
    if (!audio) return;
    const dx = position[0] - this.posicionListener[0];
    const dy = position[1] - this.posicionListener[1];
    const dz = position[2] - this.posicionListener[2];
    const distancia = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const ganancia = gananciaPorDistancia(distancia, this.perfilDe(remotePeerId), this.zona ?? 'campus');
    audio.volume = Math.min(1, Math.max(0, ganancia));
  }

  // --- Zonas de audio (VOZ-03) ---------------------------------------------

  /**
   * Activa las zonas: desde ahora las llamadas se abren y cuelgan solas según
   * la distancia y quién difunde. Los participantes se dan de alta con
   * registrarParticipante y sus posiciones llegan por updateSourcePosition.
   */
  public configurarZonas(tipo: TipoEspacio, soyDifusor: boolean) {
    this.zona = tipo;
    this.soyDifusor = soyDifusor;
    this.pannerNodes.forEach((_, peerId) => this.aplicarPerfil(peerId));
    if (this.intervalos.size === 0) {
      this.intervalos.add(setInterval(() => this.sincronizarZonas(), INTERVALO_ZONAS_MS));
      this.intervalos.add(setInterval(() => this.actualizarAtenuacionLateral(), INTERVALO_ATENUACION_MS));
    }
  }

  public registrarParticipante(remotePeerId: string, difunde: boolean) {
    if (!remotePeerId || this.destruido) return;
    this.participantes.set(remotePeerId, difunde);
    this.aplicarPerfil(remotePeerId);
    this.sincronizarZonas();
  }

  /** Quien salió del espacio: se cuelga y se olvida todo lo suyo. */
  public olvidarParticipante(remotePeerId: string) {
    this.participantes.delete(remotePeerId);
    this.posicionesPendientes.delete(remotePeerId);
    this.intentosFallidos.delete(remotePeerId);
    this.silenciados.delete(remotePeerId);
    this.removeUserAudio(remotePeerId);
  }

  /** Si hay una llamada abierta con ese participante (está en alcance de voz). */
  public estaConectadoCon(remotePeerId: string): boolean {
    return this.activeCalls.has(remotePeerId);
  }

  /**
   * Quién tiene la palabra en el aula (AULA-03), según el servidor. Mientras
   * la tenga difunde: todos abren llamada con esa persona y la oyen igual
   * desde cualquier punto. null cuando nadie la tiene.
   */
  public fijarPalabra(peerId: string | null, esMia: boolean) {
    this.peerConPalabra = esMia ? null : peerId;
    this.tengoPalabra = esMia;
    this.pannerNodes.forEach((_, id) => this.aplicarPerfil(id));
    this.sincronizarZonas();
  }

  private difunde(remotePeerId: string): boolean {
    return (this.participantes.get(remotePeerId) ?? false) || remotePeerId === this.peerConPalabra;
  }

  private yoDifundo(): boolean {
    return this.soyDifusor || this.tengoPalabra;
  }

  private miPeerId(): string {
    return this.peer?.id ?? this.userId;
  }

  private participanteVoz(remotePeerId: string) {
    return {
      posicion: this.posicionesPendientes.get(remotePeerId) ?? null,
      difusor: this.difunde(remotePeerId),
    };
  }

  // Con zonas sólo llama el de peerId menor y sólo si están en alcance;
  // también frena los reintentos tras un fallo de ICE cuando ya se alejaron.
  private permiteLlamar(remotePeerId: string): boolean {
    if (!this.zona || !this.participantes.has(remotePeerId)) return true;
    const { llamar } = planificarConexiones(
      this.miPeerId(),
      { posicion: this.posicionListener, difusor: this.yoDifundo() },
      new Map([[remotePeerId, this.participanteVoz(remotePeerId)]]),
      new Set(),
      this.zona,
      { grupos: this.modoGrupos }
    );
    return llamar.length === 1;
  }

  private sincronizarZonas() {
    if (!this.zona || !this.peer || this.peer.disconnected || this.destruido) return;
    const otros = new Map([...this.participantes.keys()].map((id) => [id, this.participanteVoz(id)]));
    const { llamar, colgar } = planificarConexiones(
      this.miPeerId(),
      { posicion: this.posicionListener, difusor: this.yoDifundo() },
      otros,
      new Set(this.activeCalls.keys()),
      this.zona,
      { grupos: this.modoGrupos }
    );
    colgar.forEach((peerId) => {
      console.log(`📴 ${peerId} salió del alcance de voz`);
      this.removeUserAudio(peerId);
    });
    llamar.forEach((peerId) => this.callUser(peerId));
    // Con mesas, el perfil de cada voz cambia al entrar o salir de una
    if (this.modoGrupos) this.pannerNodes.forEach((_, peerId) => this.aplicarPerfil(peerId));
  }

  /** Trabajo en grupos del aula (AULA-07), según lo anuncia el servidor. */
  public fijarModoGrupos(activo: boolean) {
    if (this.modoGrupos === activo) return;
    this.modoGrupos = activo;
    this.pannerNodes.forEach((_, peerId) => this.aplicarPerfil(peerId));
    this.sincronizarZonas();
  }

  private perfilDe(remotePeerId: string): PerfilAudicion {
    // Sin zonas se conserva la curva suave de siempre
    if (!this.zona) return 'sala';
    return perfilEntre(
      { posicion: this.posicionListener, difusor: this.yoDifundo() },
      this.participanteVoz(remotePeerId),
      this.zona,
      { grupos: this.modoGrupos }
    );
  }

  private aplicarPerfil(remotePeerId: string) {
    const panner = this.pannerNodes.get(remotePeerId);
    const perfil = this.perfilDe(remotePeerId);
    if (panner && this.perfilesAplicados.get(remotePeerId) !== perfil) {
      Object.assign(panner, parametrosPanner(perfil, this.zona ?? 'campus'));
      this.perfilesAplicados.set(remotePeerId, perfil);
    }
    const pos = this.posicionesPendientes.get(remotePeerId);
    if (!this.usarAudioEspacial && pos) this.aplicarVolumenPorDistancia(remotePeerId, pos);
  }

  // Mientras alguien que difunde está hablando, las voces de proximidad bajan
  // a ATENUACION_LATERAL. Sólo con Web Audio: en el respaldo de iOS/Safari no
  // hay analizadores de las voces remotas.
  private actualizarAtenuacionLateral() {
    if (!this.audioCtx || this.zona !== 'aula') return;
    const ahora = performance.now();
    for (const peerId of this.participantes.keys()) {
      if (this.difunde(peerId) && this.nivelDe(peerId) > UMBRAL_HABLA) this.ultimaVozDifusor = ahora;
    }
    this.aplicarGanancias(ahora - this.ultimaVozDifusor < RETENCION_ATENUACION_MS);
  }

  // Volumen final de cada voz: 0 si este usuario la silenció, ATENUACION_LATERAL
  // si es de proximidad y está hablando quien difunde, 1 en otro caso.
  private gananciaObjetivo(remotePeerId: string, clase: boolean): number {
    if (this.silenciados.has(remotePeerId)) return 0;
    return clase && this.perfilDe(remotePeerId) === 'proximidad' ? ATENUACION_LATERAL : 1;
  }

  private aplicarGanancias(clase = performance.now() - this.ultimaVozDifusor < RETENCION_ATENUACION_MS) {
    if (!this.audioCtx) return;
    const t = this.audioCtx.currentTime;
    this.ganancias.forEach((ganancia, peerId) => {
      const objetivo = this.gananciaObjetivo(peerId, clase);
      if (Math.abs(ganancia.gain.value - objetivo) < 0.01) return;
      // Baja rápido cuando empieza la clase, vuelve despacio cuando termina la frase
      ganancia.gain.setTargetAtTime(objetivo, t, objetivo < 1 ? 0.05 : 0.3);
    });
  }

  /** Deja de oír (o vuelve a oír) a un participante, sólo para este usuario (VOZ-04). */
  public silenciarParticipante(remotePeerId: string, silenciado: boolean) {
    if (silenciado) this.silenciados.add(remotePeerId);
    else this.silenciados.delete(remotePeerId);
    const audio = this.audioElements.get(remotePeerId);
    if (audio && !this.usarAudioEspacial) audio.muted = silenciado;
    this.aplicarGanancias();
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

  // Limitador en la mezcla (VOZ-07). Cada voz ya llega nivelada por el
  // autoGainControl de quien habla, pero varias a la vez se suman y saturan
  // la salida (recorte audible). Actúa sólo cerca del recorte (desde -6 dBFS)
  // y fuerte, con ataque rápido: medido en el navegador, una voz sola pasa
  // casi igual y cinco a la vez bajan de -1,4 a -4,3 dBFS de pico.
  private crearLimitador(ctx: AudioContext) {
    const limitador = ctx.createDynamicsCompressor();
    limitador.threshold.value = -6;
    limitador.knee.value = 3;
    limitador.ratio.value = 20;
    limitador.attack.value = 0.003;
    limitador.release.value = 0.25;
    limitador.connect(ctx.destination);
    const mezcla = ctx.createGain();
    mezcla.connect(limitador);
    this.mezcla = mezcla;
    this.limitador = limitador;
  }

  /** Cuántos dB está bajando el limitador ahora mismo (0 = no actúa). */
  public reduccionLimitador(): number {
    return this.limitador?.reduction ?? 0;
  }

  private crearAnalizador(stream: MediaStream): AnalyserNode | null {
    if (!this.audioCtx) return null;
    const analizador = this.audioCtx.createAnalyser();
    analizador.fftSize = this.bufferNivel.length;
    this.audioCtx.createMediaStreamSource(stream).connect(analizador);
    return analizador;
  }

  // RMS de la forma de onda (0..1). Se consulta en cada cuadro por avatar:
  // 256 muestras, sin asignar memoria.
  private nivelDeAnalizador(analizador: AnalyserNode | null | undefined): number {
    if (!analizador) return 0;
    analizador.getFloatTimeDomainData(this.bufferNivel);
    let suma = 0;
    for (let i = 0; i < this.bufferNivel.length; i++) suma += this.bufferNivel[i] * this.bufferNivel[i];
    return Math.sqrt(suma / this.bufferNivel.length);
  }

  /** Nivel de voz actual de otro participante (VOZ-02). */
  public nivelDe(remotePeerId: string): number {
    return this.nivelDeAnalizador(this.analizadores.get(remotePeerId));
  }

  /** Nivel de voz del micrófono propio; 0 si está silenciado o no hay micrófono. */
  public nivelLocal(): number {
    const pista = this.localStream?.getAudioTracks()[0];
    if (!pista || !pista.enabled) return 0;
    return this.nivelDeAnalizador(this.analizadorLocal);
  }

  // Estadísticas WebRTC de cada llamada activa (VOZ-05). Las tasas se calculan
  // contra la muestra anterior de cada llamada: quien consulte con su propio
  // ritmo (el panel, la prueba de carga) pasa su propio mapa de muestras.
  public async obtenerDiagnostico(
    muestras: Map<string, MuestraPrevia> = this.muestrasDiagnostico
  ): Promise<DiagnosticoVoz> {
    const peers = await Promise.all(
      [...this.activeCalls].map(async ([peerId, call]) => {
        const pc: RTCPeerConnection | undefined = call.peerConnection;
        if (!pc) return null;
        const reporte = await pc.getStats();
        const { diagnostico, muestra } = resumirEstadisticas(
          peerId, pc.iceConnectionState, reporte, muestras.get(peerId), Date.now()
        );
        muestras.set(peerId, muestra);
        return diagnostico;
      })
    );
    return totalizar(peers.filter((p): p is DiagnosticoPeer => p !== null));
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
    this.muestrasDiagnostico.delete(remotePeerId);

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
    this.ganancias.get(remotePeerId)?.disconnect();
    this.ganancias.delete(remotePeerId);
    this.perfilesAplicados.delete(remotePeerId);

    this.analizadores.get(remotePeerId)?.disconnect();
    this.analizadores.delete(remotePeerId);
  }

  // Cambiar de micrófono en vivo (VOZ-08): la pista nueva reemplaza a la
  // anterior en todas las llamadas con replaceTrack, sin renegociar.
  public async cambiarMicrofono(deviceId: string) {
    if (this.destruido || !this.audioCtx) return;
    let nuevo: MediaStream;
    try {
      nuevo = await navigator.mediaDevices.getUserMedia({
        audio: { ...RESTRICCIONES_VOZ, deviceId: { exact: deviceId } },
        video: false,
      });
    } catch (err) {
      console.warn('⚠️ No se pudo abrir el micrófono elegido:', err);
      return;
    }
    if (this.destruido) {
      nuevo.getTracks().forEach((t) => t.stop());
      return;
    }

    const pista = nuevo.getAudioTracks()[0];
    const anterior = this.localStream?.getAudioTracks()[0];
    // Conservar el estado de silencio que el usuario ya había elegido
    if (anterior) pista.enabled = anterior.enabled;

    await Promise.all(
      [...this.activeCalls.values()].map(async (call) => {
        const pc: RTCPeerConnection | undefined = call.peerConnection;
        const emisor = pc?.getSenders().find((s) => s.track?.kind === 'audio' || s.track === anterior);
        if (emisor) await emisor.replaceTrack(pista);
      })
    );

    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = nuevo;
    this.analizadorLocal = this.crearAnalizador(nuevo);
    if (!this.micDisponible) {
      this.micDisponible = true;
      this.emitirEstado('conectado');
    }
    console.log(`🎤 Micrófono cambiado a: ${pista.label}`);
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
    this.intervalos.forEach((id) => clearInterval(id));
    this.intervalos.clear();

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
    this.ganancias.forEach((ganancia) => ganancia.disconnect());
    this.ganancias.clear();
    this.perfilesAplicados.clear();
    this.participantes.clear();
    this.silenciados.clear();
    this.analizadores.forEach((analizador) => analizador.disconnect());
    this.analizadores.clear();
    this.analizadorLocal = null;
    this.mezcla?.disconnect();
    this.limitador?.disconnect();
    this.mezcla = null;
    this.limitador = null;
    this.posicionesPendientes.clear();
    this.intentosFallidos.clear();
    this.muestrasDiagnostico.clear();

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
