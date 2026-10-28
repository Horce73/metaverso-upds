import React, { useState } from 'react';
import {
  type Apariencia,
  ESTILOS_CABELLO,
  ESTILOS_VELLO,
  COMPLEXIONES,
  FORMAS_OJOS,
  CEJAS,
  EXPRESIONES,
  PRENDAS_SUPERIORES,
  PRENDAS_INFERIORES,
  CALZADOS,
  SOMBREROS,
  GAFAS,
  PALETA_PIEL,
  PALETA_CABELLO,
  PALETA_OJOS,
  PALETA_ROPA,
  PALETA_PANTALON,
  PALETA_CALZADO,
} from './personalizacion.js';

// Editor de la apariencia del avatar (AVATAR-01): el mismo en el registro, en
// el menú y en el panel ✨ dentro del mundo, para que las opciones no se
// desincronicen. No importa three.js (Login lo carga antes de entrar al 3D).

const PESTANAS = [
  { id: 'cuerpo', etiqueta: '🧍 Cuerpo' },
  { id: 'rostro', etiqueta: '🙂 Rostro' },
  { id: 'cabello', etiqueta: '💇 Cabello' },
  { id: 'ropa', etiqueta: '👕 Ropa' },
  { id: 'accesorios', etiqueta: '🎒 Accesorios' },
] as const;

type Pestana = (typeof PESTANAS)[number]['id'];

const Opciones = <T extends string>({
  titulo,
  opciones,
  valor,
  onElegir,
}: {
  titulo: string;
  opciones: readonly { id: T; etiqueta: string }[];
  valor: T;
  onElegir: (v: T) => void;
}) => (
  <fieldset className="editor-avatar-grupo">
    <legend>{titulo}</legend>
    <div className="editor-avatar-opciones">
      {opciones.map((o) => (
        <button key={o.id} type="button" aria-pressed={valor === o.id} className={valor === o.id ? 'activa' : ''} onClick={() => onElegir(o.id)}>
          {o.etiqueta}
        </button>
      ))}
    </div>
  </fieldset>
);

const Colores: React.FC<{ titulo: string; paleta: string[]; valor: string; onElegir: (c: string) => void }> = ({ titulo, paleta, valor, onElegir }) => (
  <fieldset className="editor-avatar-grupo">
    <legend>{titulo}</legend>
    <div className="editor-avatar-colores">
      {paleta.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`${titulo}: ${c}`}
          aria-pressed={valor === c}
          className={valor === c ? 'activa' : ''}
          style={{ background: c }}
          onClick={() => onElegir(c)}
        />
      ))}
      {/* Cualquier otro color con el selector del sistema */}
      <label className={`editor-avatar-otro ${paleta.includes(valor) ? '' : 'activa'}`} title="Otro color">
        <input type="color" value={valor} onChange={(e) => onElegir(e.target.value)} aria-label={`${titulo}: otro color`} />
        <span aria-hidden="true">＋</span>
      </label>
    </div>
  </fieldset>
);

const Interruptor: React.FC<{ etiqueta: string; valor: boolean; onCambiar: (v: boolean) => void }> = ({ etiqueta, valor, onCambiar }) => (
  <label className="editor-avatar-interruptor">
    <input type="checkbox" checked={valor} onChange={(e) => onCambiar(e.target.checked)} />
    <span>{etiqueta}</span>
  </label>
);

export const EditorApariencia: React.FC<{ apariencia: Apariencia; onCambiar: (a: Apariencia) => void }> = ({ apariencia: a, onCambiar }) => {
  const [pestana, setPestana] = useState<Pestana>('cuerpo');
  const cambiar = <K extends keyof Apariencia>(clave: K, parcial: Partial<Apariencia[K]>) =>
    onCambiar({ ...a, [clave]: typeof a[clave] === 'object' ? { ...(a[clave] as object), ...parcial } : parcial });

  return (
    <div className="editor-avatar">
      <div className="editor-avatar-pestanas" role="tablist" aria-label="Partes del avatar">
        {PESTANAS.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={pestana === p.id} className={pestana === p.id ? 'activa' : ''} onClick={() => setPestana(p.id)}>
            {p.etiqueta}
          </button>
        ))}
      </div>

      <div className="editor-avatar-cuerpo" role="tabpanel">
        {pestana === 'cuerpo' && (
          <>
            <Opciones titulo="Complexión" opciones={COMPLEXIONES} valor={a.cuerpo.complexion} onElegir={(complexion) => cambiar('cuerpo', { complexion })} />
            <fieldset className="editor-avatar-grupo">
              <legend>Estatura</legend>
              <input
                type="range"
                min={0.9}
                max={1.1}
                step={0.01}
                value={a.cuerpo.altura}
                onChange={(e) => cambiar('cuerpo', { altura: Number(e.target.value) })}
                aria-label="Estatura"
                className="editor-avatar-rango"
              />
            </fieldset>
            <Colores titulo="Tono de piel" paleta={PALETA_PIEL} valor={a.piel} onElegir={(piel) => onCambiar({ ...a, piel })} />
          </>
        )}

        {pestana === 'rostro' && (
          <>
            <Opciones titulo="Expresión" opciones={EXPRESIONES} valor={a.rostro.expresion} onElegir={(expresion) => cambiar('rostro', { expresion })} />
            <Opciones titulo="Ojos" opciones={FORMAS_OJOS} valor={a.rostro.ojos} onElegir={(ojos) => cambiar('rostro', { ojos })} />
            <Colores titulo="Color de ojos" paleta={PALETA_OJOS} valor={a.rostro.colorOjos} onElegir={(colorOjos) => cambiar('rostro', { colorOjos })} />
            <Opciones titulo="Cejas" opciones={CEJAS} valor={a.rostro.cejas} onElegir={(cejas) => cambiar('rostro', { cejas })} />
            <Interruptor etiqueta="Mejillas sonrosadas" valor={a.rostro.rubor} onCambiar={(rubor) => cambiar('rostro', { rubor })} />
            <Opciones titulo="Barba y bigote" opciones={ESTILOS_VELLO} valor={a.velloFacial.estilo} onElegir={(estilo) => cambiar('velloFacial', { estilo })} />
            {a.velloFacial.estilo !== 'ninguno' && (
              <Colores titulo="Color de barba" paleta={PALETA_CABELLO} valor={a.velloFacial.color} onElegir={(color) => cambiar('velloFacial', { color })} />
            )}
          </>
        )}

        {pestana === 'cabello' && (
          <>
            <Opciones titulo="Peinado" opciones={ESTILOS_CABELLO} valor={a.cabello.estilo} onElegir={(estilo) => cambiar('cabello', { estilo })} />
            <Colores titulo="Color de cabello" paleta={PALETA_CABELLO} valor={a.cabello.color} onElegir={(color) => cambiar('cabello', { color })} />
          </>
        )}

        {pestana === 'ropa' && (
          <>
            <Opciones titulo="Arriba" opciones={PRENDAS_SUPERIORES} valor={a.ropa.superior} onElegir={(superior) => cambiar('ropa', { superior })} />
            <Colores titulo="Color principal" paleta={PALETA_ROPA} valor={a.ropa.colorPrimario} onElegir={(colorPrimario) => cambiar('ropa', { colorPrimario })} />
            <Colores titulo="Color de detalles" paleta={PALETA_ROPA} valor={a.ropa.colorSecundario} onElegir={(colorSecundario) => cambiar('ropa', { colorSecundario })} />
            <Opciones titulo="Abajo" opciones={PRENDAS_INFERIORES} valor={a.ropa.inferior} onElegir={(inferior) => cambiar('ropa', { inferior })} />
            <Colores titulo="Color de abajo" paleta={PALETA_PANTALON} valor={a.ropa.colorInferior} onElegir={(colorInferior) => cambiar('ropa', { colorInferior })} />
            <Opciones titulo="Calzado" opciones={CALZADOS} valor={a.ropa.calzado} onElegir={(calzado) => cambiar('ropa', { calzado })} />
            <Colores titulo="Color del calzado" paleta={PALETA_CALZADO} valor={a.ropa.colorCalzado} onElegir={(colorCalzado) => cambiar('ropa', { colorCalzado })} />
          </>
        )}

        {pestana === 'accesorios' && (
          <>
            <Opciones titulo="En la cabeza" opciones={SOMBREROS} valor={a.accesorios.sombrero} onElegir={(sombrero) => cambiar('accesorios', { sombrero })} />
            {a.accesorios.sombrero !== 'ninguno' && (
              <Colores titulo="Color del sombrero" paleta={PALETA_ROPA} valor={a.accesorios.colorSombrero} onElegir={(colorSombrero) => cambiar('accesorios', { colorSombrero })} />
            )}
            <Opciones titulo="Gafas" opciones={GAFAS} valor={a.accesorios.gafas} onElegir={(gafas) => cambiar('accesorios', { gafas })} />
            <div className="editor-avatar-grupo">
              <Interruptor etiqueta="Mochila" valor={a.accesorios.mochila} onCambiar={(mochila) => cambiar('accesorios', { mochila })} />
              <Interruptor etiqueta="Bufanda" valor={a.accesorios.bufanda} onCambiar={(bufanda) => cambiar('accesorios', { bufanda })} />
              <Interruptor etiqueta="Audífonos" valor={a.accesorios.audifonos} onCambiar={(audifonos) => cambiar('accesorios', { audifonos })} />
            </div>
            {a.accesorios.mochila && (
              <Colores titulo="Color de la mochila" paleta={PALETA_ROPA} valor={a.accesorios.colorMochila} onElegir={(colorMochila) => cambiar('accesorios', { colorMochila })} />
            )}
            {a.accesorios.bufanda && (
              <Colores titulo="Color de la bufanda" paleta={PALETA_ROPA} valor={a.accesorios.colorBufanda} onElegir={(colorBufanda) => cambiar('accesorios', { colorBufanda })} />
            )}
          </>
        )}
      </div>
    </div>
  );
};
