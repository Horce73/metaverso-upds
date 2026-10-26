// Quién puede entrar a un aula (SEC-08). Antes lo decidía el navegador: el
// código se comparaba en el cliente (con '123456' como comodín) y el servidor
// aceptaba cualquier join_space. Ahora entra a un aula:
//   - un docente o administrador;
//   - quien tiene un pase para esa aula, que se obtiene con el código del
//     curso (POST /api/espacios/:id/acceso) o porque el docente aprobó su
//     solicitud de acceso.
// Los pases viven en memoria unas horas: alcanzan para recargar la página o
// salir al campus y volver durante la clase. Si el servidor se reinicia, se
// vuelve a escribir el código.
//
// Este archivo no toca la base, para poder probarlo; la ruta está en
// accesoAulaServidor.ts.
export const DURACION_PASE_MS = 12 * 60 * 60_000;

export class Pases {
  private vencen = new Map<string, number>();

  otorgar(usuarioId: number, espacioId: number, ahora = Date.now()) {
    this.vencen.set(`${usuarioId}:${espacioId}`, ahora + DURACION_PASE_MS);
  }

  tiene(usuarioId: number, espacioId: number, ahora = Date.now()): boolean {
    const clave = `${usuarioId}:${espacioId}`;
    const vence = this.vencen.get(clave);
    if (vence === undefined) return false;
    if (vence > ahora) return true;
    this.vencen.delete(clave);
    return false;
  }
}

export const pases = new Pases();

/** Mayúsculas y sin espacios alrededor: "  demo-101 " vale como "DEMO-101". */
export function codigoCoincide(escrito: unknown, codigo: string | null | undefined): boolean {
  if (typeof escrito !== 'string' || !codigo) return false;
  return escrito.trim().toUpperCase() === codigo.trim().toUpperCase();
}
