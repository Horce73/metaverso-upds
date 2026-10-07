// Captura de pantalla del docente para el aula (AULA-01, decisión 0002). En
// lugar de video por la malla (una copia codificada por alumno), se toma una
// imagen como mucho cada INTERVALO_MS, sólo si la pantalla cambió, y se sube
// una vez; el servidor la reenvía al aula.

const INTERVALO_MS = 500;
const ANCHO_MAX = 1440;
const ALTO_MAX = 900;
// Por debajo del tope del servidor (900 KB), con margen
const BYTES_OBJETIVO = 450_000;
// Miniatura para detectar cambios: 64 × 36 en escala de grises
const ANCHO_HUELLA = 64;
const ALTO_HUELLA = 36;
// Diferencia media por píxel (0..255) a partir de la cual se considera que cambió
const UMBRAL_CAMBIO = 1.5;

export interface CapturaPantalla {
  detener: () => void;
}

function codificar(lienzo: HTMLCanvasElement, tipo: string, calidad: number): Promise<Blob | null> {
  return new Promise((resolve) => lienzo.toBlob(resolve, tipo, calidad));
}

// WebP pesa bastante menos que JPEG para pantallas, pero Safari no lo codifica:
// toBlob devuelve PNG en ese caso, que el servidor rechaza. Ahí, JPEG.
async function aImagen(lienzo: HTMLCanvasElement): Promise<Blob | null> {
  for (const calidad of [0.8, 0.6, 0.45]) {
    let blob = await codificar(lienzo, 'image/webp', calidad);
    if (!blob || blob.type !== 'image/webp') blob = await codificar(lienzo, 'image/jpeg', calidad);
    if (blob && blob.size <= BYTES_OBJETIVO) return blob;
  }
  return null;
}

/**
 * Pide al navegador elegir una pantalla o ventana y empieza a enviar cuadros.
 * onFin se llama si el usuario corta desde el navegador ("Dejar de compartir").
 * Rechaza si el usuario cancela el selector o el navegador no lo permite.
 */
export async function iniciarCaptura(
  onCuadro: (datos: ArrayBuffer) => void,
  onFin: () => void
): Promise<CapturaPantalla> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 5, width: { max: ANCHO_MAX }, height: { max: ALTO_MAX } },
    audio: false,
  });
  const pista = stream.getVideoTracks()[0];
  pista.contentHint = 'detail';

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();

  const lienzo = document.createElement('canvas');
  const ctx = lienzo.getContext('2d')!;
  const huella = document.createElement('canvas');
  huella.width = ANCHO_HUELLA;
  huella.height = ALTO_HUELLA;
  const ctxHuella = huella.getContext('2d', { willReadFrequently: true })!;
  let anterior: Uint8ClampedArray | null = null;
  let ocupado = false;
  let activa = true;

  const cambio = (): boolean => {
    ctxHuella.drawImage(video, 0, 0, ANCHO_HUELLA, ALTO_HUELLA);
    const actual = ctxHuella.getImageData(0, 0, ANCHO_HUELLA, ALTO_HUELLA).data;
    if (!anterior) {
      anterior = actual;
      return true;
    }
    let suma = 0;
    for (let i = 0; i < actual.length; i += 4) {
      suma += Math.abs(actual[i] + actual[i + 1] + actual[i + 2] - anterior[i] - anterior[i + 1] - anterior[i + 2]) / 3;
    }
    const cambiado = suma / (ANCHO_HUELLA * ALTO_HUELLA) > UMBRAL_CAMBIO;
    if (cambiado) anterior = actual;
    return cambiado;
  };

  const tomar = async () => {
    if (!activa || ocupado || video.videoWidth === 0 || !cambio()) return;
    ocupado = true;
    try {
      const escala = Math.min(1, ANCHO_MAX / video.videoWidth, ALTO_MAX / video.videoHeight);
      lienzo.width = Math.round(video.videoWidth * escala);
      lienzo.height = Math.round(video.videoHeight * escala);
      ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height);
      const blob = await aImagen(lienzo);
      // Demasiado pesada aun con la calidad más baja: se reintenta en el próximo cambio
      if (!blob) anterior = null;
      else if (activa) onCuadro(await blob.arrayBuffer());
    } finally {
      ocupado = false;
    }
  };

  const intervalo = setInterval(tomar, INTERVALO_MS);
  tomar();

  const detener = () => {
    if (!activa) return;
    activa = false;
    clearInterval(intervalo);
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
  pista.addEventListener('ended', () => {
    detener();
    onFin();
  });
  return { detener };
}
