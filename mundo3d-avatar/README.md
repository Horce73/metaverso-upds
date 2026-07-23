# Mundo 3D - Avatar y Asistencia (Task 6, partes B y D)

Proyecto en **React + Three.js** (usando `@react-three/fiber`) que implementa:

- **Parte B:** avatar con color/nombre obtenidos de la API, movimiento con
  WASD/flechas, cámara en tercera persona y HUD.
- **Parte D:** trigger en la puerta que hace `POST` a `asistencia.php`,
  muestra un toast de "presente"/"tarde", y botón de salir que cierra sesión.

## 1. Requisitos

- Node.js 18 o superior (`node -v` para comprobar)
- Tu backend PHP (perfil, `asistencia.php`, logout) corriendo en local
  (XAMPP, Laragon, `php -S`, etc.)

## 2. Instalación

```bash
npm install
```

## 3. Trabajar sin backend (modo simulado)

Si aún no tienes el backend de tus compañeros, no necesitas crear uno tú:
en `src/config.js` deja `USAR_MOCK = true` (viene así por defecto). Con eso:

- `perfil.php` se simula con un nombre/color fijo (`src/services/api.js`)
- `asistencia.php` se simula: la primera vez que tocas la puerta responde
  "presente", si vuelves a tocarla responde "tarde" (para poder ver los dos
  toasts sin backend real)
- "Salir" muestra una alerta en vez de redirigir a un login real

Esto te permite probar **todo** el frontend (movimiento, cámara, HUD,
trigger de la puerta, toasts) de forma aislada. Cuando tus compañeros
tengan `asistencia.php`/`perfil.php`/`logout.php` listos, ustedes solo
cambian `USAR_MOCK` a `false` y ajustan las URLs — no hay que tocar nada
más del código (avatar, cámara, HUD, etc. no cambian).

## 5. El campus (Campus Virtual UPDS, simulado)

`src/components/Campus.jsx` arma un patio central con caminos y 4 salas
alrededor (todo geometría simple, sin modelos externos):

- **Aula 101** y **Aula 102**: pupitres en grilla, pizarra, escritorio del profesor
- **Sala de Descanso**: sofás, mesa redonda, máquina expendedora
- **Sala de Decanos**: escritorio, sillas, estantería

Cada sala es un `Edificio` (componente reutilizable en `Edificio.jsx`) con
3 paredes + techo + piso; el frente queda abierto para poder entrar
caminando sin necesitar un sistema de colisiones con puertas. Todas se
orientan automáticamente hacia el patio central.

El portón original (`Door.jsx`, en la entrada) sigue siendo el trigger de
asistencia — está en el camino antes de llegar al patio.

Para agregar más salas, copia un bloque `<Edificio>` en `Campus.jsx` y
cambia `posicion`, `nombre` y los muebles internos (ver `Mobiliario.jsx`
para las piezas disponibles: `Pupitre`, `Pizarra`, `Sofa`, `MesaRedonda`,
`EscritorioDecano`, `SillaOficina`, `Estanteria`, etc).

## 6. Personalizar el avatar

El avatar ahora es una persona (cabeza, torso, brazos y piernas, con
animación de caminar). Abajo a la derecha hay un botón
**"Personalizar avatar"** que abre un panel con 4 pestañas:

- **Ropa:** paletas predefinidas o selector de color libre
- **Piel:** 6 tonos de piel
- **Tamaño:** slider de escala general
- **Accesorios:** sombrero, gafas, mochila (on/off)

Los cambios se aplican en vivo sobre el avatar en el mundo 3D y se guardan
en `localStorage` del navegador, así que persisten al recargar la página.
Esto es independiente del backend: cuando tus compañeros conecten
`perfil.php` de verdad, si más adelante quieren que la personalización se
guarde también en la base de datos, el punto de enganche es la función
`manejarCambiarPersonalizacion` en `src/components/World.jsx` (ahí es
donde harías el `POST` a un endpoint de "guardar personalización").

## 8. Cámara en tercera persona (entra a las salas contigo)

La cámara (`CameraRig.jsx`) sigue la dirección real hacia donde camina el
avatar, no un offset fijo del mundo — así que al entrar a un aula desde
cualquier ángulo, la cámara entra también en vez de quedarse afuera
mirando una pared.

Además ya tiene **colisión con paredes**: lanza un rayo desde el avatar
hacia atrás (hacia donde iría la cámara) y, si detecta una pared antes de
la distancia normal, acerca la cámara para que no la atraviese. Las
paredes de `Edificio.jsx` están marcadas con `userData.esPared` para que
el rayo las reconozca; si agregas más geometría que deba bloquear a la
cámara (por ejemplo un muro nuevo), márcala igual.

## 8.1 Arreglo de las teclas de movimiento

El problema real era que WASD movía al avatar en direcciones **absolutas
del mundo** (W siempre era "hacia -Z", sin importar hacia dónde mirabas),
pero la cámara gira detrás del avatar según hacia dónde camina. Resultado:
después de girar, "adelante" ya no coincidía con lo que veías en pantalla
y el movimiento se sentía roto.

**Arreglado en `Avatar.jsx`:** ahora el movimiento es relativo a la
cámara, como en la mayoría de juegos en tercera persona — W siempre avanza
hacia donde está mirando la cámara (proyectado al plano horizontal), A/D
te desplazan a los lados relativo a esa vista, y el avatar sigue girando
para encarar la dirección en la que caminas.

Además, ya estaban corregidos por separado estos dos problemas de
`useKeyboardControls.js`:

1. Las flechas hacían scroll de la página por defecto del navegador,
   compitiendo con el movimiento → se llama `preventDefault()`.
2. Si la ventana perdía el foco con una tecla presionada, el `keyup`
   nunca llegaba y la tecla quedaba "pegada" → se resetea todo al perder
   el foco (`blur`) o cambiar de pestaña (`visibilitychange`).
## 9. Configurar la conexión con el backend real (cuando exista)

Abre `src/config.js` y ajusta:

```js
export const API_BASE_URL = 'http://localhost/mi-backend'
```

y revisa que los nombres de archivo (`perfil.php`, `asistencia.php`,
`logout.php`) coincidan con los tuyos. Los contratos esperados son:

| Endpoint | Método | Respuesta esperada |
|---|---|---|
| `perfil.php` | GET | `{ "nombre": "Juan", "color": "#3498db" }` |
| `asistencia.php` | POST | `{ "estado": "presente" \| "tarde", "mensaje": "..." }` |
| `logout.php` | POST | destruye la sesión |

Si tu backend usa sesiones PHP por cookie, y el front (puerto 5173) y el
backend están en dominios/puertos distintos, necesitas:
- Habilitar CORS con credenciales en PHP (`Access-Control-Allow-Credentials: true`)
- O usar el proxy de Vite (ver comentario en `vite.config.js`)

## 4. Correr en desarrollo

```bash
npm run dev
```

Abre `http://localhost:5173`.

## 5. Controles

- **W/A/S/D** o **flechas**: mover al avatar
- Acércate a la puerta para disparar el registro de asistencia
- Botón **Salir** (arriba a la derecha): cierra sesión

## 6. Build de producción

```bash
npm run build
```

Genera la carpeta `dist/` lista para desplegar.

## 7. Subir a GitHub

```bash
git init
git add .
git commit -m "Task 6: avatar 3D, controles, cámara, HUD y asistencia"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
git push -u origin main
```

> `node_modules/` y `dist/` ya están excluidos vía `.gitignore`.

## 8. Checklist de pruebas (Task 6 — "Pruebas del mundo 3D")

Ajusta esta lista a los 5 pasos exactos que te dieron en la consigna
original de Task 6; aquí tienes una base ya cubierta por el código:

1. **Consola limpia:** abre DevTools → Console. No debe haber errores rojos
   al cargar el mundo ni al moverte.
2. **Carga de avatar desde la API:** el nombre y color mostrados deben
   coincidir con lo que devuelve `perfil.php` (prueba cambiando el color en
   la BD y recargando).
3. **Movimiento y cámara:** WASD/flechas mueven al avatar y la cámara lo
   sigue en tercera persona sin traspasar el suelo.
4. **Idempotencia de asistencia en BD:** quédate parado sobre la puerta
   varios segundos — gracias al `COOLDOWN_ASISTENCIA_MS` (15s) en
   `src/config.js`, solo debe crearse **un** registro por sesión/cooldown,
   no uno por frame. Verifica en la tabla de asistencia que no se dupliquen
   filas para el mismo alumno en el mismo rango de tiempo.
5. **Logout:** al presionar "Salir", la sesión debe cerrarse en el servidor
   (verifica que un `perfil.php` posterior ya no devuelva datos) y el
   usuario vuelve al login.

## Estructura del proyecto

```
src/
  components/
    Avatar.jsx        # avatar humanoide controlable, con animación de caminar
    Edificio.jsx        # componente reutilizable: paredes + techo + piso + letrero
    Mobiliario.jsx        # piezas simples: pupitre, sofá, escritorio, etc.
    Campus.jsx               # arma el patio + las 4 salas usando Edificio/Mobiliario
    Door.jsx                   # portón de entrada (trigger de asistencia)
    CameraRig.jsx                # cámara en tercera persona (sigue al avatar)
    World.jsx                      # escena completa: luces, campus, lógica de trigger
    HUD.jsx                          # overlay con nombre y botón salir
    CustomizadorAvatar.jsx             # panel de edición: ropa, piel, tamaño, accesorios
    Toast.jsx                            # aviso presente/tarde
  hooks/
    useKeyboardControls.js  # estado de teclas WASD/flechas
  services/
    api.js                   # llamadas a perfil.php / asistencia.php / logout.php
  utils/
    texto3d.js                # helper para generar letreros de texto en 3D
  config.js                    # URLs de API y constantes ajustables
```

## Próximos pasos sugeridos

- Reemplazar las geometrías primitivas del avatar por un modelo GLTF real
  (puedes cargarlo con `useGLTF` de `@react-three/drei`).
- Añadir colisiones con paredes si el mundo tiene más de una habitación.
- Code-splitting si el bundle de Three.js crece mucho (el build actual ya
  avisa que supera 500kB, es normal en proyectos Three.js).
