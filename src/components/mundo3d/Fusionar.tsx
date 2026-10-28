import React, { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { reemplazadas } from './reemplazadas.js';

// Geometría estática fusionada (PERF-01). El campus se arma con cientos de
// bloques chicos (columnas, peldaños, marcos, árboles…) y cada malla es una
// llamada de dibujo, más otra en el mapa de sombras: más de mil por cuadro,
// que en un celular pesan más que los triángulos. Este componente dibuja sus
// hijos como siempre y, una vez montados, junta en una sola malla todas las
// que comparten material (y forma de proyectar sombra), con la posición ya
// aplicada a los vértices; las originales quedan ocultas.
//
// Sólo para lo que no se mueve ni cambia solo: si cambia `clave` (otro plano,
// otras aulas), se vuelve a fusionar. Lo que se anima o se toca (puertas de
// aulas, letreros) va fuera. Un avatar fusiona cada parte rígida por separado
// (cuerpo, cada brazo y pierna), para que la animación siga moviéndolas.
//
// `colores`: además, el color de cada material pasa a los vértices y toda la
// parte se dibuja con un único material. Sirve para piezas de color liso sin
// texturas, como las del avatar: de ~40 llamadas por persona a ~10.
//
// Las piezas marcadas userData.detalle (las que el avatar oculta de lejos)
// se fusionan aparte y el resultado conserva la marca.

interface Grupo {
  material: THREE.Material;
  sombra: boolean;
  pared: boolean;
  detalle: boolean;
  partes: THREE.BufferGeometry[];
}

// Material único para las partes fusionadas con color por vértice
const POR_VERTICE = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.75 });
const colorTmp = new THREE.Color();

// Dos materiales con las mismas propiedades se dibujan igual aunque sean
// objetos distintos (cada <meshStandardMaterial> del JSX crea el suyo): se
// agrupan por lo que tienen, no por quiénes son.
function firma(m: THREE.Material): string {
  const e = m as THREE.MeshStandardMaterial;
  return [
    m.type,
    e.color?.getHexString(),
    e.emissive?.getHexString(),
    e.emissiveIntensity,
    e.roughness,
    e.metalness,
    e.flatShading,
    m.side,
    m.opacity,
    e.map?.uuid,
    e.emissiveMap?.uuid,
  ].join('|');
}

/** Las caras de `geometria` que dibuja el grupo `grupo`, como geometría propia y sin índice. */
function porGrupo(geometria: THREE.BufferGeometry, { start, count }: { start: number; count: number }): THREE.BufferGeometry {
  const parte = geometria.clone();
  if (parte.index) {
    parte.setIndex(Array.from(parte.index.array.slice(start, start + count)));
  } else {
    // Sin índice, el grupo cuenta vértices: se recortan los atributos
    for (const nombre of Object.keys(parte.attributes)) {
      const a = parte.getAttribute(nombre) as THREE.BufferAttribute;
      parte.setAttribute(nombre, new THREE.BufferAttribute(a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize, a.normalized));
    }
  }
  parte.clearGroups();
  return parte;
}

export const Fusionar: React.FC<{ clave: string; colores?: boolean; children: React.ReactNode }> = ({ clave, colores = false, children }) => {
  const raiz = useRef<THREE.Group>(null);
  const fusionadas = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    const origen = raiz.current;
    const destino = fusionadas.current;
    if (!origen || !destino) return;
    origen.updateWorldMatrix(true, true);
    const inversa = origen.matrixWorld.clone().invert();
    const grupos = new Map<string, Grupo>();
    const ocultas: THREE.Mesh[] = [];

    origen.traverse((o) => {
      const malla = o as THREE.Mesh;
      // Sin mirar `visible`: una pieza que el nivel de detalle del avatar ocultó
      // por estar lejos también se fusiona (en la parte marcada como detalle)
      if (!malla.isMesh) return;
      const materiales = Array.isArray(malla.material) ? malla.material : [malla.material];
      // Las transparentes se ordenan por distancia al dibujarse: se dejan como están
      if (materiales.some((m) => m.transparent)) return;
      // Por vértice sólo van materiales lisos: con textura se fusionan por material
      const aVertice = colores && materiales.every((m) => !(m as THREE.MeshStandardMaterial).map && 'color' in m);
      const matriz = inversa.clone().multiply(malla.matrixWorld);
      const piezas = Array.isArray(malla.material)
        ? malla.geometry.groups.map((g) => ({ material: materiales[g.materialIndex ?? 0], geometria: porGrupo(malla.geometry, g) }))
        : [{ material: malla.material as THREE.Material, geometria: malla.geometry.clone() }];
      for (const { material, geometria } of piezas) {
        const plana = geometria.index ? geometria.toNonIndexed() : geometria;
        if (plana !== geometria) geometria.dispose();
        plana.applyMatrix4(matriz);
        // Todas con los mismos atributos, o mergeGeometries no las junta
        const atributos = aVertice ? ['position', 'normal', 'color'] : ['position', 'normal', 'uv'];
        if (aVertice) {
          colorTmp.copy((material as THREE.MeshStandardMaterial).color);
          const n = plana.getAttribute('position').count;
          const c = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) c.set([colorTmp.r, colorTmp.g, colorTmp.b], i * 3);
          plana.setAttribute('color', new THREE.BufferAttribute(c, 3));
        }
        for (const nombre of Object.keys(plana.attributes)) if (!atributos.includes(nombre)) plana.deleteAttribute(nombre);
        const detalle = !!malla.userData.detalle;
        const clave = aVertice
          ? `color|${detalle}`
          : `${firma(material)}|${malla.castShadow}|${!!malla.userData.esPared}|${detalle}`;
        let grupo = grupos.get(clave);
        if (!grupo) {
          grupo = {
            material: aVertice ? POR_VERTICE : material,
            sombra: aVertice || malla.castShadow,
            pared: !aVertice && !!malla.userData.esPared,
            detalle,
            partes: [],
          };
          grupos.set(clave, grupo);
        }
        grupo.partes.push(plana);
      }
      ocultas.push(malla);
    });

    const nuevas: THREE.Mesh[] = [];
    for (const g of grupos.values()) {
      const conUv = g.partes.every((p) => p.getAttribute('uv'));
      if (!conUv) for (const p of g.partes) p.deleteAttribute('uv');
      const geometria = mergeGeometries(g.partes, false);
      g.partes.forEach((p) => p.dispose());
      if (!geometria) continue;
      const malla = new THREE.Mesh(geometria, g.material);
      malla.castShadow = g.sombra;
      malla.receiveShadow = true;
      if (g.pared) malla.userData.esPared = true;
      if (g.detalle) malla.userData.detalle = true;
      // Nada de esto se mueve: la matriz se calcula una vez y no en cada cuadro
      malla.matrixAutoUpdate = false;
      malla.updateMatrix();
      destino.add(malla);
      nuevas.push(malla);
    }
    // Ocultas: no se dibujan, la cámara ya no las toma como paredes y el
    // nivel de detalle del avatar no las vuelve a mostrar
    ocultas.forEach((m) => {
      m.visible = false;
      reemplazadas.add(m);
    });

    return () => {
      nuevas.forEach((m) => {
        destino.remove(m);
        m.geometry.dispose();
      });
      ocultas.forEach((m) => {
        m.visible = true;
        reemplazadas.delete(m);
      });
    };
  }, [clave, colores]);

  return (
    <group>
      <group ref={raiz}>{children}</group>
      <group ref={fusionadas} />
    </group>
  );
};
