import { useEffect, useState } from 'react';

// `pointer: coarse` es cierto en celulares y tablets (dedo), falso con mouse
// o trackpad. Se re-evalua ante el evento 'change' porque un 2-en-1 puede
// cambiar de tipo de puntero sin recargar la pagina (conectar un mouse USB).
export function useEsTactil(): boolean {
  const [esTactil, setEsTactil] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const onChange = () => setEsTactil(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return esTactil;
}
