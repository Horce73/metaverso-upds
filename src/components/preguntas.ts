// Estado de la cola de preguntas del aula (AULA-03), tal como lo publica el servidor.
export interface EstadoPreguntas {
  cola: { socketId: string; nombre: string; desde: number }[];
  palabra: { socketId: string; nombre: string; peerId: string } | null;
}

export const SIN_PREGUNTAS: EstadoPreguntas = { cola: [], palabra: null };
