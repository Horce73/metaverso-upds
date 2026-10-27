import React from 'react';
import * as THREE from 'three';
import type { Apariencia } from './personalizacion.js';

// Cuerpo del avatar (AVATAR-01): low-poly de sombreado plano, proporciones de
// persona en vez de bloques. Las articulaciones quedan donde estaban (cadera a
// 1,0, hombros a 1,6, cabeza a 1,95) para que caminar, sentarse y el nombre
// encima sigan igual. Geometrías y materiales se comparten entre todos los
// avatares: con 30 personas en el aula no se crean 30 copias de cada pieza.

const geometrias = new Map<string, THREE.BufferGeometry>();
const materiales = new Map<string, THREE.MeshStandardMaterial>();

function geo(clave: string, crear: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geometrias.get(clave);
  if (!g) {
    g = crear();
    geometrias.set(clave, g);
  }
  return g;
}

const cil = (rArriba: number, rAbajo: number, alto: number, lados = 7) =>
  geo(`c${rArriba}:${rAbajo}:${alto}:${lados}`, () => new THREE.CylinderGeometry(rArriba, rAbajo, alto, lados));
const caja = (x: number, y: number, z: number) => geo(`b${x}:${y}:${z}`, () => new THREE.BoxGeometry(x, y, z));
const ico = (r: number, detalle = 0) => geo(`i${r}:${detalle}`, () => new THREE.IcosahedronGeometry(r, detalle));
const casquete = (r: number, fin: number) =>
  geo(`s${r}:${fin}`, () => new THREE.SphereGeometry(r, 9, 6, 0, Math.PI * 2, 0, fin));
const aro = (r: number, tubo: number, tramos = 12, lados = 6) =>
  geo(`t${r}:${tubo}:${tramos}:${lados}`, () => new THREE.TorusGeometry(r, tubo, lados, tramos));

function mat(color: string, rugosidad = 0.75, metalicidad = 0): THREE.MeshStandardMaterial {
  const clave = `${color}:${rugosidad}:${metalicidad}`;
  let m = materiales.get(clave);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rugosidad, metalness: metalicidad, flatShading: true });
    materiales.set(clave, m);
  }
  return m;
}

function tono(hex: string, f: number): string {
  return `#${new THREE.Color(hex).multiplyScalar(f).getHexString()}`;
}

type P = { position?: [number, number, number]; rotation?: [number, number, number]; scale?: [number, number, number] | number };

/** Malla con geometría y material compartidos. `detalle`: se oculta lejos de la cámara (3D-02). */
const M: React.FC<P & { g: THREE.BufferGeometry; m: THREE.Material; sombra?: boolean; detalle?: boolean }> = ({
  g,
  m,
  sombra,
  detalle,
  ...p
}) => <mesh geometry={g} material={m} castShadow={!!sombra} userData={detalle ? { detalle: true } : undefined} {...p} />;

const ANCHO: Record<Apariencia['cuerpo']['complexion'], number> = { delgada: 0.86, media: 1, robusta: 1.2 };

export interface RefsCuerpo {
  brazoDer: React.RefObject<THREE.Group | null>;
  brazoIzq: React.RefObject<THREE.Group | null>;
  piernaDer: React.RefObject<THREE.Group | null>;
  piernaIzq: React.RefObject<THREE.Group | null>;
}

export const CuerpoAvatar: React.FC<{ a: Apariencia; refs: RefsCuerpo; rostro: THREE.Texture }> = ({ a, refs, rostro }) => {
  const w = ANCHO[a.cuerpo.complexion];
  const piel = mat(a.piel, 0.6);
  const prenda = mat(a.ropa.colorPrimario, 0.8);
  const detalleRopa = mat(a.ropa.colorSecundario, 0.8);
  const pantalon = mat(a.ropa.colorInferior, a.ropa.inferior === 'jean' ? 0.95 : 0.85);
  const manga = a.ropa.superior === 'polera' ? 'corta' : 'larga';
  const piernaDesnuda = a.ropa.inferior === 'falda' ? 1 : a.ropa.inferior === 'short' ? 0.55 : 0;

  return (
    <group>
      {/* Piernas: pivote en la cadera */}
      {([
        [refs.piernaDer, -0.12],
        [refs.piernaIzq, 0.12],
      ] as const).map(([ref, x]) => (
        <group key={x} ref={ref} position={[x * w, 1.0, 0]}>
          {piernaDesnuda < 1 && (
            <M g={cil(0.1 * w, 0.075 * w, 0.86 * (1 - piernaDesnuda))} m={pantalon} position={[0, -0.43 * (1 - piernaDesnuda), 0]} sombra />
          )}
          {piernaDesnuda > 0 && (
            <M g={cil(0.075 * w, 0.065 * w, 0.86 * piernaDesnuda)} m={piel} position={[0, -0.86 + 0.43 * piernaDesnuda, 0]} sombra />
          )}
          {a.ropa.inferior === 'buzo' && (
            <M g={caja(0.02, 0.84, 0.03)} m={detalleRopa} position={[x > 0 ? 0.09 * w : -0.09 * w, -0.43, 0]} detalle />
          )}
          <Calzado a={a} />
        </group>
      ))}

      {/* Cadera y falda */}
      <M g={cil(0.2 * w, 0.21 * w, 0.2)} m={a.ropa.inferior === 'falda' ? mat(a.ropa.colorInferior, 0.85) : pantalon} position={[0, 1.02, 0]} scale={[1, 1, 0.7]} sombra />
      {a.ropa.inferior === 'falda' && (
        <M g={cil(0.21 * w, 0.33 * w, 0.42, 9)} m={mat(a.ropa.colorInferior, 0.85)} position={[0, 0.82, 0]} scale={[1, 1, 0.78]} sombra />
      )}

      {/* Torso y prenda de arriba */}
      <M g={cil(0.25 * w, 0.2 * w, 0.62, 8)} m={prenda} position={[0, 1.33, 0]} scale={[1, 1, 0.64]} sombra />
      <PrendaSuperior a={a} w={w} />

      {/* Brazos: pivote en el hombro */}
      {([
        [refs.brazoDer, -1],
        [refs.brazoIzq, 1],
      ] as const).map(([ref, lado]) => (
        <group key={lado} ref={ref} position={[lado * 0.3 * w, 1.6, 0]}>
          <M g={ico(0.085 * w)} m={prenda} position={[0, -0.02, 0]} />
          {manga === 'larga' ? (
            <M g={cil(0.078 * w, 0.066 * w, 0.6)} m={prenda} position={[0, -0.3, 0]} sombra />
          ) : (
            <>
              <M g={cil(0.08 * w, 0.075 * w, 0.24)} m={prenda} position={[0, -0.12, 0]} sombra />
              <M g={cil(0.064 * w, 0.058 * w, 0.38)} m={piel} position={[0, -0.42, 0]} sombra />
            </>
          )}
          {a.ropa.superior === 'deportiva' && <M g={caja(0.03, 0.56, 0.03)} m={detalleRopa} position={[lado * 0.07 * w, -0.3, 0]} detalle />}
          {(a.ropa.superior === 'chompa' || a.ropa.superior === 'camisa') && (
            <M g={cil(0.072 * w, 0.072 * w, 0.06)} m={a.ropa.superior === 'chompa' ? detalleRopa : prenda} position={[0, -0.58, 0]} detalle />
          )}
          <M g={ico(0.072)} m={piel} position={[0, -0.67, 0]} scale={[1, 1.15, 0.85]} />
        </group>
      ))}

      <Cabeza a={a} rostro={rostro} piel={piel} />
      <Accesorios a={a} w={w} />
    </group>
  );
};

const Calzado: React.FC<{ a: Apariencia }> = ({ a }) => {
  const c = mat(a.ropa.colorCalzado, 0.6);
  if (a.ropa.calzado === 'botas') {
    return (
      <group>
        <M g={cil(0.085, 0.09, 0.3)} m={c} position={[0, -0.78, 0]} sombra />
        <M g={caja(0.17, 0.09, 0.3)} m={c} position={[0, -0.91, 0.05]} sombra />
      </group>
    );
  }
  if (a.ropa.calzado === 'zapatos') {
    return (
      <group>
        <M g={caja(0.15, 0.09, 0.28)} m={c} position={[0, -0.9, 0.05]} sombra />
        <M g={caja(0.155, 0.03, 0.285)} m={mat(tono(a.ropa.colorCalzado, 0.5))} position={[0, -0.95, 0.05]} detalle />
      </group>
    );
  }
  return (
    <group>
      <M g={caja(0.16, 0.1, 0.29)} m={c} position={[0, -0.89, 0.05]} sombra />
      <M g={caja(0.17, 0.045, 0.3)} m={mat('#f1f5f9', 0.7)} position={[0, -0.945, 0.055]} detalle />
    </group>
  );
};

const PrendaSuperior: React.FC<{ a: Apariencia; w: number }> = ({ a, w }) => {
  const sec = mat(a.ropa.colorSecundario, 0.8);
  const prim = mat(a.ropa.colorPrimario, 0.8);
  const frente = 0.165 * w * 0.64 + 0.005;
  switch (a.ropa.superior) {
    case 'polera':
      return (
        <group>
          <M g={aro(0.085, 0.02, 10)} m={sec} position={[0, 1.64, 0]} rotation={[Math.PI / 2, 0, 0]} detalle />
          <M g={cil(0.243 * w, 0.236 * w, 0.07, 8)} m={sec} position={[0, 1.42, 0]} scale={[1.01, 1, 0.65]} detalle />
        </group>
      );
    case 'camisa':
      return (
        <group>
          <M g={caja(0.03, 0.56, 0.02)} m={sec} position={[0, 1.33, frente]} detalle />
          {[-1, 1].map((l) => (
            <M key={l} g={caja(0.12, 0.05, 0.1)} m={sec} position={[l * 0.06, 1.65, 0.07]} rotation={[0.5, 0, l * -0.5]} detalle />
          ))}
        </group>
      );
    case 'chompa':
      return (
        <group>
          <M g={cil(0.09, 0.1, 0.13)} m={prim} position={[0, 1.67, 0]} />
          <M g={cil(0.208 * w, 0.208 * w, 0.08, 8)} m={sec} position={[0, 1.06, 0]} scale={[1.01, 1, 0.66]} detalle />
          {[1.2, 1.34, 1.48].map((y) => (
            <M key={y} g={cil(0.22 * w + (y - 1.06) * 0.07, 0.22 * w + (y - 1.06) * 0.07, 0.025, 8)} m={sec} position={[0, y, 0]} scale={[1.02, 1, 0.66]} detalle />
          ))}
        </group>
      );
    case 'deportiva':
      return (
        <group>
          <M g={caja(0.02, 0.6, 0.02)} m={mat('#d1d5db', 0.4, 0.6)} position={[0, 1.33, frente]} detalle />
          {/* Capucha caída en la espalda */}
          <M g={casquete(0.15, Math.PI / 2)} m={prim} position={[0, 1.6, -0.12]} rotation={[-2.2, 0, 0]} detalle />
          <M g={cil(0.208 * w, 0.208 * w, 0.06, 8)} m={sec} position={[0, 1.06, 0]} scale={[1.01, 1, 0.66]} detalle />
        </group>
      );
    case 'saco': {
      // Camisa a la vista en V y solapas
      const v = new THREE.Shape();
      v.moveTo(-0.09, 0.2);
      v.lineTo(0.09, 0.2);
      v.lineTo(0, -0.08);
      v.closePath();
      return (
        <group>
          <mesh geometry={geo('vSaco', () => new THREE.ShapeGeometry(v))} material={sec} position={[0, 1.44, frente + 0.004]} userData={{ detalle: true }} />
          {[-1, 1].map((l) => (
            <M key={l} g={caja(0.05, 0.26, 0.02)} m={mat(tono(a.ropa.colorPrimario, 0.75))} position={[l * 0.06, 1.5, frente + 0.008]} rotation={[0, 0, l * 0.32]} detalle />
          ))}
          {[1.3, 1.2].map((y) => (
            <M key={y} g={ico(0.016)} m={mat('#1f2937')} position={[0, y, frente + 0.01]} detalle />
          ))}
        </group>
      );
    }
  }
};

const Cabeza: React.FC<{ a: Apariencia; rostro: THREE.Texture; piel: THREE.Material }> = ({ a, rostro, piel }) => (
  <group position={[0, 1.95, 0]}>
    <M g={cil(0.065, 0.075, 0.14)} m={piel} position={[0, -0.25, 0]} />
    <M g={ico(0.25, 1)} m={piel} scale={[0.96, 1.08, 0.96]} sombra />
    {[-1, 1].map((l) => (
      <M key={l} g={ico(0.055)} m={piel} position={[l * 0.235, -0.01, 0]} scale={[0.6, 1, 1]} detalle />
    ))}
    <M g={ico(0.035)} m={mat(tono(a.piel, 0.92), 0.6)} position={[0, -0.04, 0.235]} scale={[1, 1.2, 1]} detalle />
    <mesh position={[0, -0.035, 0.228]} userData={{ detalle: true }}>
      <planeGeometry args={[0.44, 0.44]} />
      <meshBasicMaterial map={rostro} transparent alphaTest={0.05} depthWrite={false} />
    </mesh>
    <Cabello a={a} />
    <VelloFacial a={a} />
  </group>
);

const Cabello: React.FC<{ a: Apariencia }> = ({ a }) => {
  const { estilo, color } = a.cabello;
  if (estilo === 'calvo') return null;
  const c = mat(color, 0.85);
  // Inclinado hacia atrás: tapa la nuca y deja libre la frente y los ojos
  const tapa = <M g={casquete(0.268, Math.PI * 0.5)} m={c} position={[0, 0.03, -0.015]} rotation={[-0.32, 0, 0]} scale={[1, 1.06, 1]} sombra />;
  // Con algo en la cabeza sólo asoma el pelo que cae por los costados o atrás
  if (a.accesorios.sombrero !== 'ninguno') {
    if (estilo === 'largo')
      return <M g={caja(0.5, 0.5, 0.12)} m={c} position={[0, -0.18, -0.17]} sombra />;
    if (estilo === 'coleta') return <M g={cil(0.07, 0.03, 0.42)} m={c} position={[0, -0.12, -0.3]} rotation={[0.3, 0, 0]} sombra />;
    if (estilo === 'trenzas')
      return (
        <group>
          {[-1, 1].map((l) => [0, 1, 2, 3].map((i) => <M key={`${l}${i}`} g={ico(0.055)} m={c} position={[l * 0.2, -0.12 - i * 0.09, -0.08]} />))}
        </group>
      );
    return null;
  }
  switch (estilo) {
    case 'rapado':
      return <M g={casquete(0.258, Math.PI * 0.45)} m={mat(tono(color, 1.15), 0.95)} position={[0, 0.03, -0.01]} scale={[1, 1.05, 1]} />;
    case 'corto':
      return (
        <group>
          {tapa}
          <M g={caja(0.36, 0.07, 0.12)} m={c} position={[0, 0.2, 0.15]} rotation={[0.45, 0, 0]} />
        </group>
      );
    case 'tupe':
      return (
        <group>
          {tapa}
          <M g={ico(0.13)} m={c} position={[0, 0.26, 0.1]} scale={[1.3, 0.9, 1.1]} />
        </group>
      );
    case 'flequillo':
      return (
        <group>
          {tapa}
          <M g={caja(0.42, 0.12, 0.1)} m={c} position={[0.02, 0.15, 0.2]} rotation={[0.25, 0, -0.18]} />
          {[-1, 1].map((l) => (
            <M key={l} g={caja(0.08, 0.2, 0.2)} m={c} position={[l * 0.23, 0.0, 0.0]} />
          ))}
        </group>
      );
    case 'rizado':
      return (
        <group>
          {[[0, 0.22, 0], [-0.15, 0.17, 0.08], [0.15, 0.17, 0.08], [-0.18, 0.12, -0.1], [0.18, 0.12, -0.1], [0, 0.2, 0.14], [0, 0.17, -0.18], [-0.1, 0.26, -0.06], [0.1, 0.26, -0.06]].map((p, i) => (
            <M key={i} g={ico(0.12)} m={c} position={p as [number, number, number]} sombra={i === 0} />
          ))}
        </group>
      );
    case 'afro':
      return <M g={ico(0.37, 1)} m={c} position={[0, 0.13, -0.07]} scale={[1, 0.92, 0.95]} sombra />;
    case 'largo':
      return (
        <group>
          {tapa}
          <M g={caja(0.5, 0.55, 0.12)} m={c} position={[0, -0.16, -0.17]} sombra />
          {[-1, 1].map((l) => (
            <M key={l} g={caja(0.08, 0.5, 0.24)} m={c} position={[l * 0.24, -0.12, -0.02]} />
          ))}
        </group>
      );
    case 'coleta':
      return (
        <group>
          {tapa}
          <M g={cil(0.05, 0.05, 0.05)} m={mat('#dc2626')} position={[0, 0.06, -0.27]} rotation={[Math.PI / 2, 0, 0]} detalle />
          <M g={cil(0.07, 0.03, 0.42)} m={c} position={[0, -0.12, -0.3]} rotation={[0.3, 0, 0]} sombra />
        </group>
      );
    case 'trenzas':
      return (
        <group>
          {tapa}
          {[-1, 1].map((l) =>
            [0, 1, 2, 3].map((i) => <M key={`${l}${i}`} g={ico(0.055)} m={c} position={[l * 0.2, -0.12 - i * 0.09, -0.08]} />)
          )}
        </group>
      );
    case 'bun':
      return (
        <group>
          {tapa}
          <M g={ico(0.11, 1)} m={c} position={[0, 0.27, -0.12]} />
        </group>
      );
  }
};

const VelloFacial: React.FC<{ a: Apariencia }> = ({ a }) => {
  const { estilo, color } = a.velloFacial;
  if (estilo === 'ninguno') return null;
  const c = mat(color, 0.9);
  const bigote = <M g={caja(0.15, 0.03, 0.03)} m={c} position={[0, -0.085, 0.235]} detalle />;
  const perilla = <M g={ico(0.045)} m={c} position={[0, -0.21, 0.19]} scale={[1, 1.2, 0.8]} detalle />;
  if (estilo === 'bigote') return bigote;
  if (estilo === 'perilla') return perilla;
  if (estilo === 'candado')
    return (
      <group>
        {bigote}
        {perilla}
      </group>
    );
  return (
    <group>
      {bigote}
      <M g={casquete(0.262, Math.PI * 0.35)} m={c} position={[0, -0.03, 0.02]} rotation={[Math.PI, 0, 0]} scale={[1, 0.8, 1]} detalle />
    </group>
  );
};

const Accesorios: React.FC<{ a: Apariencia; w: number }> = ({ a, w }) => {
  const acc = a.accesorios;
  const s = mat(acc.colorSombrero, 0.85);
  return (
    <group>
      <group position={[0, 1.95, 0]}>
        {acc.sombrero === 'gorra' && (
          <group>
            <M g={casquete(0.275, Math.PI * 0.5)} m={s} position={[0, 0.05, 0]} sombra />
            <M g={caja(0.3, 0.025, 0.2)} m={s} position={[0, 0.07, 0.29]} rotation={[0.12, 0, 0]} />
          </group>
        )}
        {acc.sombrero === 'chullo' && (
          <group>
            <M g={casquete(0.28, Math.PI * 0.48)} m={s} position={[0, 0.1, -0.01]} scale={[1, 1.15, 1]} sombra />
            <M g={cil(0.28, 0.285, 0.05, 9)} m={mat('#f8fafc', 0.9)} position={[0, 0.12, -0.01]} detalle />
            {[-1, 1].map((l) => (
              <M key={l} g={caja(0.05, 0.22, 0.12)} m={s} position={[l * 0.262, -0.02, -0.02]} detalle />
            ))}
            <M g={ico(0.06)} m={mat('#f8fafc', 0.9)} position={[0, 0.43, -0.01]} detalle />
          </group>
        )}
        {acc.sombrero === 'boina' && <M g={cil(0.28, 0.25, 0.08, 10)} m={s} position={[0.03, 0.24, -0.02]} rotation={[0, 0, -0.18]} sombra />}
        {acc.sombrero === 'sombrero' && (
          <group>
            <M g={cil(0.42, 0.42, 0.03, 12)} m={s} position={[0, 0.15, 0]} sombra />
            <M g={cil(0.22, 0.26, 0.22, 10)} m={s} position={[0, 0.27, 0]} sombra />
            <M g={cil(0.262, 0.262, 0.04, 10)} m={mat('#1f2937')} position={[0, 0.19, 0]} detalle />
          </group>
        )}
        {acc.gafas !== 'ninguna' && <Lentes tipo={acc.gafas} />}
        {acc.audifonos && (
          <group>
            <M g={aro(0.27, 0.02, 12, 4)} m={mat('#111827', 0.5)} position={[0, 0.02, 0]} rotation={[0, 0, 0]} scale={[1, 1.05, 1]} detalle />
            {[-1, 1].map((l) => (
              <M key={l} g={cil(0.07, 0.07, 0.06, 10)} m={mat('#111827', 0.5)} position={[l * 0.26, -0.02, 0]} rotation={[0, 0, Math.PI / 2]} detalle />
            ))}
          </group>
        )}
      </group>
      {acc.bufanda && (
        <group>
          <M g={aro(0.1, 0.045, 10, 6)} m={mat(acc.colorBufanda, 0.95)} position={[0, 1.68, 0]} rotation={[Math.PI / 2, 0, 0]} />
          <M g={caja(0.08, 0.3, 0.03)} m={mat(acc.colorBufanda, 0.95)} position={[0.06, 1.5, 0.14 * w]} rotation={[0.1, 0, 0.12]} detalle />
        </group>
      )}
      {acc.mochila && (
        <group>
          <M g={caja(0.36 * w, 0.44, 0.17)} m={mat(acc.colorMochila, 0.85)} position={[0, 1.35, -0.21 * w]} sombra />
          <M g={caja(0.26 * w, 0.14, 0.05)} m={mat(tono(acc.colorMochila, 0.8), 0.85)} position={[0, 1.22, -0.3 * w]} detalle />
          {[-1, 1].map((l) => (
            <M key={l} g={caja(0.04, 0.5, 0.02)} m={mat(tono(acc.colorMochila, 0.7))} position={[l * 0.12 * w, 1.38, 0.17 * w * 0.64]} detalle />
          ))}
        </group>
      )}
    </group>
  );
};

const Lentes: React.FC<{ tipo: Exclude<Apariencia['accesorios']['gafas'], 'ninguna'> }> = ({ tipo }) => {
  const marco = mat(tipo === 'redondas' ? '#9a7b4f' : '#111827', 0.4, 0.4);
  // Toro de 4 tramos girado 45°: marco cuadrado
  const tramos = tipo === 'redondas' ? 14 : 4;
  const giro = tipo === 'redondas' ? 0 : Math.PI / 4;
  return (
    <group position={[0, 0.0, 0.245]}>
      {[-1, 1].map((l) => (
        <group key={l} position={[l * 0.085, 0, 0]}>
          <M g={aro(0.06, 0.009, tramos, 4)} m={marco} rotation={[0, 0, giro]} detalle />
          {tipo === 'sol' && (
            <mesh userData={{ detalle: true }}>
              <circleGeometry args={[0.058, 4, Math.PI / 4]} />
              <meshStandardMaterial color="#0b1220" transparent opacity={0.85} roughness={0.1} />
            </mesh>
          )}
        </group>
      ))}
      <M g={caja(0.05, 0.01, 0.01)} m={marco} detalle />
    </group>
  );
};
