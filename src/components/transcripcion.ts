// Subtítulos en vivo (A11Y-01). Quien habla transcribe su propia voz con la
// Web Speech API del navegador y manda el texto por socket; los demás lo ven
// como subtítulo. Sirve a estudiantes sordos, a quien no tiene audio y a quien
// está en un lugar ruidoso.

export interface EventoSubtitulo {
  socketId: string;
  nombre: string;
  texto: string;
  /** false mientras la frase sigue (resultado parcial), true al cerrarla */
  final: boolean;
}

export interface LineaSubtitulo extends EventoSubtitulo {
  /** Hasta cuándo se muestra (performance.now / Date.now, en ms) */
  hasta: number;
}

/** Una frase terminada queda en pantalla este tiempo. */
export const DURACION_FINAL_MS = 6000;
/** Un parcial que deja de actualizarse (se cortó la red, dejó de hablar) se va antes. */
export const DURACION_PARCIAL_MS = 4000;
export const MAX_LINEAS = 3;

/**
 * Agrega un evento a las líneas visibles. El parcial de una persona se
 * reemplaza con cada actualización y con su versión final, en vez de apilar
 * una línea nueva por cada palabra reconocida.
 */
export function recibirSubtitulo(lineas: LineaSubtitulo[], evento: EventoSubtitulo, ahora: number): LineaSubtitulo[] {
  const nueva: LineaSubtitulo = { ...evento, hasta: ahora + (evento.final ? DURACION_FINAL_MS : DURACION_PARCIAL_MS) };
  const vivas = vigentes(lineas, ahora);
  const abierta = vivas.findIndex((l) => l.socketId === evento.socketId && !l.final);
  const resultado = abierta >= 0 ? vivas.map((l, i) => (i === abierta ? nueva : l)) : [...vivas, nueva];
  return resultado.slice(-MAX_LINEAS);
}

export function vigentes(lineas: LineaSubtitulo[], ahora: number): LineaSubtitulo[] {
  return lineas.filter((l) => l.hasta > ahora);
}

// --- Reconocimiento de voz del navegador -----------------------------------

interface ResultadoVoz {
  isFinal: boolean;
  0: { transcript: string };
}
interface EventoVoz {
  resultIndex: number;
  results: ArrayLike<ResultadoVoz>;
}
interface ReconocedorVoz {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: EventoVoz) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}

function constructorReconocedor(): (new () => ReconocedorVoz) | null {
  const w = window as unknown as { SpeechRecognition?: new () => ReconocedorVoz; webkitSpeechRecognition?: new () => ReconocedorVoz };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Chrome y Edge sí; Firefox no. Safari depende de la versión. */
export function puedeTranscribir(): boolean {
  return typeof window !== 'undefined' && constructorReconocedor() !== null;
}

// Entre un parcial y el siguiente: suficiente para leerse en vivo sin mandar
// un mensaje por cada palabra reconocida.
const INTERVALO_PARCIAL_MS = 300;

/**
 * Transcribe la voz propia mientras está activo. El reconocedor del navegador
 * se detiene solo tras un silencio o un error de red; mientras siga activo,
 * se vuelve a arrancar.
 */
export class Transcriptor {
  private reconocedor: ReconocedorVoz | null = null;
  private activo = false;
  private ultimoParcial = 0;

  // Sin "parameter properties": las pruebas importan este archivo con el
  // borrado de tipos de Node, que no las admite.
  private readonly alTexto: (texto: string, final: boolean) => void;
  private readonly alError: (error: string) => void;

  constructor(alTexto: (texto: string, final: boolean) => void, alError: (error: string) => void) {
    this.alTexto = alTexto;
    this.alError = alError;
  }

  iniciar(): void {
    const Reconocedor = constructorReconocedor();
    if (!Reconocedor || this.activo) return;
    this.activo = true;
    const r = new Reconocedor();
    r.lang = navigator.language?.startsWith('es') ? navigator.language : 'es-BO';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const resultado = e.results[i];
        const texto = resultado[0].transcript.trim();
        if (!texto) continue;
        const ahora = performance.now();
        if (resultado.isFinal || ahora - this.ultimoParcial >= INTERVALO_PARCIAL_MS) {
          this.ultimoParcial = ahora;
          this.alTexto(texto, resultado.isFinal);
        }
      }
    };
    r.onerror = (e) => {
      // Sin permiso de micrófono no tiene sentido reintentar
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.activo = false;
        this.alError(e.error);
      }
    };
    r.onend = () => {
      if (this.activo) {
        try {
          r.start();
        } catch {
          // ya arrancado
        }
      }
    };
    this.reconocedor = r;
    try {
      r.start();
    } catch {
      // ya arrancado
    }
  }

  detener(): void {
    this.activo = false;
    this.reconocedor?.stop();
    this.reconocedor = null;
  }
}
