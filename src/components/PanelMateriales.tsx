import React, { useCallback, useEffect, useState } from 'react';
import {
  listarMateriales,
  subirMaterial,
  borrarMaterial,
  mostrarMaterial,
  tamanoLegible,
  EXTENSIONES_MATERIAL,
  LIMITE_MATERIAL_MB,
  ICONO_MATERIAL,
  type Material,
} from './materiales.js';

interface PanelMaterialesProps {
  token: string;
  espacioId: number | string;
  onAbrir: (material: Material) => void;
  onClose: () => void;
}

// Materiales de la asignatura del aula (AULA-06). Todos los inscritos los ven
// y abren; el docente titular además sube, borra y muestra uno a la clase.
export const PanelMateriales: React.FC<PanelMaterialesProps> = ({ token, espacioId, onAbrir, onClose }) => {
  const [materiales, setMateriales] = useState<Material[] | null>(null);
  const [puedeGestionar, setPuedeGestionar] = useState(false);
  const [error, setError] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [titulo, setTitulo] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(() => {
    listarMateriales(token, espacioId)
      .then((d) => {
        setMateriales(d.materiales);
        setPuedeGestionar(d.puedeGestionar);
        setError('');
      })
      .catch((e) => setError(e.message));
  }, [token, espacioId]);

  useEffect(cargar, [cargar]);

  const elegirArchivo = (f: File | null) => {
    setArchivo(f);
    setAviso('');
    if (f && !titulo) setTitulo(f.name.replace(/\.[^.]+$/, ''));
  };

  const subir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!archivo) return;
    if (archivo.size > LIMITE_MATERIAL_MB * 1024 * 1024) {
      setAviso(`⚠️ El archivo supera los ${LIMITE_MATERIAL_MB} MB.`);
      return;
    }
    setSubiendo(true);
    setAviso('');
    try {
      await subirMaterial(token, espacioId, archivo, titulo.trim() || archivo.name);
      setArchivo(null);
      setTitulo('');
      (e.target as HTMLFormElement).reset();
      setAviso('✅ Material subido.');
      cargar();
    } catch (err: any) {
      setAviso(`⚠️ ${err.message}`);
    } finally {
      setSubiendo(false);
    }
  };

  const borrar = async (m: Material) => {
    if (!confirm(`¿Borrar "${m.titulo}"? Los estudiantes ya no podrán abrirlo.`)) return;
    try {
      await borrarMaterial(token, m.id);
      cargar();
    } catch (err: any) {
      setAviso(`⚠️ ${err.message}`);
    }
  };

  const mostrar = async (m: Material) => {
    try {
      await mostrarMaterial(token, m.id, espacioId);
      setAviso(`📣 Mostrando "${m.titulo}" a la clase.`);
    } catch (err: any) {
      setAviso(`⚠️ ${err.message}`);
    }
  };

  return (
    <div className="panel-materiales glass-panel" role="dialog" aria-label="Materiales de la clase">
      <div className="panel-materiales__cabecera">
        <h3>📚 Materiales de la clase</h3>
        <button className="btn-secondary" onClick={onClose} aria-label="Cerrar materiales">
          Cerrar
        </button>
      </div>

      {puedeGestionar && (
        <form className="panel-materiales__subir" onSubmit={subir}>
          <input
            type="file"
            accept={EXTENSIONES_MATERIAL.map((e) => `.${e}`).join(',')}
            onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)}
            aria-label="Archivo"
          />
          <input
            type="text"
            placeholder="Título"
            value={titulo}
            maxLength={150}
            onChange={(e) => setTitulo(e.target.value)}
            aria-label="Título del material"
          />
          <button type="submit" className="btn-primary" disabled={!archivo || subiendo}>
            {subiendo ? 'Subiendo…' : 'Subir'}
          </button>
        </form>
      )}
      {aviso && <p className="panel-materiales__nota" role="status">{aviso}</p>}

      {error && <p className="panel-materiales__nota">⚠️ {error}</p>}
      {!error && materiales === null && <p className="panel-materiales__nota">Cargando…</p>}
      {materiales?.length === 0 && (
        <p className="panel-materiales__nota">
          {puedeGestionar ? 'Todavía no subiste materiales para esta asignatura.' : 'El docente todavía no subió materiales.'}
        </p>
      )}

      {materiales && materiales.length > 0 && (
        <ul className="panel-materiales__lista">
          {materiales.map((m) => (
            <li key={m.id}>
              <button type="button" className="panel-materiales__abrir" onClick={() => onAbrir(m)}>
                <span aria-hidden="true">{ICONO_MATERIAL[m.tipo]}</span>
                <span className="panel-materiales__titulo">{m.titulo}</span>
                <span className="panel-materiales__meta">
                  {m.extension.toUpperCase()} · {tamanoLegible(m.tamano_bytes)} · {new Date(m.subido_en).toLocaleDateString()}
                </span>
              </button>
              {puedeGestionar && (
                <span className="panel-materiales__gestion">
                  <button type="button" className="btn-secondary" onClick={() => mostrar(m)} title="Abrirlo en la pantalla de todos">
                    Mostrar a la clase
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => borrar(m)} aria-label={`Borrar ${m.titulo}`}>
                    🗑️
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
