import React from 'react';
import { Bloque, Piso, TechoDosAguas, Buhardilla, type Cara } from './piezas.js';
import { texturaLetreroUPDS, texturaLetrasTorre } from './texturasCampus.js';
import { ALTO_NUEVO, CULATA, NIVELES_NUEVO, PB_NUEVO, type PlanoCampus } from './planoCampus.js';

// Edificios de la UPDS (CAMPUS-01), según el frontis y los planos de
// evacuación de docs/referencias-upds:
// - el antiguo: planta baja blanca y tres pisos de ladrillo terracota con
//   relieves escalonados bajo las ventanas, techo de teja con buhardillas,
//   y dos alas alrededor de un patio con galerías;
// - el nuevo (CAMPUS-02, según los planos de la ampliación): una torre blanca
//   de 11 niveles con un paño vidriado rehundido en la fachada, la franja
//   vertical de la escalera junto al antiguo y las letras UPDS arriba.

const PB = 3.6; // alto de la planta baja del antiguo
const PISO = 3.2;
const PISOS_ARRIBA = 3;
const ALTO_ANTIGUO = PB + PISO * PISOS_ARRIBA; // 13,2

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

      {/* Culatas del patio: el muro que lo cierra a cada lado (con la bajada desde el edificio nuevo) */}
      <Bloque x={[alaCalle.x1 - 0.5, alaCalle.x1]} y={[0, ALTO_ANTIGUO]} z={[alaFondo.z1, alaCalle.z0]} todas={TERRACOTA} pared />
      <Bloque x={[alaCalle.x0 - CULATA, alaCalle.x0]} y={[0, ALTO_ANTIGUO]} z={[alaFondo.z1, plano.conexionNuevo.z0]} todas={TERRACOTA} pared />
      <Bloque x={[alaCalle.x0 - CULATA, alaCalle.x0]} y={[PB, ALTO_ANTIGUO]} z={[plano.conexionNuevo.z0, plano.conexionNuevo.z1]} todas={TERRACOTA} />
      <Bloque x={[alaCalle.x0 - CULATA, alaCalle.x0]} y={[0, ALTO_ANTIGUO]} z={[plano.conexionNuevo.z1, alaCalle.z0]} todas={TERRACOTA} pared />

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

// Colores del edificio nuevo: casi todo blanco (a confirmar con fotos)
const BLANCO_NUEVO: Cara = { color: '#f3f2ee' };
const VIDRIO_NUEVO: Cara = { color: '#34424f', rugosidad: 0.12, metalicidad: 0.55 };
const MARCO_NUEVO: Cara = { color: '#d1d5db', metalicidad: 0.6, rugosidad: 0.3 };
const PELDANO: Cara = { color: '#d5d8dc' };
const PELDANO_HUELLA: Cara = { color: '#eceef0' };
const LUMINARIA: Cara = { color: '#ffffff', emisivo: '#fff7e6', intensidadEmisiva: 1.4 };

/** Luminarias de cielo raso cada `paso` metros a lo largo de z, centradas en x. */
function luminarias(x: [number, number], z: [number, number], paso: number): [number, number][] {
  const xc = (x[0] + x[1]) / 2;
  const n = Math.max(1, Math.floor((z[1] - z[0]) / paso));
  return Array.from({ length: n }, (_, i) => [xc, z[0] + ((z[1] - z[0]) * (i + 0.5)) / n]);
}

/** Escalera en U junto a la fachada: sube del vestíbulo hacia la calle, descansa y vuelve (decorado). */
const EscaleraNuevo: React.FC<{ e: PlanoCampus['escaleraNuevo'] }> = ({ e }) => {
  const PELDANOS = 11;
  const medio = (e.x0 + e.x1) / 2;
  const descanso = e.z1 - 1.2;
  const huella = (descanso - e.z0) / PELDANOS;
  const contra = PB_NUEVO / 2 / PELDANOS;
  return (
    <group>
      {Array.from({ length: PELDANOS }, (_, i) => (
        <React.Fragment key={i}>
          {/* Primer tramo (del lado de la entrada): sube hacia la fachada */}
          <Bloque x={[e.x0, medio - 0.05]} y={[0, (i + 1) * contra]} z={[e.z0 + i * huella, e.z0 + (i + 1) * huella]} todas={PELDANO} arriba={PELDANO_HUELLA} />
          {/* Segundo tramo: vuelve hacia el vestíbulo hasta el nivel 2 */}
          <Bloque x={[medio + 0.05, e.x1]} y={[0, PB_NUEVO / 2 + (i + 1) * contra]} z={[descanso - (i + 1) * huella, descanso - i * huella]} todas={PELDANO} arriba={PELDANO_HUELLA} />
        </React.Fragment>
      ))}
      <Bloque x={[e.x0, e.x1]} y={[0, PB_NUEVO / 2]} z={[descanso, e.z1]} todas={PELDANO} arriba={PELDANO_HUELLA} />
      {/* Muro entre los dos tramos y baranda del primero */}
      <Bloque x={[medio - 0.05, medio + 0.05]} y={[0, PB_NUEVO]} z={[e.z0 + huella, descanso]} todas={BLANCO_NUEVO} />
      <Bloque x={[e.x0, e.x0 + 0.05]} y={[0.9, 1.0]} z={[e.z0, descanso]} todas={{ color: '#3a3f46', metalicidad: 0.6, rugosidad: 0.4 }} sombra={false} />
    </group>
  );
};

export const EdificioNuevo: React.FC<{ plano: PlanoCampus }> = ({ plano }) => {
  const { edificioNuevo: r, entradaNuevo: ent, hallNuevo: hall, pasilloNuevo: pas, conexionNuevo: con, escaleraNuevo: esc, alaCalle } = plano;
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
  const baldosa: Cara = { textura: 'baldosa', modulo: [2.4, 2.4] };
  return (
    <group>
      {/* Planta baja: muros macizos alrededor de la entrada, el vestíbulo, el pasillo y la bajada */}
      <Bloque x={[r.x0, hall.x0]} y={[0, PB]} z={[r.z0, fz]} todas={BLANCO_NUEVO} pared />
      <Bloque x={[hall.x0, ent.x0]} y={[0, PB]} z={[hall.z1, fz]} todas={BLANCO_NUEVO} pared />
      <Bloque x={[ent.x1, esc.x0]} y={[0, PB]} z={[esc.z0, fz]} todas={BLANCO_NUEVO} pared />
      <Bloque x={[esc.x0, xCulata]} y={[0, PB]} z={[esc.z1, fz]} todas={BLANCO_NUEVO} pared />
      <Bloque x={[xCulata, r.x1]} y={[0, PB]} z={[alaCalle.z0, fz]} todas={BLANCO_NUEVO} pared />
      <Bloque x={[hall.x0, pas.x0]} y={[0, PB]} z={[r.z0, hall.z0]} todas={BLANCO_NUEVO} pared />
      <Bloque x={[pas.x0, xAntiguo]} y={[0, PB]} z={[r.z0, pas.z0]} todas={BLANCO_NUEVO} pared />
      {/* Revestimiento blanco sobre la culata del antiguo, a los dos lados de la bajada */}
      <Bloque x={[xCulata, xLadrillo]} y={[0, PB]} z={[r.z0, con.z0]} todas={BLANCO_NUEVO} pared />
      <Bloque x={[xCulata, xLadrillo]} y={[0, PB]} z={[con.z1, alaCalle.z0]} todas={BLANCO_NUEVO} pared />
      <EscaleraNuevo e={esc} />
      {[...luminarias([ent.x0, ent.x1], [ent.z0, fz - 0.6], 4), ...luminarias([hall.x0, pas.x0], [hall.z0, hall.z1], 3), ...luminarias([pas.x0, pas.x1], [pas.z0, hall.z1], 3)].map(([x, z]) => (
        <Bloque key={`${x}:${z}`} x={[x - 0.6, x + 0.6]} y={[PB - 0.04, PB]} z={[z - 0.2, z + 0.2]} todas={LUMINARIA} sombra={false} />
      ))}
      <Piso x={[ent.x0, ent.x1]} z={[ent.z0, fz]} cara={baldosa} />
      <Piso x={[hall.x0, hall.x1]} z={[hall.z0, hall.z1]} cara={baldosa} />
      <Piso x={[pas.x0, pas.x1]} z={[pas.z0, pas.z1]} cara={baldosa} />
      <Piso x={[con.x0, alaCalle.x0]} z={[con.z0, con.z1]} cara={baldosa} />

      {/* Cuerpo de la torre: once niveles, ciego a los costados y atrás */}
      <Bloque x={[r.x0, xAntiguo]} y={[PB, ALTO]} z={[r.z0, fz]} todas={BLANCO_NUEVO} pared />
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
