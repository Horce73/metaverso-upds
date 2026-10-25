// Acta de la clase (AULA-04): línea de tiempo y exportación, sin base de datos
// para poder probarlas. La grabación y las rutas están en grabacionServidor.ts.

/** Una captura de pantalla cada tanto: lo que importa es qué se mostró, no cada cuadro. */
export const INTERVALO_CAPTURA_MS = 15_000;

export function tocaCapturar(ultima: number | null, ahora: number, intervalo = INTERVALO_CAPTURA_MS): boolean {
  return ultima === null || ahora - ultima >= intervalo;
}

export type TipoEventoActa =
  | 'grabacion_inicio'
  | 'grabacion_fin'
  | 'entrada'
  | 'salida'
  | 'chat'
  | 'subtitulo'
  | 'pantalla'
  | 'material'
  | 'encuesta';

export interface EventoActa {
  tipo: TipoEventoActa;
  en: string; // ISO
  autor?: string;
  texto?: string;
  /** id del evento de captura, para pedir la imagen */
  capturaId?: string;
  /** encuesta: opciones y votos al cerrar */
  opciones?: { texto: string; votos: number }[];
}

/** Ordena por hora; a igual hora, el orden en que se agregaron. */
export function ordenarActa(eventos: EventoActa[]): EventoActa[] {
  return eventos
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.en.localeCompare(b.e.en) || a.i - b.i)
    .map(({ e }) => e);
}

export function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const ETIQUETA: Record<TipoEventoActa, string> = {
  grabacion_inicio: '⏺ Empieza la grabación',
  grabacion_fin: '⏹ Termina la grabación',
  entrada: '→ Entra',
  salida: '← Sale',
  chat: '💬',
  subtitulo: '🗣️',
  pantalla: '📽️ Pantalla compartida',
  material: '📚 Material mostrado',
  encuesta: '📊 Encuesta',
};

/**
 * Acta como un único archivo HTML, legible sin conexión: las capturas van
 * embebidas (data URI). Todo texto que vino de usuarios pasa por escaparHtml.
 */
export function actaHtml(
  titulo: string,
  subtitulo: string,
  eventos: EventoActa[],
  hora: (iso: string) => string,
  captura: (id: string) => string | null
): string {
  const filas = eventos
    .map((e) => {
      const cuerpo: string[] = [];
      if (e.autor) cuerpo.push(`<strong>${escaparHtml(e.autor)}</strong>`);
      if (e.texto) cuerpo.push(escaparHtml(e.texto));
      if (e.opciones) {
        const total = e.opciones.reduce((a, o) => a + o.votos, 0);
        cuerpo.push(
          `<ul>${e.opciones.map((o) => `<li>${escaparHtml(o.texto)}: ${o.votos}${total ? ` (${Math.round((o.votos / total) * 100)}%)` : ''}</li>`).join('')}</ul>`
        );
      }
      const img = e.capturaId ? captura(e.capturaId) : null;
      if (img) cuerpo.push(`<img src="${img}" alt="Pantalla compartida a las ${escaparHtml(hora(e.en))}">`);
      return `<li class="${e.tipo}"><time>${escaparHtml(hora(e.en))}</time> <span class="tipo">${ETIQUETA[e.tipo]}</span> ${cuerpo.join(' ')}</li>`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escaparHtml(titulo)}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:860px;margin:2rem auto;padding:0 1rem;color:#0f172a;line-height:1.5}
h1{font-size:1.4rem;margin-bottom:.2rem}p.sub{color:#475569;margin-top:0}
ol{list-style:none;padding:0}li{padding:.4rem 0;border-bottom:1px solid #e2e8f0}
time{color:#64748b;font-variant-numeric:tabular-nums;margin-right:.4rem}.tipo{color:#334155}
li.entrada,li.salida,li.grabacion_inicio,li.grabacion_fin{color:#64748b;font-size:.9rem}
img{display:block;max-width:100%;margin-top:.4rem;border:1px solid #cbd5e1;border-radius:6px}
</style></head><body>
<h1>${escaparHtml(titulo)}</h1><p class="sub">${escaparHtml(subtitulo)}</p>
<ol>
${filas}
</ol>
</body></html>
`;
}
