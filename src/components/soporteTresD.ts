/** ¿Puede este navegador crear un contexto WebGL? Sin él no hay escena 3D (A11Y-04). */
export function hayWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return false;
    // Los contextos son un recurso limitado: se libera el de la prueba
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
