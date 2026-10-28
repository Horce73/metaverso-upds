import React from 'react';
import { Bloque, Piso, TechoDosAguas, Buhardilla, type Cara } from './piezas.js';
import { texturaLetreroUPDS } from './texturasCampus.js';
import type { PlanoCampus } from './planoCampus.js';

// Edificios de la UPDS (CAMPUS-01), según el frontis y los planos de
// evacuación de docs/referencias-upds:
// - el antiguo: planta baja blanca y tres pisos de ladrillo terracota con
//   relieves escalonados bajo las ventanas, techo de teja con buhardillas,
//   y dos alas alrededor de un patio con galerías;
// - el nuevo: muro cortina de vidrio oscuro entre paneles grises, con el
//   letrero iluminado sobre la planta baja.

const PB = 3.6; // alto de la planta baja del antiguo
const PISO = 3.2;
const PISOS_ARRIBA = 3;
const ALTO_ANTIGUO = PB + PISO * PISOS_ARRIBA; // 13,2
const ALTO_NUEVO = 19.2;

const FACHADA: Cara = { textura: 'fachadaAntigua', modulo: [4.5, PISO] };
const PLANTA_BAJA: Cara = { textura: 'plantaBaja', modulo: [4.5, PB] };
const LADRILLO: Cara = { textura: 'ladrillo', modulo: [2, 2] };
const TERRACOTA: Cara = { textura: 'terracota', modulo: [2, 2] };
const REVOQUE: Cara = { color: '#ece9e2' };
const BLANCO: Cara = { color: '#f4f2ed' };

/** Un ala del edificio antiguo: planta baja (con un pasillo pasante) y tres pisos encima. */
const AlaAntigua: React.FC<{
  x: [number, number];
  z: [number, number];
  paso: [number, number];
  /** Cara hacia el patio: +z para el ala del fondo, -z para la de la calle. */
  patioHacia: 1 | -1;
  exterior: Cara;
}> = ({ x, z, paso, patioHacia, exterior }) => {
  const haciaPatio = patioHacia === 1 ? { frente: LADRILLO, fondo: exterior } : { frente: exterior, fondo: LADRILLO };
  const zPatio = patioHacia === 1 ? z[1] : z[0];
  const zGaleria: [number, number] = patioHacia === 1 ? [z[1], z[1] + 2.5] : [z[0] - 2.5, z[0]];
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
      {/* Galería hacia el patio: losa sobre columnas (las columnas van aparte) */}
      <Bloque x={x} y={[PB - 0.3, PB]} z={zGaleria} todas={BLANCO} />
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
  const { alaCalle, alaFondo, pasoRecepcion, pasoCancha, xFin } = plano;
  const buhardillas = React.useMemo(() => {
    const xs: number[] = [];
    for (let x = alaCalle.x0 + 6; x < xFin - 4; x += 11) xs.push(x);
    return xs;
  }, [alaCalle.x0, xFin]);
  return (
    <group>
      <AlaAntigua x={[alaCalle.x0, alaCalle.x1]} z={[alaCalle.z0, alaCalle.z1]} paso={[pasoRecepcion.x0, pasoRecepcion.x1]} patioHacia={-1} exterior={PLANTA_BAJA} />
      <AlaAntigua x={[alaFondo.x0, alaFondo.x1]} z={[alaFondo.z0, alaFondo.z1]} paso={[pasoCancha.x0, pasoCancha.x1]} patioHacia={1} exterior={REVOQUE} />
      {buhardillas.map((x) => (
        <Buhardilla key={x} x={x} z={alaCalle.z1 - 1.4} y={ALTO_ANTIGUO + 0.25} />
      ))}
      {buhardillas.slice(1).map((x) => (
        <Buhardilla key={`f${x}`} x={x} z={alaFondo.z0 + 1.4} y={ALTO_ANTIGUO + 0.25} sentido={-1} />
      ))}

      {/* Culatas del patio: el muro que lo cierra a cada lado (con la conexión al edificio nuevo) */}
      <Bloque x={[alaCalle.x1 - 0.5, alaCalle.x1]} y={[0, ALTO_ANTIGUO]} z={[alaFondo.z1, alaCalle.z0]} todas={TERRACOTA} pared />
      <Bloque x={[alaCalle.x0 - 0.6, alaCalle.x0]} y={[0, ALTO_ANTIGUO]} z={[alaFondo.z1, plano.conexionNuevo.z0]} todas={TERRACOTA} pared />
      <Bloque x={[alaCalle.x0 - 0.6, alaCalle.x0]} y={[PB, ALTO_ANTIGUO]} z={[plano.conexionNuevo.z0, alaCalle.z0]} todas={TERRACOTA} />

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
          <Bloque x={[x - 0.24, x + 0.24]} y={[0, 1.0]} z={[z - 0.24, z + 0.24]} todas={{ color: '#7d8590' }} sombra={false} />
        </group>
      ))}
      <EscaleraPatio plano={plano} />
    </group>
  );
};

// Escalera de dos tramos que sube a la galería del primer piso (decorado)
const EscaleraPatio: React.FC<{ plano: PlanoCampus }> = ({ plano }) => {
  const e = plano.escalera;
  const centro = (e.x0 + e.x1) / 2;
  const PELDANOS = 10;
  const huella = (e.x1 - e.x0 - 2) / 2 / PELDANOS;
  const contra = PB / PELDANOS;
  return (
    <group>
      {Array.from({ length: PELDANOS }, (_, i) => (
        <React.Fragment key={i}>
          <Bloque x={[e.x0 + i * huella, e.x0 + (i + 1) * huella]} y={[0, (i + 1) * contra]} z={[e.z0, e.z1]} todas={{ color: '#c4c7cb' }} arriba={{ color: '#e8ebee' }} />
          <Bloque x={[e.x1 - (i + 1) * huella, e.x1 - i * huella]} y={[0, (i + 1) * contra]} z={[e.z0, e.z1]} todas={{ color: '#c4c7cb' }} arriba={{ color: '#e8ebee' }} />
        </React.Fragment>
      ))}
      <Bloque x={[centro - 1, centro + 1]} y={[0, PB]} z={[e.z0, e.z1]} todas={{ color: '#c4c7cb' }} arriba={{ color: '#e8ebee' }} />
      {/* Barandas */}
      {[e.z0 + 0.05, e.z1 - 0.05].map((z) => (
        <Bloque key={z} x={[centro - 1, centro + 1]} y={[PB, PB + 1]} z={[z - 0.03, z + 0.03]} todas={{ color: '#3a3f46', metalicidad: 0.6, rugosidad: 0.4 }} sombra={false} />
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

export const EdificioNuevo: React.FC<{ plano: PlanoCampus }> = ({ plano }) => {
  const { edificioNuevo: r, hallNuevo: hall, conexionNuevo: con } = plano;
  const ALTO = ALTO_NUEVO;
  const BASE = 3.8;
  const BANDA = 5.0;
  const VIDRIO: Cara = { textura: 'vidrio', modulo: [4, 4], rugosidad: 0.15, metalicidad: 0.5 };
  const PANEL: Cara = { textura: 'panelGris', modulo: [2.2, 2.2], rugosidad: 0.5, metalicidad: 0.3 };
  const BEIGE: Cara = { color: '#d9d3c7' };
  const letrero = texturaLetreroUPDS();
  return (
    <group>
      {/* Planta baja: a la izquierda del hall (con vidriera) y a la derecha (con la conexión al patio) */}
      <Bloque x={[r.x0, hall.x0]} y={[0, BASE]} z={[r.z0, r.z1]} todas={BEIGE} pared />
      <Bloque x={[hall.x1, r.x1]} y={[0, BASE]} z={[con.z1, r.z1]} todas={BEIGE} pared />
      <Bloque x={[hall.x1, r.x1]} y={[0, BASE]} z={[r.z0, con.z0]} todas={BEIGE} pared />
      <Bloque x={[hall.x0, hall.x1]} y={[0, BASE]} z={[r.z0, hall.z0]} todas={BEIGE} pared />
      <Bloque x={[r.x0 + 1, hall.x0 - 0.8]} y={[0.4, BASE - 0.4]} z={[0, 0.06]} todas={{ color: '#a9c7d8', rugosidad: 0.1, metalicidad: 0.3, emisivo: '#3b6a85', intensidadEmisiva: 0.25 }} sombra={false} />
      <Piso x={[hall.x0, hall.x1]} z={[hall.z0, r.z1]} cara={{ textura: 'baldosa', modulo: [2.4, 2.4] }} />
      <Piso x={[con.x0, con.x1]} z={[con.z0, con.z1]} cara={{ textura: 'baldosa', modulo: [2.4, 2.4] }} />
      {/* Marco de la puerta vidriada del hall */}
      <Bloque x={[hall.x0, hall.x0 + 0.2]} y={[0, BASE]} z={[-0.1, 0.1]} todas={{ color: '#d1d5db', metalicidad: 0.6, rugosidad: 0.3 }} />
      <Bloque x={[hall.x1 - 0.2, hall.x1]} y={[0, BASE]} z={[-0.1, 0.1]} todas={{ color: '#d1d5db', metalicidad: 0.6, rugosidad: 0.3 }} />
      {/* Banda negra con el letrero iluminado */}
      <Bloque x={[r.x0, r.x1]} y={[BASE, BANDA]} z={[r.z0, r.z1 + 0.3]} todas={{ color: '#0b0d10', rugosidad: 0.4 }} />
      <mesh position={[(r.x0 + r.x1) / 2 + 1, (BASE + BANDA) / 2, r.z1 + 0.32]}>
        <planeGeometry args={[8.4, 1.3]} />
        <meshStandardMaterial map={letrero} emissiveMap={letrero} emissive="#ffffff" emissiveIntensity={1} />
      </mesh>
      {/* Muro cortina de vidrio */}
      <Bloque x={[r.x0, r.x1]} y={[BANDA, ALTO - 0.8]} z={[r.z0, r.z1]} todas={PANEL} frente={VIDRIO} pared />
      {/* Cuerpo central vidriado que sobresale */}
      <Bloque x={[r.x0 + 3.2, r.x0 + 8.6]} y={[7.2, ALTO - 2.4]} z={[r.z1, r.z1 + 0.6]} todas={{ ...VIDRIO, color: '#c7d2de' }} />
      {/* Pilares de paneles grises y remate */}
      <Bloque x={[r.x0, r.x0 + 2.2]} y={[BANDA, ALTO]} z={[r.z1, r.z1 + 0.35]} todas={PANEL} />
      <Bloque x={[r.x1 - 4.6, r.x1 - 2.4]} y={[BANDA, ALTO + 0.8]} z={[r.z1, r.z1 + 0.35]} todas={PANEL} />
      <Bloque x={[r.x0, r.x1]} y={[ALTO - 0.8, ALTO]} z={[r.z0, r.z1 + 0.2]} todas={PANEL} />
      {/* Franja de ventanas de marco blanco junto al edificio antiguo */}
      <Bloque x={[r.x1 - 2.2, r.x1]} y={[BANDA, ALTO - 0.8]} z={[r.z1, r.z1 + 0.1]} todas={{ textura: 'vidrio', modulo: [2.2, 2.2], color: '#e2e8f0', rugosidad: 0.15 }} />
    </group>
  );
};

export { ALTO_ANTIGUO, ALTO_NUEVO, PB };
