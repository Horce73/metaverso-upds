import React from 'react';

/**
 * Atrapa cualquier error de la escena 3D (no se pudo crear el contexto, se
 * cortó la descarga del paquete de three.js, un fallo de un componente) y
 * deja pasar al modo sin 3D en vez de dejar la pantalla en blanco.
 */
export class LimiteTresD extends React.Component<{ onFallo: (error: unknown) => void; children: React.ReactNode }, { fallo: boolean }> {
  state = { fallo: false };

  static getDerivedStateFromError() {
    return { fallo: true };
  }

  componentDidCatch(error: unknown) {
    console.error('La escena 3D falló, se pasa al modo sin 3D:', error);
    this.props.onFallo(error);
  }

  render() {
    return this.state.fallo ? null : this.props.children;
  }
}
