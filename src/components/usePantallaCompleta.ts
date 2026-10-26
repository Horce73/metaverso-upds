import { useCallback, useEffect, useState } from 'react';

// Pantalla completa en el navegador: en el celular la barra de direcciones
// se come buena parte del alto, sobre todo en horizontal. Safari en iPhone no
// tiene la API (ahí lo que sirve es instalar la app, ver manifest.webmanifest).
export function usePantallaCompleta() {
  const disponible = typeof document !== 'undefined' && !!document.fullscreenEnabled;
  const [activa, setActiva] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement);

  useEffect(() => {
    const alCambiar = () => setActiva(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', alCambiar);
    return () => document.removeEventListener('fullscreenchange', alCambiar);
  }, []);

  const alternar = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    }
  }, []);

  return { disponible, activa, alternar };
}
