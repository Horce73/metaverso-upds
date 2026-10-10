import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { Socket } from 'socket.io-client';
import * as THREE from 'three';
import { AudioClient } from './AudioClient.js';

// Componentes 3D unificados
import {
  Campus,
  calcularLayoutAulas,
  calcularMitadAnchoIsla,
  ANCHO_AULA,
  ISLA_2_OFFSET_Z,
  type AulaCampus,
} from './mundo3d/Campus.js';
import type { ZonaBloqueada } from './mundo3d/AvatarModel.js';
import { CameraRig, type AvatarEstadoRef } from './mundo3d/CameraRig.js';
import { AvatarModel, type PersonalizacionAvatar, PERSONALIZACION_POR_DEFECTO } from './mundo3d/AvatarModel.js';
import { CustomizadorAvatar } from './mundo3d/CustomizadorAvatar.js';
import { Pupitre, EscritorioProfesor, Sofa, Estanteria } from './mundo3d/Mobiliario.js';
import { crearTexturaTexto } from './mundo3d/texto3d.js';
import { useEsTactil } from './mundo3d/useEsTactil.js';
import { VirtualJoystick } from './mundo3d/VirtualJoystick.js';
import { suscribirPizarra, dibujarTramo, redibujarTodo } from './pizarra.js';
import { MESAS_AULA } from './zonasVoz.js';

export interface AsientoInteractive {
  x: number;
  y: number;
  z: number;
  angulo: number;
  label: string;
}

interface SpawnPosicion {
  position: [number, number, number];
  rotation: [number, number, number];
}

interface MetaversoCanvasProps {
  socket: Socket;
  audioClient: AudioClient | null;
  isAula: boolean;
  espacioId?: string | number;
  localAvatar: any;
  remoteUsers: { [socketId: string]: any };
  espacios?: any[];
  spawnPosicion?: SpawnPosicion | null;
  onInteractuarAula?: (espacio: any) => void;
  onUpdateAvatarPersonalization?: (nueva: PersonalizacionAvatar) => void;
  onPositionChange?: (pos: [number, number, number], rot: [number, number, number]) => void;
  /** socketId -> marca que se antepone al nombre (✋ mano levantada, 🎤 con la palabra). */
  marcas?: Record<string, string>;
  marcaLocal?: string;
  /** Última imagen de la pantalla compartida en el aula (AULA-01), como blob URL. */
  pantallaUrl?: string | null;
  /** Trabajo en grupos (AULA-07): se marcan las mesas en el piso. */
  modoGrupos?: boolean;
}

// Subcomponente de Controles de Movimiento y Cámara del Jugador Local
const LocalPlayerController: React.FC<{
  socket: Socket;
  audioClient: AudioClient | null;
  localAvatar: any;
  marca?: string;
  personalizacion: PersonalizacionAvatar;
  avatarEstadoRef: React.MutableRefObject<AvatarEstadoRef>;
  isAula: boolean;
  spawnPosicion?: SpawnPosicion | null;
  estaSentado: boolean;
  posicionSentadoTarget: AsientoInteractive | null;
  zonasBloqueadasCampus: ZonaBloqueada[];
  mitadAnchoIslaAcademica: number;
  onMove: (pos: [number, number, number], rot: [number, number, number]) => void;
}> = ({
  socket,
  audioClient,
  localAvatar,
  marca,
  personalizacion,
  avatarEstadoRef,
  isAula,
  spawnPosicion,
  estaSentado,
  posicionSentadoTarget,
  zonasBloqueadasCampus,
  mitadAnchoIslaAcademica,
  onMove,
}) => {
  const ultimoEnvioRef = useRef(0);
  const ultimaPosRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const ultimoEstadoSentadoRef = useRef(estaSentado);

  const handleUpdatePosicion = (posicion: THREE.Vector3, anguloAvatar: number) => {
    avatarEstadoRef.current.posicion.copy(posicion);

    const ahora = performance.now();
    const distancia = ultimaPosRef.current.distanceTo(posicion);
    const cambioSentado = ultimoEstadoSentadoRef.current !== estaSentado;

    // Emitir a máximo 25 FPS (cada 40ms) o de inmediato al sentarse/levantarse o empezar/detenerse
    if (ahora - ultimoEnvioRef.current > 40 || cambioSentado || (distancia > 0.02 && ahora - ultimoEnvioRef.current > 30)) {
      ultimoEnvioRef.current = ahora;
      ultimaPosRef.current.copy(posicion);
      ultimoEstadoSentadoRef.current = estaSentado;

      const posArray: [number, number, number] = [posicion.x, posicion.y, posicion.z];
      const rotArray: [number, number, number] = [0, anguloAvatar, 0];

      onMove(posArray, rotArray);

      socket.emit('move', {
        position: posArray,
        rotation: rotArray,
        estaSentado,
      });

      if (audioClient) {
        audioClient.updateListenerPosition(posArray, rotArray);
      }
    }
  };

  const initialPos: [number, number, number] = spawnPosicion?.position ?? (isAula ? [0, 0, 3] : [0, 0, 11]);
  const initialRot: [number, number, number] = spawnPosicion?.rotation ?? [0, Math.PI, 0]; // Rotación inicial de 180° por defecto

  return (
    <AvatarModel
      nombre={`${marca ? `${marca} ` : ''}${localAvatar?.nombre_visible || 'Tú'}`}
      personalizacion={personalizacion}
      position={initialPos}
      rotation={initialRot}
      isLocal={true}
      isAula={isAula}
      estaSentado={estaSentado}
      posicionSentado={posicionSentadoTarget}
      zonasBloqueadasCampus={zonasBloqueadasCampus}
      mitadAnchoIslaAcademica={mitadAnchoIslaAcademica}
      onUpdatePosicion={handleUpdatePosicion}
      nivelVoz={audioClient ? () => audioClient.nivelLocal() : undefined}
    />
  );
};

// Elementos del Aula Virtual
// Pizarrón 3D del aula: pinta en vivo, sobre una textura de canvas, la
// pizarra por operaciones (AULA-02) que se dibuja desde el panel 2D, para
// verla dentro de la escena sin abrir ese panel. Incluye los trazos propios
// (el servidor los devuelve a todo el aula) y redibuja al deshacer o borrar.
const ANCHO_TEXTURA_PIZARRON = 1024;
const ALTO_TEXTURA_PIZARRON = 384;
const COLOR_FONDO_PIZARRON = '#0f172a';

const PizarronAula: React.FC<{ socket: Socket }> = ({ socket }) => {
  const { textura, ctx } = React.useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = ANCHO_TEXTURA_PIZARRON;
    canvas.height = ALTO_TEXTURA_PIZARRON;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = COLOR_FONDO_PIZARRON;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return { textura: tex, ctx };
  }, []);

  useEffect(() => {
    const pizarra = suscribirPizarra(socket, {
      onTramo: (trazo, desde) => {
        dibujarTramo(ctx, ANCHO_TEXTURA_PIZARRON, ALTO_TEXTURA_PIZARRON, trazo, desde);
        textura.needsUpdate = true;
      },
      onRedibujar: (trazos) => {
        redibujarTodo(ctx, ANCHO_TEXTURA_PIZARRON, ALTO_TEXTURA_PIZARRON, trazos, COLOR_FONDO_PIZARRON);
        textura.needsUpdate = true;
      },
    });
    return pizarra.dejar;
  }, [socket, textura, ctx]);

  return (
    <mesh position={[0, 0, 0.16]}>
      <boxGeometry args={[15.8, 5.8, 0.05]} />
      <meshStandardMaterial map={textura} roughness={0.3} />
    </mesh>
  );
};

// Pantalla de proyección del aula (AULA-01): baja delante de la pizarra
// mientras alguien comparte pantalla y muestra la última imagen recibida.
// Material sin iluminación, como una proyección.
const ALTO_PROYECCION = 5.6;
const ANCHO_MAX_PROYECCION = 15.6;

const PantallaProyector: React.FC<{ url: string }> = ({ url }) => {
  const textura = React.useMemo(() => {
    const t = new THREE.Texture();
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const [aspecto, setAspecto] = useState(16 / 9);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      textura.image = img;
      textura.needsUpdate = true;
      setAspecto(img.naturalWidth / img.naturalHeight || 16 / 9);
    };
    img.src = url;
  }, [url, textura]);

  useEffect(() => () => textura.dispose(), [textura]);

  const ancho = Math.min(ALTO_PROYECCION * aspecto, ANCHO_MAX_PROYECCION);
  const alto = ancho / aspecto;
  return (
    <group position={[0, 0, 0.35]}>
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[ancho + 0.3, alto + 0.3]} />
        <meshBasicMaterial color="#111827" />
      </mesh>
      <mesh>
        <planeGeometry args={[ancho, alto]} />
        <meshBasicMaterial map={textura} toneMapped={false} />
      </mesh>
    </group>
  );
};

// Mesas de trabajo (AULA-07): mientras el trabajo en grupos está activo, cada
// mesa se ve como una alfombra numerada; dentro, la voz queda en la mesa.
const COLORES_MESA = ['#2563eb', '#059669', '#d97706', '#db2777', '#7c3aed', '#0891b2'];

const MesasDeTrabajo: React.FC = () => (
  <group>
    {MESAS_AULA.map((m, i) => {
      const ancho = m.x1 - m.x0;
      const fondo = m.z1 - m.z0;
      const color = COLORES_MESA[i % COLORES_MESA.length];
      return (
        <group key={m.id} position={[(m.x0 + m.x1) / 2, 0, (m.z0 + m.z1) / 2]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
            <planeGeometry args={[ancho, fondo]} />
            <meshStandardMaterial color={color} transparent opacity={0.28} />
          </mesh>
          <sprite position={[m.x0 < 0 ? -ancho / 2 + 1.2 : ancho / 2 - 1.2, 2.6, 0]} scale={[2.2, 0.6, 1]}>
            <spriteMaterial
              attach="material"
              map={crearTexturaTexto(`👥 Mesa ${m.id}`, {
                ancho: 360,
                alto: 100,
                fondo: color,
                color: '#ffffff',
                fuente: 'bold 44px sans-serif',
              })}
              transparent
            />
          </sprite>
        </group>
      );
    })}
  </group>
);

const EscenarioAula: React.FC<{ socket: Socket; pantallaUrl?: string | null; modoGrupos?: boolean }> = ({
  socket,
  pantallaUrl,
  modoGrupos,
}) => {
  return (
    <group>
      <ambientLight intensity={0.95} color="#ffffff" />
      <directionalLight
        position={[15, 25, 12]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[1024, 1024]}
        color="#fffbeb"
      />
      <directionalLight position={[-15, 15, -10]} intensity={0.6} color="#e0f2fe" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#d97706" roughness={0.35} metalness={0.05} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -2]} receiveShadow>
        <planeGeometry args={[30, 26]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -2]} receiveShadow>
        <planeGeometry args={[28, 24]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.4} />
      </mesh>

      <group position={[0, 3.2, -19.7]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[16.4, 6.4, 0.3]} />
          <meshStandardMaterial color="#3b2417" roughness={0.5} />
        </mesh>
        <PizarronAula socket={socket} />
        {pantallaUrl && <PantallaProyector url={pantallaUrl} />}
        <sprite position={[0, 3.7, 0.3]} scale={[6.5, 1.2, 1]}>
          <spriteMaterial
            attach="material"
            map={crearTexturaTexto('💻 Pizarra Digital UPDS — Aula Virtual', {
              ancho: 800,
              alto: 150,
              fondo: '#1e3a8a',
              color: '#ffffff',
              fuente: 'bold 44px sans-serif',
            })}
            transparent
          />
        </sprite>
      </group>

      <group position={[0, 0, -13]}>
        <EscritorioProfesor position={[0, 0, 0]} />
        <mesh position={[0, 0.9, -1.8]} castShadow>
          <boxGeometry args={[1.2, 1.4, 0.15]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
        <mesh position={[0, 0.5, -1.2]} castShadow>
          <boxGeometry args={[1.2, 0.12, 1.1]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
        <mesh position={[0.6, 0.94, 0.1]} castShadow>
          <boxGeometry args={[0.7, 0.03, 0.5]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.2} />
        </mesh>
        <mesh position={[0.6, 1.25, -0.15]} rotation={[-0.3, 0, 0]} castShadow>
          <boxGeometry args={[0.7, 0.5, 0.03]} />
          <meshStandardMaterial color="#0f172a" emissive="#3b82f6" emissiveIntensity={0.6} />
        </mesh>
      </group>

      {[-8.5, -3, 3, 8.5].map((x) =>
        [-5, 0, 5].map((z) => (
          <group key={`pupitre-${x}-${z}`} position={[x, 0, z]}>
            <Pupitre position={[0, 0, 0]} />
            <mesh position={[0.1, 0.99, -0.05]} castShadow>
              <boxGeometry args={[0.4, 0.03, 0.45]} />
              <meshStandardMaterial color={(x + z) % 2 === 0 ? '#2563eb' : '#059669'} />
            </mesh>
          </group>
        ))
      )}

      <Sofa position={[-16, 0, 12]} rotation={[0, Math.PI / 4, 0]} color="#0ea5e9" />
      <Sofa position={[16, 0, 12]} rotation={[0, -Math.PI / 4, 0]} color="#10b981" />
      <Estanteria position={[-18, 0, -10]} rotation={[0, Math.PI / 2, 0]} />
      <Estanteria position={[18, 0, -10]} rotation={[0, -Math.PI / 2, 0]} />

      {modoGrupos && <MesasDeTrabajo />}

      <mesh position={[0, 4, -20]} receiveShadow userData={{ esPared: true }}>
        <boxGeometry args={[40, 8, 0.5]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.4, -19.7]}>
        <boxGeometry args={[40, 0.8, 0.1]} />
        <meshStandardMaterial color="#78350f" roughness={0.5} />
      </mesh>

      <mesh position={[-20, 1.5, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow userData={{ esPared: true }}>
        <boxGeometry args={[40, 3, 0.5]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
      </mesh>
      <mesh position={[-20, 7, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow userData={{ esPared: true }}>
        <boxGeometry args={[40, 2, 0.5]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
      </mesh>
      <mesh position={[-19.8, 4.5, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[36, 3]} />
        <meshStandardMaterial color="#38bdf8" transparent opacity={0.35} roughness={0.1} metalness={0.8} />
      </mesh>

      <mesh position={[20, 1.5, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow userData={{ esPared: true }}>
        <boxGeometry args={[40, 3, 0.5]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
      </mesh>
      <mesh position={[20, 7, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow userData={{ esPared: true }}>
        <boxGeometry args={[40, 2, 0.5]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
      </mesh>
      <mesh position={[19.8, 4.5, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[36, 3]} />
        <meshStandardMaterial color="#38bdf8" transparent opacity={0.35} roughness={0.1} metalness={0.8} />
      </mesh>

      <mesh position={[0, 4, 20]} rotation={[0, Math.PI, 0]} receiveShadow userData={{ esPared: true }}>
        <boxGeometry args={[40, 8, 0.5]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
      </mesh>

      {[-10, 0, 10].map((x) =>
        [-12, -4, 4, 12].map((z) => (
          <group key={`luz-${x}-${z}`} position={[x, 7.8, z]}>
            <mesh>
              <boxGeometry args={[3, 0.1, 3]} />
              <meshStandardMaterial color="#ffffff" emissive="#fef08a" emissiveIntensity={0.8} />
            </mesh>
            <pointLight intensity={0.3} distance={10} color="#fef08a" />
          </group>
        ))
      )}
    </group>
  );
};

export const MetaversoCanvas: React.FC<MetaversoCanvasProps> = ({
  socket,
  audioClient,
  isAula,
  localAvatar,
  remoteUsers,
  espacios,
  spawnPosicion,
  onInteractuarAula,
  onUpdateAvatarPersonalization,
  onPositionChange,
  marcas,
  marcaLocal,
  pantallaUrl,
  modoGrupos,
}) => {
  const esTactil = useEsTactil();

  const aulas = React.useMemo<AulaCampus[]>(
    () =>
      (espacios || [])
        .filter((e) => e.tipo === 'aula')
        .map((e) => ({
          id: e.id,
          nombre: e.nombre,
          docenteId: e.docente_id ?? null,
          docenteNombre: e.docente_nombre ? `${e.docente_nombre} ${e.docente_apellido ?? ''}`.trim() : null,
          sesion_activa: e.sesion_activa,
        })),
    [espacios]
  );

  // Mismo cálculo de posiciones (por bloques de docente) que usa <Campus>, para
  // que la detección de "aula más cercana" con la tecla E, la colisión del
  // avatar y el tamaño de la Isla 2 coincidan siempre con lo que el jugador ve
  // renderizado (sin importar cuántas aulas/docentes haya).
  const { posiciones: posicionesAulas, extentoLateral } = React.useMemo(
    () => calcularLayoutAulas(aulas),
    [aulas]
  );

  const mitadAnchoIslaAcademica = React.useMemo(
    () => calcularMitadAnchoIsla(extentoLateral),
    [extentoLateral]
  );

  // Zonas bloqueadas para la colisión del avatar en el campus: el cuerpo de
  // cada edificio de aula, en coordenadas de mundo (la Isla 2 está desplazada
  // ISLA_2_OFFSET_Z respecto al origen).
  const zonasBloqueadasAulas = React.useMemo<ZonaBloqueada[]>(
    () =>
      Array.from(posicionesAulas.values()).map(([x, , z]) => ({
        x,
        z: z + ISLA_2_OFFSET_Z,
        mitadX: ANCHO_AULA / 2 + 0.5,
        mitadZ: ANCHO_AULA / 2 + 0.5,
      })),
    [posicionesAulas]
  );

  // Campus/E-key solo conocen la forma recortada (AulaCampus); al interactuar
  // resolvemos de vuelta el espacio completo para que el padre (SolicitudAccesoModal, etc.)
  // reciba el objeto Espacio real con tipo/asignatura/capacidad.
  const handleInteractuarAula = React.useCallback(
    (aula: AulaCampus) => {
      const espacioCompleto = (espacios || []).find((e) => String(e.id) === String(aula.id));
      onInteractuarAula?.(espacioCompleto || aula);
    },
    [espacios, onInteractuarAula]
  );

  const avatarEstadoRef = useRef<AvatarEstadoRef>({
    posicion: spawnPosicion ? new THREE.Vector3(...spawnPosicion.position) : new THREE.Vector3(0, 0, isAula ? 3 : 11),
    angulo: spawnPosicion ? spawnPosicion.rotation[1] : Math.PI, // Spawn inicial con 180° de rotación por defecto
    solicitarSnapCamara: true,
  });

  useEffect(() => {
    if (spawnPosicion) {
      avatarEstadoRef.current.posicion.set(...spawnPosicion.position);
      avatarEstadoRef.current.angulo = spawnPosicion.rotation[1];
    } else {
      avatarEstadoRef.current.posicion.set(0, 0, isAula ? 3 : 11);
      avatarEstadoRef.current.angulo = Math.PI;
    }
    avatarEstadoRef.current.solicitarSnapCamara = true;
  }, [isAula, spawnPosicion]);

  const [panelCustomizerAbierto, setPanelCustomizerAbierto] = useState(false);
  const [personalizacion, setPersonalizacion] = useState<PersonalizacionAvatar>(() => {
    let ap = localAvatar?.apariencia;
    if (typeof ap === 'string') {
      try { ap = JSON.parse(ap); } catch {}
    }
    if (ap && typeof ap === 'object' && Object.keys(ap).length > 0) {
      return { ...PERSONALIZACION_POR_DEFECTO, ...ap };
    }
    return PERSONALIZACION_POR_DEFECTO;
  });

  const handleCambiarPersonalizacion = (nueva: PersonalizacionAvatar) => {
    setPersonalizacion(nueva);
    onUpdateAvatarPersonalization?.(nueva);
  };

  useEffect(() => {
    if (audioClient) {
      Object.keys(remoteUsers).forEach((socketId) => {
        const user = remoteUsers[socketId];
        if (user.peerId && user.position) {
          audioClient.updateSourcePosition(user.peerId, user.position);
        }
      });
    }
  }, [remoteUsers, audioClient]);

  const [estaSentado, setEstaSentado] = useState(false);
  const [asientoCercano, setAsientoCercano] = useState<AsientoInteractive | null>(null);
  const [posicionSentadoTarget, setPosicionSentadoTarget] = useState<AsientoInteractive | null>(null);

  const ASIENTOS_AULA = React.useMemo(() => {
    const asientos: AsientoInteractive[] = [];

    const pupitresX = [-8.5, -3, 3, 8.5];
    const pupitresZ = [-5, 0, 5];
    for (const px of pupitresX) {
      for (const pz of pupitresZ) {
        asientos.push({
          x: px,
          y: 0,
          z: pz + 0.62,
          angulo: Math.PI,
          label: '🪑 Pupitre',
        });
      }
    }

    asientos.push({
      x: 0,
      y: 0,
      z: -14.2,
      angulo: 0,
      label: '👨‍🏫 Escritorio Docente',
    });

    asientos.push({
      x: -15.4,
      y: 0,
      z: 11.4,
      angulo: Math.PI / 4,
      label: '🛋️ Sofá',
    });
    asientos.push({
      x: 15.4,
      y: 0,
      z: 11.4,
      angulo: -Math.PI / 4,
      label: '🛋️ Sofá',
    });

    return asientos;
  }, []);

  useEffect(() => {
    if (!isAula) {
      setAsientoCercano(null);
      setEstaSentado(false);
      setPosicionSentadoTarget(null);
      return;
    }

    const interval = setInterval(() => {
      const pos = avatarEstadoRef.current.posicion;
      if (!pos || estaSentado) return;

      let mejorAsiento: AsientoInteractive | null = null;
      let minDist = 2.2;

      for (const asiento of ASIENTOS_AULA) {
        const d = Math.hypot(pos.x - asiento.x, pos.z - asiento.z);
        if (d < minDist) {
          minDist = d;
          mejorAsiento = asiento;
        }
      }

      setAsientoCercano(mejorAsiento);
    }, 150);

    return () => clearInterval(interval);
  }, [isAula, estaSentado, ASIENTOS_AULA]);

  // Lo que antes hacia solo la tecla [E]: levantarse, sentarse en un asiento
  // cercano, o entrar al aula cercana. Extraido para que el boton tactil de
  // interaccion (sin teclado) dispare exactamente lo mismo, en vez de
  // simular un KeyboardEvent.
  const interactuar = useCallback(() => {
    if (estaSentado) {
      setEstaSentado(false);
      setPosicionSentadoTarget(null);
      avatarEstadoRef.current.posicion.y = 0;
      return;
    }

    if (isAula && asientoCercano) {
      setEstaSentado(true);
      setPosicionSentadoTarget(asientoCercano);
      avatarEstadoRef.current.posicion.set(asientoCercano.x, asientoCercano.y, asientoCercano.z);
      avatarEstadoRef.current.angulo = asientoCercano.angulo;
      avatarEstadoRef.current.solicitarSnapCamara = true;
      return;
    }

    if (isAula || !onInteractuarAula || aulas.length === 0) return;

    const pos = avatarEstadoRef.current.posicion;
    if (!pos) return;

    let aulaCercana: AulaCampus | null = null;
    let distMin = Infinity;
    aulas.forEach((aula) => {
      const posicion = posicionesAulas.get(String(aula.id));
      if (!posicion) return;
      const [x, , z] = posicion;
      const d = Math.hypot(pos.x - x, pos.z - (z + ISLA_2_OFFSET_Z));
      if (d < distMin) {
        distMin = d;
        aulaCercana = aula;
      }
    });

    const MAX_DISTANCIA = 9.0;
    if (aulaCercana && distMin < MAX_DISTANCIA) {
      handleInteractuarAula(aulaCercana);
    }
  }, [isAula, estaSentado, asientoCercano, aulas, posicionesAulas, onInteractuarAula, handleInteractuarAula]);

  useEffect(() => {
    const TECLAS_MOVIMIENTO = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }

      const esTeclaE = e.code === 'KeyE' || e.key === 'e' || e.key === 'E';

      // Caminar (sin tocar E) tambien levanta de la silla; es un atajo de
      // teclado sin equivalente tactil (el joystick no "camina" si el
      // boton de interactuar ya cubre pararse). interactuar() se encarga
      // de levantar cuando la tecla SI es E.
      if (estaSentado && TECLAS_MOVIMIENTO.includes(e.code)) {
        setEstaSentado(false);
        setPosicionSentadoTarget(null);
        avatarEstadoRef.current.posicion.y = 0;
        return;
      }

      if (esTeclaE) interactuar();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [estaSentado, interactuar]);

  return (
    <div className="canvas-container" style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <Canvas
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, 1.5]}
        gl={{ powerPreference: 'high-performance', antialias: true }}
        camera={{ fov: 60, position: [0, 3, 10] }}
      >
        <color attach="background" args={['#87ceeb']} />
        <Stars radius={100} depth={50} count={1200} factor={4} saturation={0} fade speed={1} />

        <ambientLight intensity={isAula ? 0.9 : 0.7} color="#ffffff" />
        <directionalLight
          position={[10, 20, 10]}
          intensity={1.3}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />

        {isAula ? (
          <EscenarioAula socket={socket} pantallaUrl={pantallaUrl} modoGrupos={modoGrupos} />
        ) : (
          <group>
            <Campus aulas={aulas} onInteractuarAula={handleInteractuarAula} />
          </group>
        )}

        {isAula && asientoCercano && !estaSentado && (
          <sprite position={[asientoCercano.x, asientoCercano.y + 1.8, asientoCercano.z]} scale={[3.6, 0.8, 1]}>
            <spriteMaterial
              attach="material"
              map={crearTexturaTexto('🪑 Presiona [E] para Sentarse', {
                ancho: 500,
                alto: 100,
                fondo: '#0284c7',
                color: '#ffffff',
                fuente: 'bold 32px sans-serif',
              })}
              transparent
            />
          </sprite>
        )}

        <LocalPlayerController
          socket={socket}
          audioClient={audioClient}
          localAvatar={localAvatar}
          marca={marcaLocal}
          personalizacion={personalizacion}
          avatarEstadoRef={avatarEstadoRef}
          isAula={isAula}
          spawnPosicion={spawnPosicion}
          estaSentado={estaSentado}
          posicionSentadoTarget={posicionSentadoTarget}
          zonasBloqueadasCampus={zonasBloqueadasAulas}
          mitadAnchoIslaAcademica={mitadAnchoIslaAcademica}
          onMove={(pos, rot) => onPositionChange?.(pos, rot)}
        />

        <CameraRig avatarEstadoRef={avatarEstadoRef} />

        {Object.keys(remoteUsers)
          .filter((sId) => {
            const u = remoteUsers[sId];
            if (sId === socket.id) return false;
            const localId = localAvatar?.usuario_id || localAvatar?.id;
            if (localId && u && String(u.userId) === String(localId)) return false;
            return true;
          })
          .map((socketId) => {
            const u = remoteUsers[socketId];
            let apRemota = u?.apariencia;
            if (typeof apRemota === 'string') {
              try { apRemota = JSON.parse(apRemota); } catch {}
            }
            const aparienciaRemota: PersonalizacionAvatar = apRemota && typeof apRemota === 'object' && Object.keys(apRemota).length > 0
              ? { ...PERSONALIZACION_POR_DEFECTO, ...apRemota }
              : PERSONALIZACION_POR_DEFECTO;

            return (
              <AvatarModel
                key={socketId}
                nombre={`${marcas?.[socketId] ? `${marcas[socketId]} ` : ''}${u.nombreVisible || 'Estudiante'}`}
                personalizacion={aparienciaRemota}
                position={u.position || [0, 0, 0]}
                rotation={u.rotation || [0, 0, 0]}
                isLocal={false}
                estaSentado={u.estaSentado}
                nivelVoz={audioClient && u.peerId ? () => audioClient.nivelDe(u.peerId) : undefined}
              />
            );
          })}
      </Canvas>

      {esTactil && (
        <>
          <VirtualJoystick />
          <button
            type="button"
            onPointerDown={(e) => { e.preventDefault(); interactuar(); }}
            onContextMenu={(e) => e.preventDefault()}
            aria-label={
              estaSentado ? 'Levantarse' : isAula && asientoCercano ? 'Sentarse' : 'Ingresar al aula cercana'
            }
            style={{
              // El boton "Personalizar avatar" vive en bottom:20px/right:20px
              // con z-index 60 (CustomizadorAvatar.tsx): mas abajo aqui queda
              // tapado y sin poder tocarse. Se apila arriba de el.
              position: 'fixed',
              right: '20px',
              bottom: '84px',
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(15, 23, 42, 0.78)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              color: '#f8fafc',
              fontSize: '1.6rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 40,
              touchAction: 'none',
            }}
          >
            {estaSentado ? '🧍' : isAula && asientoCercano ? '🪑' : '🚪'}
          </button>
        </>
      )}

      <CustomizadorAvatar
        personalizacion={personalizacion}
        onCambiar={handleCambiarPersonalizacion}
        abierto={panelCustomizerAbierto}
        onToggle={() => setPanelCustomizerAbierto((v) => !v)}
      />

      {isAula && estaSentado && (
        <div
          style={{
            position: 'absolute',
            bottom: '36px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.88)',
            border: '1px solid rgba(56, 189, 248, 0.5)',
            color: '#f8fafc',
            padding: '10px 22px',
            borderRadius: '30px',
            fontSize: '0.95rem',
            fontWeight: 600,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            zIndex: 1000,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>🪑 Sentado en la Silla</span>
          <span style={{ opacity: 0.7, fontSize: '0.85rem' }}>• Presiona [E] o [WASD] para levantarte</span>
        </div>
      )}
    </div>
  );
};

export default MetaversoCanvas;
