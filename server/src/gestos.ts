// Gestos del avatar (GESTO-01, RF-19). Lista cerrada: el servidor solo
// difunde ids conocidos. La misma lista vive en src/components/mundo3d/gestos.ts,
// que es quien los anima; pruebas/unidad/gestos.test.mjs verifica que coincidan.

export const GESTOS = ['saludar', 'aplaudir', 'asentir', 'negar', 'senalar'] as const;
export type Gesto = (typeof GESTOS)[number];

export const esGesto = (id: unknown): id is Gesto => (GESTOS as readonly unknown[]).includes(id);
