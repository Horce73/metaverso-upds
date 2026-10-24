import { createContext, useContext } from 'react';
import { AJUSTES_CALIDAD, type AjustesCalidad } from './calidad.js';

/** Ajustes del nivel de calidad vigente; lo provee MetaversoCanvas dentro del <Canvas>. */
export const CalidadContexto = createContext<AjustesCalidad>(AJUSTES_CALIDAD.alta);

export function useCalidad(): AjustesCalidad {
  return useContext(CalidadContexto);
}
