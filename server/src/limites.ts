import rateLimit from 'express-rate-limit';

// Limites de tasa (SEC-04). Dimensionados para un aula de 30 estudiantes que
// comparten una misma IP publica (NAT de la universidad): frenan bucles de
// fuerza bruta e inundaciones sin estorbar a una clase entera entrando a la vez.

const respuesta = (error: string) => ({
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false,
  message: { error }
});

// Presupuesto general de la API por IP.
export const limiteApi = rateLimit({
  windowMs: 60_000,
  limit: 600,
  ...respuesta('Demasiadas peticiones. Espera un momento e intenta de nuevo.')
});

// Solo cuentan los intentos fallidos: el bloqueo por cuenta (5 intentos) frena
// a quien ataca una cuenta; esto frena a quien prueba muchas cuentas.
export const limiteLogin = rateLimit({
  windowMs: 15 * 60_000,
  limit: 50,
  skipSuccessfulRequests: true,
  ...respuesta('Demasiados intentos de inicio de sesión desde tu red. Intenta en unos minutos.')
});

export const limiteRegistro = rateLimit({
  windowMs: 60 * 60_000,
  limit: 50,
  ...respuesta('Demasiados registros desde tu red. Intenta más tarde.')
});

export const limiteInvitado = rateLimit({
  windowMs: 15 * 60_000,
  limit: 60,
  ...respuesta('Demasiados ingresos como invitado desde tu red. Intenta en unos minutos.')
});

// Limitador de ventana fija para eventos de un socket: devuelve true mientras
// quede cupo en la ventana actual. Cada socket tiene los suyos.
export function limitador(max: number, ventanaMs: number): () => boolean {
  let inicio = 0;
  let usados = 0;
  return () => {
    const ahora = Date.now();
    if (ahora - inicio >= ventanaMs) {
      inicio = ahora;
      usados = 0;
    }
    usados++;
    return usados <= max;
  };
}

// Cupos por evento de socket. `draw_stroke` se emite por cada movimiento del
// mouse y `move` a 25 por segundo, de ahi su holgura.
export const CUPOS_SOCKET: Record<string, [max: number, ventanaMs: number]> = {
  join_space: [10, 60_000],
  move: [40, 1_000],
  draw_stroke: [150, 1_000],
  clear_board: [10, 10_000],
  get_pizarra_state: [20, 10_000],
  save_pizarra: [5, 60_000],
  solicitar_acceso_aula: [5, 60_000],
  responder_solicitud_acceso: [30, 60_000],
  clase_iniciada: [5, 60_000],
  clase_finalizada: [5, 60_000],
  chat: [10, 10_000]
};
