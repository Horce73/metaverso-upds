import React from 'react';
import { Bloque, Piso, TechoDosAguas, Buhardilla, Pasamanos, type Cara } from './piezas.js';
import { texturaLetreroUPDS, texturaLetrasTorre } from './texturasCampus.js';
import {
  ALTO_NUEVO,
  CULATA,
  GALERIA,
  NIVELES_NUEVO,
  PARAPETO,
  PB_ANTIGUO,
  PB_NUEVO,
  PELDANOS_PATIO,
  PELDANOS_U,
  PISO_ANTIGUO,
  PISO_NUEVO,
  type PlanoCampus,
} from './planoCampus.js';

// Edificios de la UPDS (CAMPUS-01), según el frontis y los planos de
// evacuación de docs/referencias-upds:
// - el antiguo: planta baja blanca y tres pisos de ladrillo terracota con
//   relieves escalonados bajo las ventanas, techo de teja con buhardillas,
//   y dos alas alrededor de un patio con galerías;
// - el nuevo (CAMPUS-02, según los planos de la ampliación): una torre blanca
//   de 11 niveles con un paño vidriado rehundido en la fachada, la franja
//   vertical de la escalera junto al antiguo y las letras UPDS arriba.
// Del nivel alto (CAMPUS-03) se caminan las galerías del primer piso, la
// pasarela del patio y el piso alto del nuevo: ver planoCampus.ts.

const PB = PB_ANTIGUO;
const PISO = PISO_ANTIGUO;
const PISOS_ARRIBA = 3;
const ALTO_ANTIGUO = PB + PISO * PISOS_ARRIBA; // 13,2

const FACHADA: Cara = { textura: 'fachadaAntigua', modulo: [4.5, PISO] };
const PLANTA_BAJA: Cara = { textura: 'plantaBaja', modulo: [4.5, PB] };
const LADRILLO: Cara = { textura: 'ladrillo', modulo: [2, 2] };
const TERRACOTA: Cara = { textura: 'terracota', modulo: [2, 2] };
const REVOQUE: Cara = { color: '#ece9e2' };
const BLANCO: Cara = { color: '#f4f2ed' };
// Parapeto de las galerías como en la foto del bloque B: ladrillo con tapa gris
// (colores lisos: la textura crearía un material por cada largo de parapeto).
// El mismo ladrillo liso sirve para la culata del lado del nuevo
const PARAPETO_LADRILLO: Cara = { color: '#a95f3f' };
const TAPA_GRIS: Cara = { color: '#7d8590' };
const ALTO_PARAPETO = 0.95;
// Salida del piso alto del nuevo por la culata: umbral y alto de la abertura
const LOSA_CONEXION = 0.25;
const ALTO_ABERTURA = 2.4;

/** Parapeto de ladrillo con tapa gris, sobre el piso a la altura y. */
const Parapeto: React.FC<{ x: [number, number]; z: [number, number]; y: number }> = ({ x, z, y }) => (
  <>
    <Bloque x={x} y={[y, y + ALTO_PARAPETO - 0.08]} z={z} todas={PARAPETO_LADRILLO} />
    <Bloque x={[x[0] - 0.02, x[1] + 0.02]} y={[y + ALTO_PARAPETO - 0.08, y + ALTO_PARAPETO]} z={[z[0] - 0.02, z[1] + 0.02]} todas={TAPA_GRIS} sombra={false} />
  </>
);

/** Un ala del edificio antiguo: planta baja (con un pasillo pasante) y tres pisos encima. */
const AlaAntigua: React.FC<{
  x: [number, number];
  z: [number, number];
  paso: [number, number];
  /** Cara hacia el patio: +z para el ala del fondo, -z para la de la calle. */
  patioHacia: 1 | -1;
  exterior: Cara;
  /** Tramo del parapeto del primer piso abierto a la pasarela del patio. */
  hueco: [number, number];
}> = ({ x, z, paso, patioHacia, exterior, hueco }) => {
  const haciaPatio = patioHacia === 1 ? { frente: LADRILLO, fondo: exterior } : { frente: exterior, fondo: LADRILLO };
  const zPatio = patioHacia === 1 ? z[1] : z[0];
  const zGaleria: [number, number] = patioHacia === 1 ? [z[1], z[1] + GALERIA] : [z[0] - GALERIA, z[0]];
  const zParapeto: [number, number] = patioHacia === 1 ? [zGaleria[1] - PARAPETO, zGaleria[1]] : [zGaleria[0], zGaleria[0] + PARAPETO];
  return (
    <group>
      {/* Planta baja a los dos lados del pasillo */}
      <Bloque x={[x[0], paso[0]]} y={[0, PB]} z={z} todas={TERRACOTA} derecha={BLANCO} {...haciaPatio} pared />
      <Bloque x={[paso[1], x[1]]} y={[0, PB]} z={z} todas={TERRACOTA} izquierda={BLANCO} {...haciaPatio} pared />
      {/* Pasillo: piso, cielo raso y una puerta vidriada en cada boca */}
      <Piso x={paso} z={z} cara={{ textura: 'baldosa', modulo: [2.4, 2.4] }} />
      <Bloque x={paso} y={[PB - 0.25, PB]} z={z} todas={BLANCO} sombra={false} />
      {[z[0], z[1]].map((zz) => (
        <group key={zz}>
          <Bloque x={[paso[0], paso[0] + 0.15]} y={[0, PB - 0.25]} z={[zz - 0.08, zz + 0.08]} todas={{ color: '#2b2f36' }} />
          <Bloque x={[paso[1] - 0.15, paso[1]]} y={[0, PB - 0.25]} z={[zz - 0.08, zz + 0.08]} todas={{ color: '#2b2f36' }} />
          <Bloque x={paso} y={[PB - 0.6, PB - 0.25]} z={[zz - 0.08, zz + 0.08]} todas={{ color: '#2b2f36' }} />
        </group>
      ))}
      {/* Tres pisos de ladrillo con ventanas y relieves */}
      <Bloque x={x} y={[PB, ALTO_ANTIGUO]} z={z} todas={TERRACOTA} frente={FACHADA} fondo={FACHADA} pared />
      {/* Cornisa blanca y techo de teja */}
      <Bloque x={[x[0] - 0.2, x[1] + 0.2]} y={[ALTO_ANTIGUO, ALTO_ANTIGUO + 0.25]} z={[z[0] - 0.25, z[1] + 0.25]} todas={BLANCO} />
      <TechoDosAguas x={x} z={z} y={ALTO_ANTIGUO + 0.25} alto={2.8} />
      {/* Galería hacia el patio: losa sobre columnas (las columnas van aparte).
          La del primer piso se camina (CAMPUS-03); su parapeto se abre donde
          llega la pasarela. Encima, la losa y el parapeto del segundo piso. */}
      <Bloque x={x} y={[PB - 0.3, PB]} z={zGaleria} todas={BLANCO} />
      <Parapeto x={[x[0], hueco[0]]} z={zParapeto} y={PB} />
      <Parapeto x={[hueco[1], x[1]]} z={zParapeto} y={PB} />
      <Bloque x={x} y={[PB + PISO - 0.3, PB + PISO]} z={zGaleria} todas={BLANCO} />
      <Parapeto x={x} z={zParapeto} y={PB + PISO} />
      {/* Zócalo gris del pasillo, como en la foto del bloque C (sin cruzar la boca del pasillo) */}
      {[
        [x[0], paso[0]],
        [paso[1], x[1]],
      ].map(([a, b]) => (
        <Bloque
          key={a}
          x={[a, b]}
          y={[0, 0.9]}
          z={patioHacia === 1 ? [zPatio, zPatio + 0.03] : [zPatio - 0.03, zPatio]}
          todas={{ color: '#7d8590' }}
          sombra={false}
        />
      ))}
    </group>
  );
};

export const EdificioAntiguo: React.FC<{ plano: PlanoCampus }> = ({ plano }) => {
  const { alaCalle, alaFondo, pasoRecepcion, pasoCancha, xFin, pasarela, conexionNuevo: con, conexionAlta: alta } = plano;
  const hueco: [number, number] = [pasarela.x0, pasarela.x1];
  const xCulata: [number, number] = [alaCalle.x0 - CULATA, alaCalle.x0];
  const buhardillas = React.useMemo(() => {
    const xs: number[] = [];
    for (let x = alaCalle.x0 + 6; x < xFin - 4; x += 11) xs.push(x);
    return xs;
  }, [alaCalle.x0, xFin]);
  return (
    <group>
      <AlaAntigua x={[alaCalle.x0, alaCalle.x1]} z={[alaCalle.z0, alaCalle.z1]} paso={[pasoRecepcion.x0, pasoRecepcion.x1]} patioHacia={-1} exterior={PLANTA_BAJA} hueco={hueco} />
      <AlaAntigua x={[alaFondo.x0, alaFondo.x1]} z={[alaFondo.z0, alaFondo.z1]} paso={[pasoCancha.x0, pasoCancha.x1]} patioHacia={1} exterior={REVOQUE} hueco={hueco} />
      {buhardillas.map((x) => (
        <Buhardilla key={x} x={x} z={alaCalle.z1 - 1.4} y={ALTO_ANTIGUO + 0.25} />
      ))}
      {buhardillas.slice(1).map((x) => (
        <Buhardilla key={`f${x}`} x={x} z={alaFondo.z0 + 1.4} y={ALTO_ANTIGUO + 0.25} sentido={-1} />
      ))}

      {/* Culatas del patio: el muro que lo cierra a cada lado. Del lado del
          nuevo tiene dos aberturas: la bajada al patio y, arriba, la salida
          del piso alto a la galería del fondo (sobre la bajada, corrida hacia
          el ala). Ésta va en ladrillo liso: partida en piezas, con textura
          cada tamaño de cara sería un material (y una llamada de dibujo) */}
      <Bloque x={[alaCalle.x1 - 0.5, alaCalle.x1]} y={[0, ALTO_ANTIGUO]} z={[alaFondo.z1, alaCalle.z0]} todas={TERRACOTA} pared />
      <Bloque x={xCulata} y={[0, ALTO_ANTIGUO]} z={[alaFondo.z1, alta.z0]} todas={PARAPETO_LADRILLO} pared />
      <Bloque x={xCulata} y={[0, PB - LOSA_CONEXION]} z={[alta.z0, con.z0]} todas={PARAPETO_LADRILLO} pared />
      <Bloque x={xCulata} y={[PB + ALTO_ABERTURA, ALTO_ANTIGUO]} z={[alta.z0, alta.z1]} todas={PARAPETO_LADRILLO} pared />
      <Bloque x={xCulata} y={[PB - LOSA_CONEXION, ALTO_ANTIGUO]} z={[alta.z1, con.z1]} todas={PARAPETO_LADRILLO} pared />
      <Bloque x={xCulata} y={[0, ALTO_ANTIGUO]} z={[con.z1, alaCalle.z0]} todas={PARAPETO_LADRILLO} pared />
      {/* Umbral de la salida de arriba, que es el dintel de la bajada */}
      <Bloque x={[xCulata[0] + 0.3, xCulata[1]]} y={[PB - LOSA_CONEXION, PB]} z={[alta.z0, alta.z1]} todas={BLANCO} />

      {/* Entrada principal: letrero y mampara vidriada azul, como en la foto */}
      <Bloque
        x={[pasoRecepcion.x0 - 1.2, pasoRecepcion.x1 + 1.2]}
        y={[PB + 0.1, PB + 1.3]}
        z={[0, 0.3]}
        todas={{ color: '#0b0d10' }}
        frente={{ mapa: texturaLetreroUPDS(), mapaEmisivo: texturaLetreroUPDS(), emisivo: '#ffffff', intensidadEmisiva: 0.9 }}
      />
      <Bloque x={[pasoRecepcion.x1 + 0.2, pasoRecepcion.x1 + 3.6]} y={[0.3, PB - 0.4]} z={[0, 0.08]} todas={{ color: '#2f80c9', rugosidad: 0.15, metalicidad: 0.3, emisivo: '#0c4a8a', intensidadEmisiva: 0.35 }} sombra={false} />

      {/* Patio: baldosa, columnas de las galerías y la escalera central */}
      <Piso x={[plano.patio.x0 - 0.5, plano.patio.x1 + 0.5]} z={[alaFondo.z1, alaCalle.z0]} cara={{ textura: 'baldosa', modulo: [2.4, 2.4] }} />
      {plano.columnas.map(([x, z]) => (
        <group key={`${x}:${z}`}>
          <Bloque x={[x - 0.22, x + 0.22]} y={[0, PB - 0.3]} z={[z - 0.22, z + 0.22]} todas={{ color: '#efece4' }} />
          <Bloque x={[x - 0.22, x + 0.22]} y={[PB, PB + PISO - 0.3]} z={[z - 0.22, z + 0.22]} todas={{ color: '#efece4' }} />
          <Bloque x={[x - 0.24, x + 0.24]} y={[0, 1.0]} z={[z - 0.24, z + 0.24]} todas={{ color: '#7d8590' }} sombra={false} />
        </group>
      ))}
      <EscaleraPatio plano={plano} />
    </group>
  );
};

// Escalera de dos tramos que suben desde cada punta hacia el centro. Del
// descanso sale la pasarela a las dos galerías del primer piso (CAMPUS-03).
// Los peldaños son `pared`, como los de la U: la cámara no se mete en ellos
const PELDANO_PATIO: Cara = { color: '#c4c7cb' };
const HUELLA_PATIO: Cara = { color: '#e8ebee' };
const BARANDA: Cara = { color: '#3a3f46', metalicidad: 0.6, rugosidad: 0.4 };

const EscaleraPatio: React.FC<{ plano: PlanoCampus }> = ({ plano }) => {
  const e = plano.escalera;
  const p = plano.pasarela;
  const huella = (e.x1 - e.x0 - 2) / 2 / PELDANOS_PATIO;
  const contra = PB / PELDANOS_PATIO;
  // La pasarela va de borde a borde de las losas de las galerías
  const zFondo = plano.alaFondo.z1 + GALERIA;
  const zCalle = plano.alaCalle.z0 - GALERIA;
  const tramosPasarela: [number, number][] = [
    [zFondo, e.z0],
    [e.z1, zCalle],
  ];
  return (
    <group>
      {Array.from({ length: PELDANOS_PATIO }, (_, i) => (
        <React.Fragment key={i}>
          <Bloque x={[e.x0 + i * huella, e.x0 + (i + 1) * huella]} y={[0, (i + 1) * contra]} z={[e.z0, e.z1]} todas={PELDANO_PATIO} arriba={HUELLA_PATIO} pared />
          <Bloque x={[e.x1 - (i + 1) * huella, e.x1 - i * huella]} y={[0, (i + 1) * contra]} z={[e.z0, e.z1]} todas={PELDANO_PATIO} arriba={HUELLA_PATIO} pared />
        </React.Fragment>
      ))}
      <Bloque x={[p.x0, p.x1]} y={[0, PB]} z={[e.z0, e.z1]} todas={PELDANO_PATIO} arriba={HUELLA_PATIO} pared />
      {/* Pasarela: losa y parapetos, del descanso a cada galería */}
      {tramosPasarela.map(([z0, z1]) => (
        <React.Fragment key={z0}>
          <Bloque x={[p.x0, p.x1]} y={[PB - 0.3, PB]} z={[z0, z1]} todas={BLANCO} />
          <Parapeto x={[p.x0 - 0.15, p.x0]} z={[z0, z1]} y={PB} />
          <Parapeto x={[p.x1, p.x1 + 0.15]} z={[z0, z1]} y={PB} />
        </React.Fragment>
      ))}
      {/* Pasamanos a los costados de cada tramo */}
      {[e.z0 + 0.05, e.z1 - 0.05].map((z) => (
        <React.Fragment key={z}>
          <Pasamanos desde={[e.x0 + huella / 2, contra, z]} hasta={[p.x0, PB, z]} cara={BARANDA} />
          <Pasamanos desde={[e.x1 - huella / 2, contra, z]} hasta={[p.x1, PB, z]} cara={BARANDA} />
        </React.Fragment>
      ))}
      {/* Maceteros a los pies de la escalera */}
      {[e.x0 - 0.8, e.x1 + 0.8].map((x) => (
        <group key={x} position={[x, 0, (e.z0 + e.z1) / 2]}>
          <mesh position={[0, 0.35, 0]} castShadow>
            <cylinderGeometry args={[0.45, 0.35, 0.7, 10]} />
            <meshStandardMaterial color="#8a4b2d" />
          </mesh>
          <mesh position={[0, 1.1, 0]} castShadow>
            <icosahedronGeometry args={[0.6, 0]} />
            <meshStandardMaterial color="#4f7a3a" flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
};

// Edificio nuevo según las fotos (docs/referencias-upds/bloque-nuevo-estilo):
// muros blancos con zócalo gris, cielo raso de placas con paneles LED,
// porcelanato claro, barandas de acero inoxidable y bancas metálicas
const BLANCO_NUEVO: Cara = { color: '#f3f2ee' };
// Las caras que miran al interior brillan un poco: el cuerpo de la torre les
// hace sombra y en las fotos el pasillo es blanco y luminoso (más barato que
// una luz puntual, que pesaría en todos los materiales de la escena)
const INTERIOR: Cara = { color: '#f1efe8', emisivo: '#f1efe8', intensidadEmisiva: 0.22 };
const CIELO_RASO: Cara = { textura: 'cieloRaso', modulo: [1.2, 1.2], emisivo: '#ffffff', intensidadEmisiva: 0.25 };
const ZOCALO: Cara = { color: '#868c95', rugosidad: 0.7, emisivo: '#868c95', intensidadEmisiva: 0.12 };
// Sin mapa de entorno un metal muy metálico se ve negro: acero apenas metálico
const INOX: Cara = { color: '#d6dade', metalicidad: 0.35, rugosidad: 0.3 };
const MADERA_PUERTA: Cara = { color: '#b8834f', rugosidad: 0.55 };
const MARCO_PUERTA: Cara = { color: '#7a4f2c', rugosidad: 0.6 };
const PUERTA_VIDRIO: Cara = { color: '#6f9692', rugosidad: 0.15, metalicidad: 0.3 };
const ALTO_ZOCALO = 1.1;
/** Losa entre la planta baja y el piso alto del nuevo. */
const LOSA_NUEVO = 0.2;
// Piso alto en color liso: el porcelanato con textura sumaría un material por tamaño de piso
const PISO_ALTO: Cara = { color: '#dedbd3', rugosidad: 0.6 };
const VIDRIO_NUEVO: Cara = { color: '#34424f', rugosidad: 0.12, metalicidad: 0.55 };
const MARCO_NUEVO: Cara = { color: '#d1d5db', metalicidad: 0.6, rugosidad: 0.3 };
const PELDANO: Cara = { color: '#d5d8dc' };
const PELDANO_HUELLA: Cara = { color: '#eceef0' };
const LUMINARIA: Cara = { color: '#ffffff', emisivo: '#f4f8ff', intensidadEmisiva: 1.4 };

/** Paneles LED de cielo raso cada `paso` metros a lo largo de z, centrados en x. */
function luminarias(x: [number, number], z: [number, number], paso: number): [number, number][] {
  const xc = (x[0] + x[1]) / 2;
  const n = Math.max(1, Math.floor((z[1] - z[0]) / paso));
  return Array.from({ length: n }, (_, i) => [xc, z[0] + ((z[1] - z[0]) * (i + 0.5)) / n]);
}

/** Escalera en U junto a la fachada: sube del vestíbulo hacia la calle, descansa y vuelve al piso alto. */
// Los peldaños son `pared`: la cámara se detiene antes de ellos en vez de quedar adentro
const EscaleraNuevo: React.FC<{ e: PlanoCampus['escaleraNuevo'] }> = ({ e }) => {
  const PELDANOS = PELDANOS_U;
  const medio = (e.x0 + e.x1) / 2;
  const descanso = e.z1 - 1.2;
  const huella = (descanso - e.z0) / PELDANOS;
  const contra = PB_NUEVO / 2 / PELDANOS;
  return (
    <group>
      {Array.from({ length: PELDANOS }, (_, i) => (
        <React.Fragment key={i}>
          {/* Primer tramo (del lado de la entrada): sube hacia la fachada */}
          <Bloque x={[e.x0, medio - 0.05]} y={[0, (i + 1) * contra]} z={[e.z0 + i * huella, e.z0 + (i + 1) * huella]} todas={PELDANO} arriba={PELDANO_HUELLA} pared />
          {/* Segundo tramo: vuelve hacia el vestíbulo hasta el nivel 2 */}
          <Bloque x={[medio + 0.05, e.x1]} y={[0, PB_NUEVO / 2 + (i + 1) * contra]} z={[descanso - (i + 1) * huella, descanso - i * huella]} todas={PELDANO} arriba={PELDANO_HUELLA} pared />
        </React.Fragment>
      ))}
      <Bloque x={[e.x0, e.x1]} y={[0, PB_NUEVO / 2]} z={[descanso, e.z1]} todas={PELDANO} arriba={PELDANO_HUELLA} pared />
      {/* Muro entre los dos tramos */}
      <Bloque x={[medio - 0.05, medio + 0.05]} y={[0, PB_NUEVO]} z={[e.z0 + huella, descanso]} todas={INTERIOR} pared />
      {/* Baranda de acero inoxidable del primer tramo: pasamanos inclinado y parantes */}
      <mesh position={[e.x0 + 0.06, 0.9 + PB_NUEVO / 4, (e.z0 + descanso) / 2]} rotation={[-Math.atan2(PB_NUEVO / 2, descanso - e.z0), 0, 0]}>
        <boxGeometry args={[0.05, 0.05, Math.hypot(PB_NUEVO / 2, descanso - e.z0)]} />
        <meshStandardMaterial color={INOX.color} metalness={INOX.metalicidad} roughness={INOX.rugosidad} />
      </mesh>
      {[0, 4, 8].map((i) => (
        <Bloque key={i} x={[e.x0 + 0.04, e.x0 + 0.08]} y={[(i + 1) * contra, (i + 1) * contra + 0.9]} z={[e.z0 + (i + 0.5) * huella - 0.02, e.z0 + (i + 0.5) * huella + 0.02]} todas={INOX} sombra={false} />
      ))}
      {/* Segundo tramo: pasamanos contra el muro, y baranda del piso alto sobre el hueco del primero */}
      <Pasamanos desde={[e.x1 - 0.06, PB_NUEVO / 2, descanso]} hasta={[e.x1 - 0.06, PB_NUEVO, e.z0]} cara={INOX} />
      <Bloque x={[e.x0, medio + 0.05]} y={[PB_NUEVO + 0.9, PB_NUEVO + 0.95]} z={[e.z0 + 0.02, e.z0 + 0.07]} todas={INOX} sombra={false} />
      {[e.x0 + 0.05, (e.x0 + medio) / 2, medio].map((x) => (
        <Bloque key={x} x={[x - 0.02, x + 0.02]} y={[PB_NUEVO, PB_NUEVO + 0.9]} z={[e.z0 + 0.025, e.z0 + 0.065]} todas={INOX} sombra={false} />
      ))}
    </group>
  );
};

export const EdificioNuevo: React.FC<{ plano: PlanoCampus }> = ({ plano }) => {
  const { edificioNuevo: r, entradaNuevo: ent, hallNuevo: hall, pasilloNuevo: pas, conexionNuevo: con, escaleraNuevo: esc, alaCalle } = plano;
  const { hallAlto, pasilloAlto: pasA, conexionAlta: conA } = plano;
  const PB = PB_NUEVO;
  const ALTO = ALTO_NUEVO;
  // La cara del lado del antiguo queda metida en su culata, para que no titile con ella
  const xAntiguo = r.x1 - 0.3;
  const xCulata = hall.x1;
  const xLadrillo = alaCalle.x0 - CULATA;
  // Fachada según la elevación frontal: marco a la izquierda, paño vidriado
  // rehundido al centro, franja vertical de la escalera junto al antiguo
  const xMarco = r.x0 + 2;
  const xFranja = r.x1 - 3;
  const xBorde = r.x1 - 1;
  const yBanda = PB + 1.2;
  const yRemate = NIVELES_NUEVO[NIVELES_NUEVO.length - 1] - 2.4;
  const SALIENTE = 0.5;
  const fz = r.z1;
  const letrero = texturaLetreroUPDS();
  const letras = texturaLetrasTorre();
  const mainelas = [xMarco + (xFranja - xMarco) / 3, xMarco + ((xFranja - xMarco) * 2) / 3];
  const porcelanato: Cara = { textura: 'porcelanato', modulo: [1.2, 1.2] };
  // La bajada ya es del bloque B: piso de baldosa terracota como en la foto de la conexión
  const terracotaPiso: Cara = { textura: 'baldosa', modulo: [1.2, 1.2], color: '#cf9a7c' };
  // Zócalo gris a lo largo de cada muro del interior (x0, x1, z0, z1 de una tira delgada)
  const t = 0.03;
  const zocalos: [number, number, number, number][] = [
    [ent.x0, ent.x0 + t, ent.z0, fz - 0.2],
    [ent.x1 - t, ent.x1, ent.z0, fz - 0.2],
    [hall.x0, hall.x0 + t, hall.z0, hall.z1],
    [hall.x0, pas.x0, hall.z0, hall.z0 + t],
    [hall.x0, ent.x0, hall.z1 - t, hall.z1],
    [pas.x0, pas.x0 + t, pas.z0, hall.z0],
    [pas.x0, xCulata, pas.z0, pas.z0 + t],
    [xCulata - t, xCulata, con.z1, hall.z1],
  ];
  // Piso alto (CAMPUS-03): de la losa de la planta baja al cielo raso de arriba
  const yAlto: [number, number] = [PB, PB + PISO_NUEVO];
  const yLuz = PB - LOSA_NUEVO;
  const zocalosAltos: [number, number, number, number][] = [
    [hallAlto.x0, hallAlto.x0 + t, hallAlto.z0, hallAlto.z1],
    [hallAlto.x0, pasA.x0, hallAlto.z0, hallAlto.z0 + t],
    [pasA.x0, pasA.x0 + t, pasA.z0, hallAlto.z0],
    [pasA.x0, xCulata, pasA.z0, pasA.z0 + t],
    [xCulata - t, xCulata, conA.z1, hallAlto.z1],
  ];
  // Puertas de madera de las aulas del pasillo y la de vidrio de las oficinas (decorado)
  const puertasPasillo = [pas.z1 - 3.5, pas.z1 - 7.5];
  const zPuertaOficina = (hall.z0 + hall.z1) / 2 + 0.4;
  return (
    <group>
      {/* Planta baja: muros macizos alrededor de la entrada, el vestíbulo, el pasillo y la bajada */}
      <Bloque x={[r.x0, hall.x0]} y={[0, PB]} z={[r.z0, fz]} todas={BLANCO_NUEVO} derecha={INTERIOR} pared />
      <Bloque x={[hall.x0, ent.x0]} y={[0, PB]} z={[hall.z1, fz]} todas={BLANCO_NUEVO} derecha={INTERIOR} fondo={INTERIOR} pared />
      <Bloque x={[ent.x1, esc.x0]} y={[0, PB]} z={[esc.z0, fz]} todas={BLANCO_NUEVO} izquierda={INTERIOR} derecha={INTERIOR} fondo={INTERIOR} pared />
      <Bloque x={[esc.x0, xCulata]} y={[0, PB]} z={[esc.z1, fz]} todas={BLANCO_NUEVO} fondo={INTERIOR} pared />
      <Bloque x={[xCulata, r.x1]} y={[0, PB]} z={[alaCalle.z0, fz]} todas={BLANCO_NUEVO} izquierda={INTERIOR} pared />
      <Bloque x={[hall.x0, pas.x0]} y={[0, PB]} z={[r.z0, hall.z0]} todas={BLANCO_NUEVO} frente={INTERIOR} derecha={INTERIOR} pared />
      <Bloque x={[pas.x0, xAntiguo]} y={[0, PB]} z={[r.z0, pas.z0]} todas={BLANCO_NUEVO} frente={INTERIOR} pared />
      {/* Revestimiento blanco sobre la culata del antiguo, a los dos lados de la bajada */}
      <Bloque x={[xCulata, xLadrillo]} y={[0, PB]} z={[r.z0, con.z0]} todas={BLANCO_NUEVO} izquierda={INTERIOR} pared />
      <Bloque x={[xCulata, xLadrillo]} y={[0, PB]} z={[con.z1, alaCalle.z0]} todas={BLANCO_NUEVO} izquierda={INTERIOR} pared />
      <EscaleraNuevo e={esc} />
      {[...luminarias([ent.x0, ent.x1], [ent.z0, fz - 0.6], 2.4), ...luminarias([hall.x0, pas.x0], [hall.z0, hall.z1], 2.4), ...luminarias([pas.x0, pas.x1], [pas.z0, hall.z1], 2.4)].map(([x, z]) => (
        <Bloque key={`${x}:${z}`} x={[x - 0.3, x + 0.3]} y={[yLuz - 0.03, yLuz]} z={[z - 0.3, z + 0.3]} todas={LUMINARIA} sombra={false} />
      ))}
      {zocalos.map(([x0, x1, z0, z1]) => (
        <Bloque key={`${x0}:${z0}:${x1}`} x={[x0, x1]} y={[0, ALTO_ZOCALO]} z={[z0, z1]} todas={ZOCALO} sombra={false} />
      ))}
      {puertasPasillo.map((z) => (
        <group key={z}>
          <Bloque x={[pas.x0, pas.x0 + 0.05]} y={[0, 2.3]} z={[z - 0.6, z + 0.6]} todas={MARCO_PUERTA} sombra={false} />
          <Bloque x={[pas.x0, pas.x0 + 0.08]} y={[0, 2.15]} z={[z - 0.48, z + 0.48]} todas={MADERA_PUERTA} sombra={false} />
          <Bloque x={[pas.x0, pas.x0 + 0.1]} y={[1.0, 1.08]} z={[z + 0.3, z + 0.4]} todas={INOX} sombra={false} />
        </group>
      ))}
      <Bloque x={[hall.x0, hall.x0 + 0.06]} y={[0, 2.3]} z={[zPuertaOficina - 0.55, zPuertaOficina + 0.55]} todas={PUERTA_VIDRIO} sombra={false} />
      {/* Banca metálica de espera contra el fondo del vestíbulo */}
      <Bloque x={[hall.x0 + 0.6, pas.x0 - 0.6]} y={[0.42, 0.47]} z={[hall.z0 + 0.1, hall.z0 + 0.6]} todas={INOX} />
      <Bloque x={[hall.x0 + 0.6, pas.x0 - 0.6]} y={[0.47, 0.85]} z={[hall.z0 + 0.08, hall.z0 + 0.13]} todas={INOX} />
      {[hall.x0 + 0.7, pas.x0 - 0.7].map((x) => (
        <Bloque key={x} x={[x - 0.03, x + 0.03]} y={[0, 0.42]} z={[hall.z0 + 0.15, hall.z0 + 0.55]} todas={INOX} sombra={false} />
      ))}
      <Piso x={[ent.x0, ent.x1]} z={[ent.z0, fz]} cara={porcelanato} />
      <Piso x={[hall.x0, hall.x1]} z={[hall.z0, hall.z1]} cara={porcelanato} />
      <Piso x={[pas.x0, pas.x1]} z={[pas.z0, pas.z1]} cara={porcelanato} />
      {/* Desde donde termina el piso del pasillo, para no pisarse con él */}
      <Piso x={[xCulata, alaCalle.x0]} z={[con.z0, con.z1]} cara={terracotaPiso} />

      {/* Losa entre la planta baja y el piso alto, sin el hueco de la escalera:
          cielo raso por debajo, piso por arriba */}
      <Bloque x={[r.x0, xAntiguo]} y={[yLuz, PB]} z={[r.z0, esc.z0]} todas={BLANCO_NUEVO} abajo={CIELO_RASO} arriba={PISO_ALTO} pared />
      <Bloque x={[r.x0, esc.x0]} y={[yLuz, PB]} z={[esc.z0, fz]} todas={BLANCO_NUEVO} abajo={CIELO_RASO} arriba={PISO_ALTO} pared />

      {/* Piso alto: muros macizos alrededor del vestíbulo alto, el hueco de la
          escalera, el pasillo y la salida a la galería del antiguo */}
      <Bloque x={[r.x0, hallAlto.x0]} y={yAlto} z={[r.z0, fz]} todas={BLANCO_NUEVO} derecha={INTERIOR} pared />
      <Bloque x={[hallAlto.x0, esc.x0]} y={yAlto} z={[esc.z0, fz]} todas={BLANCO_NUEVO} derecha={INTERIOR} fondo={INTERIOR} pared />
      <Bloque x={[esc.x0, xAntiguo]} y={yAlto} z={[esc.z1, fz]} todas={BLANCO_NUEVO} fondo={INTERIOR} pared />
      <Bloque x={[hallAlto.x0, pasA.x0]} y={yAlto} z={[r.z0, hallAlto.z0]} todas={BLANCO_NUEVO} frente={INTERIOR} derecha={INTERIOR} pared />
      <Bloque x={[pasA.x0, xAntiguo]} y={yAlto} z={[r.z0, pasA.z0]} todas={BLANCO_NUEVO} frente={INTERIOR} pared />
      <Bloque x={[xCulata, xAntiguo]} y={yAlto} z={[pasA.z0, conA.z0]} todas={BLANCO_NUEVO} izquierda={INTERIOR} pared />
      <Bloque x={[xCulata, xAntiguo]} y={yAlto} z={[conA.z1, esc.z1]} todas={BLANCO_NUEVO} izquierda={INTERIOR} pared />
      <Bloque x={[xCulata, xAntiguo]} y={[PB + ALTO_ABERTURA, yAlto[1]]} z={[conA.z0, conA.z1]} todas={BLANCO_NUEVO} abajo={INTERIOR} pared />
      {[...luminarias([hallAlto.x0, esc.x0], [hallAlto.z0, hallAlto.z1], 2.4), ...luminarias([pasA.x0, pasA.x1], [pasA.z0, hallAlto.z0], 2.4)].map(([x, z]) => (
        <Bloque key={`a${x}:${z}`} x={[x - 0.3, x + 0.3]} y={[yAlto[1] - 0.03, yAlto[1]]} z={[z - 0.3, z + 0.3]} todas={LUMINARIA} sombra={false} />
      ))}
      {zocalosAltos.map(([x0, x1, z0, z1]) => (
        <Bloque key={`a${x0}:${z0}:${x1}`} x={[x0, x1]} y={[PB, PB + ALTO_ZOCALO]} z={[z0, z1]} todas={ZOCALO} sombra={false} />
      ))}
      {puertasPasillo.map((z) => (
        <group key={`a${z}`}>
          <Bloque x={[pasA.x0, pasA.x0 + 0.05]} y={[PB, PB + 2.3]} z={[z - 0.6, z + 0.6]} todas={MARCO_PUERTA} sombra={false} />
          <Bloque x={[pasA.x0, pasA.x0 + 0.08]} y={[PB, PB + 2.15]} z={[z - 0.48, z + 0.48]} todas={MADERA_PUERTA} sombra={false} />
          <Bloque x={[pasA.x0, pasA.x0 + 0.1]} y={[PB + 1.0, PB + 1.08]} z={[z + 0.3, z + 0.4]} todas={INOX} sombra={false} />
        </group>
      ))}

      {/* Resto de la torre, sobre el piso alto: ciega a los costados y atrás */}
      <Bloque x={[r.x0, xAntiguo]} y={[yAlto[1], ALTO]} z={[r.z0, fz]} todas={BLANCO_NUEVO} abajo={INTERIOR} pared />
      {/* Caja de la escalera, que asoma sobre la cubierta junto al antiguo */}
      <Bloque x={[xFranja - 0.3, xAntiguo]} y={[ALTO, ALTO + 3]} z={[fz - 6, fz]} todas={BLANCO_NUEVO} pared />

      {/* Vidriera y puerta de la calle */}
      <Bloque x={[r.x0 + 1, hall.x0 - 0.5]} y={[0.4, PB - 0.4]} z={[fz, fz + 0.06]} todas={{ color: '#a9c7d8', rugosidad: 0.1, metalicidad: 0.3, emisivo: '#3b6a85', intensidadEmisiva: 0.25 }} sombra={false} />
      <Bloque x={[ent.x0, ent.x0 + 0.15]} y={[0, PB]} z={[fz - 0.1, fz + 0.1]} todas={MARCO_NUEVO} />
      <Bloque x={[ent.x1 - 0.15, ent.x1]} y={[0, PB]} z={[fz - 0.1, fz + 0.1]} todas={MARCO_NUEVO} />
      <Bloque x={[ent.x0, ent.x1]} y={[PB - 0.5, PB]} z={[fz - 0.1, fz + 0.1]} todas={MARCO_NUEVO} />
      {/* Marco de la bajada al patio, en la culata del antiguo */}
      {[con.z0, con.z1].map((z) => (
        <Bloque key={z} x={[alaCalle.x0 - CULATA - 0.05, alaCalle.x0 + 0.05]} y={[0, PB - 0.3]} z={[z - 0.1, z + 0.1]} todas={MARCO_NUEVO} />
      ))}

      {/* Banda negra con el letrero iluminado sobre la planta baja */}
      <Bloque x={[r.x0, xBorde]} y={[PB, yBanda]} z={[fz, fz + 0.3]} todas={{ color: '#0b0d10', rugosidad: 0.4 }} />
      <mesh position={[(r.x0 + xBorde) / 2, (PB + yBanda) / 2, fz + 0.32]}>
        <planeGeometry args={[8.4, 1.05]} />
        <meshStandardMaterial map={letrero} emissiveMap={letrero} emissive="#ffffff" emissiveIntensity={1} />
      </mesh>

      {/* Marco izquierdo, borde junto al antiguo y banda alta, salientes del paño */}
      <Bloque x={[r.x0, xMarco]} y={[yBanda, ALTO]} z={[fz, fz + SALIENTE]} todas={BLANCO_NUEVO} />
      <Bloque x={[xBorde, xAntiguo]} y={[yBanda, ALTO]} z={[fz, fz + SALIENTE]} todas={BLANCO_NUEVO} />
      <Bloque x={[xMarco, xFranja]} y={[yRemate, ALTO]} z={[fz, fz + SALIENTE]} todas={BLANCO_NUEVO} />
      <mesh position={[(r.x0 + xFranja) / 2 + 1, (yRemate + ALTO) / 2, fz + SALIENTE + 0.02]}>
        <planeGeometry args={[7.2, 1.8]} />
        <meshStandardMaterial map={letras} roughness={0.85} />
      </mesh>
      {/* Paño vidriado rehundido, con las losas de cada nivel y dos mainelas */}
      <Bloque x={[xMarco, xFranja]} y={[yBanda, yRemate]} z={[fz, fz + 0.05]} todas={VIDRIO_NUEVO} sombra={false} />
      {NIVELES_NUEVO.slice(2).map((n) => (
        <Bloque key={n} x={[xMarco, xFranja]} y={[n - 0.2, n + 0.4]} z={[fz, fz + 0.25]} todas={BLANCO_NUEVO} />
      ))}
      {mainelas.map((x) => (
        <Bloque key={x} x={[x - 0.1, x + 0.1]} y={[yBanda, yRemate]} z={[fz, fz + 0.15]} todas={BLANCO_NUEVO} />
      ))}
      {/* Franja vertical vidriada de la escalera, hasta arriba de su caja */}
      <Bloque x={[xFranja, xBorde]} y={[yBanda, ALTO + 2.6]} z={[fz, fz + 0.2]} todas={VIDRIO_NUEVO} sombra={false} />
    </group>
  );
};

export { ALTO_ANTIGUO, ALTO_NUEVO, PB };
