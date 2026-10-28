import * as THREE from 'three';

// Recorte de la vista (VISTA-01): lo del campus que queda entre la cámara y
// el avatar (el letrero y el dintel de la entrada, un árbol, una columna) se
// abre en un círculo alrededor de la persona, con el borde tramado para que
// no se vea un corte duro. Se decide en el shader, fragmento por fragmento:
// así funciona igual con la geometría fusionada (PERF-01), donde un muro es
// parte de una malla que cruza todo el edificio y no se puede ocultar solo.
//
// Sólo se abre cuando un edificio tapa de verdad al avatar: la línea de la
// cámara al avatar cruza alguno de los volúmenes del plano (las alas del
// edificio antiguo, el nuevo). Si no, un muro paralelo a esa línea, al lado
// de la persona, también se agujerearía sin estar tapando nada. El círculo
// aparece y se cierra en un instante, no de golpe.
//
// Sólo se recorta por encima de los tobillos del avatar: el piso, la vereda
// y la calle a sus pies no se abren. Las sombras no cambian (el mapa de
// sombras usa otro material), así que la entrada sigue en penumbra.

/** Radio del círculo que se abre alrededor del avatar, en metros. */
const RADIO = 1.5;
/** Lo que está a menos de esto delante del avatar no se recorta (sus manos, la pared en la que se apoya). */
const MARGEN_AVATAR = 0.6;

// Uniformes compartidos por todos los materiales recortados: se actualizan
// una vez por cuadro y lo ven todos los shaders a la vez
const uniformes = {
  uAvatarRecorte: { value: new THREE.Vector3(0, -1000, 0) },
  /** 0 = cerrado, 1 = abierto del todo. */
  uFuerzaRecorte: { value: 0 },
};

let volumenes: THREE.Box3[] = [];
const rayo = new THREE.Ray();
const cruce = new THREE.Vector3();

/** Los edificios que pueden tapar al avatar (cajas en coordenadas del mundo). */
export function definirVolumenes(cajas: THREE.Box3[]): void {
  volumenes = cajas;
}

/** ¿Algún edificio queda entre la cámara y el punto `avatar`? */
function tapado(camara: THREE.Vector3, avatar: THREE.Vector3): boolean {
  const largo = camara.distanceTo(avatar);
  rayo.origin.copy(camara);
  rayo.direction.subVectors(avatar, camara).divideScalar(largo);
  // Si la cámara está dentro de la caja, el cruce es la cámara misma: tapado
  return volumenes.some((caja) => rayo.intersectBox(caja, cruce) && cruce.distanceTo(camara) < largo - MARGEN_AVATAR);
}

/** Una vez por cuadro: dónde está el avatar y si hay que abrir el círculo. */
export function actualizarRecorte(pies: THREE.Vector3, camara: THREE.Vector3, delta: number): void {
  const avatar = uniformes.uAvatarRecorte.value.set(pies.x, pies.y + 1.1, pies.z);
  const objetivo = tapado(camara, avatar) ? 1 : 0;
  const f = uniformes.uFuerzaRecorte;
  f.value += (objetivo - f.value) * Math.min(1, delta * 6);
}

const VERTICE = /* glsl */ `
  #include <project_vertex>
  #ifdef USE_INSTANCING
    vPosRecorte = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  #else
    vPosRecorte = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #endif
`;

const FRAGMENTO = /* glsl */ `
  #include <clipping_planes_fragment>
  {
    vec3 ejeRecorte = uAvatarRecorte - cameraPosition;
    float largoRecorte = length(ejeRecorte);
    ejeRecorte /= largoRecorte;
    vec3 relRecorte = vPosRecorte - cameraPosition;
    float tRecorte = dot(relRecorte, ejeRecorte);
    if (uFuerzaRecorte > 0.01 && tRecorte > 0.0 && tRecorte < largoRecorte - ${MARGEN_AVATAR.toFixed(2)} && vPosRecorte.y > uAvatarRecorte.y - 0.8) {
      float dRecorte = length(relRecorte - ejeRecorte * tRecorte);
      // 1 en el centro del círculo, 0 fuera; la trama de Bayer 4x4 hace el borde suave
      float dentro = uFuerzaRecorte * (1.0 - smoothstep(${(RADIO * 0.55).toFixed(2)}, ${RADIO.toFixed(2)}, dRecorte));
      vec2 celda = mod(floor(gl_FragCoord.xy), 4.0);
      int i = int(celda.x + celda.y * 4.0);
      float umbral = float(i == 0 ? 0 : i == 1 ? 8 : i == 2 ? 2 : i == 3 ? 10 : i == 4 ? 12 : i == 5 ? 4 : i == 6 ? 14 : i == 7 ? 6
        : i == 8 ? 3 : i == 9 ? 11 : i == 10 ? 1 : i == 11 ? 9 : i == 12 ? 15 : i == 13 ? 7 : i == 14 ? 13 : 5) / 16.0 + 1.0 / 32.0;
      if (dentro > umbral) discard;
    }
  }
`;

const recortados = new WeakSet<THREE.Material>();

function recortar(material: THREE.Material): void {
  if (recortados.has(material)) return;
  // Sólo los materiales de three con los trozos de shader de siempre (no el cielo)
  const m = material as THREE.MeshStandardMaterial & THREE.MeshBasicMaterial;
  if (!(m.isMeshStandardMaterial || m.isMeshBasicMaterial || (m as unknown as THREE.MeshLambertMaterial).isMeshLambertMaterial)) return;
  recortados.add(material);
  const previo = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previo.call(material, shader, renderer);
    shader.uniforms.uAvatarRecorte = uniformes.uAvatarRecorte;
    shader.uniforms.uFuerzaRecorte = uniformes.uFuerzaRecorte;
    shader.vertexShader = `varying vec3 vPosRecorte;\n${shader.vertexShader.replace('#include <project_vertex>', VERTICE)}`;
    shader.fragmentShader = `uniform vec3 uAvatarRecorte;\nuniform float uFuerzaRecorte;\nvarying vec3 vPosRecorte;\n${shader.fragmentShader.replace('#include <clipping_planes_fragment>', FRAGMENTO)}`;
  };
  // Otro programa que el del mismo material sin recorte
  const clavePrevia = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${clavePrevia()}|recorte`;
  material.needsUpdate = true;
}

/** Aplica el recorte a todos los materiales de las mallas bajo `raiz`. */
export function recortarVista(raiz: THREE.Object3D): void {
  raiz.traverse((o) => {
    const malla = o as THREE.Mesh;
    if (!malla.isMesh) return;
    (Array.isArray(malla.material) ? malla.material : [malla.material]).forEach(recortar);
  });
}
