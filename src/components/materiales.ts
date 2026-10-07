// Materiales del aula (AULA-06): tipos y llamadas a la API compartidos por el
// panel y el visor. Los archivos se piden con el token en la cabecera, así
// que se abren como blob y no con un enlace directo.

export interface Material {
  id: number;
  titulo: string;
  tipo: 'pdf' | 'ppt' | 'pptx' | 'imagen' | 'otro';
  extension: string;
  tamano_bytes: number | null;
  subido_en: string;
  subido_por?: string;
}

export const EXTENSIONES_MATERIAL = ['pdf', 'ppt', 'pptx', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'zip'];
export const LIMITE_MATERIAL_MB = 20;

async function error(res: Response): Promise<Error> {
  const data = await res.json().catch(() => null);
  return new Error(data?.error || `Error ${res.status}`);
}

export async function listarMateriales(token: string, espacioId: number | string) {
  const res = await fetch(`/api/aulas/${espacioId}/materiales`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw await error(res);
  return (await res.json()) as { puedeGestionar: boolean; materiales: Material[] };
}

export async function subirMaterial(token: string, espacioId: number | string, archivo: File, titulo: string) {
  const res = await fetch(
    `/api/aulas/${espacioId}/materiales?titulo=${encodeURIComponent(titulo)}&nombre=${encodeURIComponent(archivo.name)}`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: archivo }
  );
  if (!res.ok) throw await error(res);
  return (await res.json()) as Material;
}

export async function borrarMaterial(token: string, id: number) {
  const res = await fetch(`/api/materiales/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw await error(res);
}

export async function mostrarMaterial(token: string, id: number, espacioId: number | string) {
  const res = await fetch(`/api/materiales/${id}/mostrar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ espacioId }),
  });
  if (!res.ok) throw await error(res);
}

/** Descarga el archivo y devuelve un blob URL que quien lo pide debe revocar. */
export async function urlDeMaterial(token: string, id: number) {
  const res = await fetch(`/api/materiales/${id}/archivo`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw await error(res);
  const enLinea = (res.headers.get('content-disposition') || '').startsWith('inline');
  return { url: URL.createObjectURL(await res.blob()), enLinea };
}

export function tamanoLegible(bytes: number | null) {
  if (bytes === null) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const ICONO_MATERIAL: Record<Material['tipo'], string> = {
  pdf: '📄',
  ppt: '📊',
  pptx: '📊',
  imagen: '🖼️',
  otro: '📎',
};
