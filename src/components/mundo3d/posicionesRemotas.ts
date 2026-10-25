// Posición de cada avatar remoto, fuera del estado de React. Cada 'user_moved'
// entra directo al buffer de interpolación de ese socket (3D-03) y el
// AvatarModel lo lee en su useFrame. Si pasara por un setState, cada paquete
// re-renderizaría la App entera: con 30 personas caminando son cientos de
// renders por segundo y el hilo principal no da abasto.
import { crearEstado, recibir, type EstadoInterpolacion, type Vector3 } from './interpolacion.js';

export interface EstadoRemoto {
  interpolacion: EstadoInterpolacion;
  estaSentado: boolean;
}

const remotos = new Map<string, EstadoRemoto>();

export function registrarMovimiento(
  socketId: string,
  pos: Vector3,
  angulo: number,
  estaSentado: boolean,
  tEmisor: number | undefined,
  ahoraLocal: number
): void {
  let remoto = remotos.get(socketId);
  if (!remoto) {
    remoto = { interpolacion: crearEstado(), estaSentado: false };
    remotos.set(socketId, remoto);
  }
  recibir(remoto.interpolacion, pos, angulo, tEmisor, ahoraLocal);
  remoto.estaSentado = estaSentado;
}

export function estadoRemoto(socketId: string): EstadoRemoto | undefined {
  return remotos.get(socketId);
}

export function olvidarRemoto(socketId: string): void {
  remotos.delete(socketId);
}

export function olvidarRemotos(): void {
  remotos.clear();
}
