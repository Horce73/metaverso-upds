import React, { useEffect, useState } from 'react';
import { urlDeMaterial, ICONO_MATERIAL, type Material } from './materiales.js';

interface VisorMaterialProps {
  token: string;
  material: Material;
  /** Texto arriba del visor, p. ej. quién lo está mostrando a la clase. */
  aviso?: string;
  onClose: () => void;
}

// Abre un material del aula (AULA-06). PDF e imágenes se ven aquí mismo; el
// resto (o un archivo que el servidor no sirve en línea) se ofrece para descargar.
export const VisorMaterial: React.FC<VisorMaterialProps> = ({ token, material, aviso, onClose }) => {
  const [archivo, setArchivo] = useState<{ url: string; enLinea: boolean } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let url: string | null = null;
    let activo = true;
    setArchivo(null);
    setError('');
    urlDeMaterial(token, material.id)
      .then((a) => {
        url = a.url;
        if (activo) setArchivo(a);
        else URL.revokeObjectURL(a.url);
      })
      .catch((e) => activo && setError(e.message));
    return () => {
      activo = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [token, material.id]);

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [onClose]);

  const nombre = `${material.titulo}.${material.extension}`;
  return (
    <div className="visor-material" role="dialog" aria-modal="true" aria-label={material.titulo}>
      <div className="visor-material__marco glass-panel">
        <div className="visor-material__cabecera">
          <div>
            {aviso && <p className="visor-material__aviso">{aviso}</p>}
            <h3>
              {ICONO_MATERIAL[material.tipo]} {material.titulo}
            </h3>
          </div>
          <div className="visor-material__acciones">
            {archivo && (
              <a className="btn-secondary" href={archivo.url} download={nombre}>
                Descargar
              </a>
            )}
            <button className="btn-secondary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
        <div className="visor-material__contenido">
          {error && <p className="visor-material__nota">⚠️ {error}</p>}
          {!error && !archivo && <p className="visor-material__nota">Cargando…</p>}
          {archivo && archivo.enLinea && material.tipo === 'pdf' && (
            <iframe title={material.titulo} src={archivo.url} />
          )}
          {archivo && archivo.enLinea && material.tipo === 'imagen' && <img src={archivo.url} alt={material.titulo} />}
          {archivo && !archivo.enLinea && (
            <p className="visor-material__nota">
              Este archivo no se puede ver en el navegador.{' '}
              <a href={archivo.url} download={nombre}>
                Descargar {nombre}
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
