import React from 'react';
import * as THREE from 'three';
import { Sky } from '@react-three/drei';
import { Letrero } from './Letrero.js';
import { useCalidad } from './useCalidad.js';
import { EdificioAntiguo, EdificioNuevo, ALTO_ANTIGUO, ALTO_NUEVO } from './EdificiosUPDS.js';
import { DecoradoCampus } from './DecoradoCampus.js';
import { Fusionar } from './Fusionar.js';
import { recortarVista, definirVolumenes } from './recorteVista.js';
import { NIVEL_BLOQUE, PISO_FILA, type PlanoCampus, type PuertaAula, type Rect } from './planoCampus.js';

/** Caja de un edificio para el recorte de la vista: un poco más ancha, por letreros y cornisas. */
function volumen(r: Rect, alto: number): THREE.Box3 {
  return new THREE.Box3(new THREE.Vector3(r.x0 - 0.6, 0, r.z0 - 0.6), new THREE.Vector3(r.x1 + 0.6, alto, r.z1 + 0.6));
}

// Campus UPDS (CAMPUS-01): la manzana de la universidad en vez de las islas
// flotantes. Se llega por la vereda, se entra por la recepción del edificio
// antiguo o por el hall del nuevo, y las aulas son puertas de madera en los
// pasillos (CAMPUS-04: donde están en el plano). El plano (planoCampus.ts)
// decide dónde va cada cosa; acá sólo se dibuja.

export interface AulaCampus {
  id: number | string;
  nombre: string;
  // Docente dueño de la asignatura del aula: sus aulas quedan juntas en la galería
  docenteId?: string | number | null;
  docenteNombre?: string | null;
  sesion_activa?: { tema?: string; docente?: string | null } | null;
}

interface CampusProps {
  plano: PlanoCampus;
  aulas?: AulaCampus[];
  onInteractuarAula?: (aula: AulaCampus) => void;
}

// Sol de media mañana de Sucre: alto y algo de costado, para que las fachadas
// a la calle reciban luz y el patio tenga sombra de la fila de aulas
const SOL = new THREE.Vector3(45, 70, 38);

const Iluminacion: React.FC<{ centro: [number, number] }> = ({ centro }) => {
  const { sombras, tamanoSombra } = useCalidad();
  const objetivo = React.useMemo(() => new THREE.Object3D(), []);
  return (
    <>
      <Sky sunPosition={SOL.toArray()} turbidity={3} rayleigh={0.9} mieCoefficient={0.004} mieDirectionalG={0.8} />
      <fog attach="fog" args={['#c8d9ea', 90, 260]} />
      <hemisphereLight args={['#dbeafe', '#cfc6b4', 1.15]} />
      {/* Relleno suave: en los pasillos no llega el sol */}
      <ambientLight intensity={0.35} color="#fff8ee" />
      <primitive object={objetivo} position={[centro[0], 0, centro[1]]} />
      <directionalLight
        // key: el mapa de sombra no cambia de tamaño sin recrear la luz
        key={tamanoSombra}
        position={[centro[0] + SOL.x, SOL.y, centro[1] + SOL.z]}
        target={objetivo}
        intensity={2.4}
        color="#fff3e0"
        castShadow={sombras}
        shadow-mapSize={[tamanoSombra * 2, tamanoSombra * 2]}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-near={10}
        shadow-camera-far={220}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
    </>
  );
};

/** Puerta de madera de un aula, con su placa y el aviso de clase en curso. */
// Cabe bajo la losa del pasillo de las aulas (PISO_FILA): placa y aviso van por debajo
const PuertaDeAula: React.FC<{ puerta: PuertaAula; aula: AulaCampus; onInteractuar?: () => void }> = ({ puerta, aula, onInteractuar }) => {
  const enClase = !!aula.sesion_activa;
  // El aro de la tecla E, en el punto de espera frente a la puerta
  const frente = Math.hypot(puerta.frente[0] - puerta.x, puerta.frente[1] - puerta.z);
  return (
    <group position={[puerta.x, puerta.y, puerta.z]} rotation={[0, puerta.giro, 0]}>
      {/* Marco y hoja de madera */}
      <mesh position={[0, 1.15, 0.04]} castShadow>
        <boxGeometry args={[1.2, 2.3, 0.08]} />
        <meshStandardMaterial color="#7a4a22" roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.05, 0.09]}>
        <boxGeometry args={[0.95, 2.1, 0.05]} />
        <meshStandardMaterial color="#b0743a" roughness={0.55} />
      </mesh>
      <mesh position={[0.34, 1.0, 0.13]}>
        <boxGeometry args={[0.06, 0.2, 0.04]} />
        <meshStandardMaterial color="#d4d4d8" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Lámpara de estado: verde si hay clase, apagada si no */}
      <mesh position={[0, 2.4, 0.08]}>
        <boxGeometry args={[0.4, 0.1, 0.08]} />
        <meshStandardMaterial
          color={enClase ? '#34d399' : '#475569'}
          emissive={enClase ? '#10b981' : '#000000'}
          emissiveIntensity={enClase ? 1.6 : 0}
        />
      </mesh>
      <Letrero
        texto={aula.nombre}
        position={[0, PISO_FILA - 0.28, 0.25]}
        scale={[2.2, 0.42, 1]}
        ancho={520}
        alto={110}
        fondo="rgba(15,23,42,0.85)"
        fuente="bold 40px sans-serif"
      />
      {enClase && (
        <Letrero
          texto={`● En clase: ${aula.sesion_activa?.tema || 'clase en curso'}`}
          position={[0, 2.05, 0.45]}
          scale={[2.2, 0.36, 1]}
          ancho={620}
          alto={100}
          fondo="#065f46"
          fuente="bold 34px sans-serif"
        />
      )}
      {onInteractuar && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.04, frente]}
          onClick={(e) => {
            e.stopPropagation();
            onInteractuar();
          }}
        >
          <ringGeometry args={[0.4, 0.6, 28]} />
          <meshBasicMaterial color={enClase ? '#34d399' : '#60a5fa'} transparent opacity={0.65} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
};

export const Campus: React.FC<CampusProps> = ({ plano, aulas = [], onInteractuarAula }) => {
  const porId = React.useMemo(() => new Map(aulas.map((a) => [String(a.id), a])), [aulas]);
  const centro: [number, number] = [(plano.edificioNuevo.x0 + plano.auditorio.x1) / 2, -19];
  const raiz = React.useRef<THREE.Group>(null);
  // Después de que Fusionar armó sus mallas (sus efectos corren antes que
  // este), y otra vez si cambian el plano o las puertas de las aulas
  React.useLayoutEffect(() => {
    if (raiz.current) recortarVista(raiz.current);
  }, [plano, aulas]);
  React.useEffect(() => {
    // Con el techo: la cámara puede mirar desde arriba. La fila de aulas
    // incluye el pasillo: su losa tapa a quien camina debajo. El auditorio,
    // bajo y junto al lindero, no tapa a nadie
    definirVolumenes([
      volumen({ ...plano.alaCalle, x1: plano.nucleo.x1 }, ALTO_ANTIGUO + 3),
      volumen({ ...plano.filaAulas, z1: plano.corredor.z1 }, PISO_FILA * 2 + 3),
      volumen(plano.bloqueCentral, NIVEL_BLOQUE + PISO_FILA * 2 + 3.5),
      volumen(plano.edificioNuevo, ALTO_NUEVO + 3.5),
    ]);
    return () => definirVolumenes([]);
  }, [plano]);
  return (
    <group ref={raiz}>
      <Iluminacion centro={centro} />
      {/* Todo lo que no se mueve, fusionado por material (PERF-01). Desde
          CAMPUS-04 la forma no depende de las aulas: sólo las puertas, aparte */}
      <Fusionar clave="campus">
        <DecoradoCampus plano={plano} />
        <EdificioNuevo plano={plano} />
        <EdificioAntiguo plano={plano} />
      </Fusionar>
      {plano.puertas.map((puerta) => {
        const aula = porId.get(puerta.id);
        if (!aula) return null;
        return (
          <PuertaDeAula
            key={puerta.id}
            puerta={puerta}
            aula={aula}
            onInteractuar={onInteractuarAula ? () => onInteractuarAula(aula) : undefined}
          />
        );
      })}
    </group>
  );
};

export default Campus;
