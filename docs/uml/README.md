# Diagramas UML 2.x del Metaverso UPDS

Diagramas de la arquitectura **tal como está implementada** en la rama `dev` (commit `b6d996f`), para el informe en LaTeX.

Cada `.html` es la fuente de una figura: un `<svg>` escrito con la skill `uml-design` (`~/Programación/claude-setup/plugins/uml-design`). Se abre en el navegador para verlo. `export/` tiene cada figura en PNG (escala 3, unos 340 ppp en papel).

Las figuras también están insertas en [`../DIAGRAMAS_CASOS_USO.md`](../DIAGRAMAS_CASOS_USO.md) y [`../DIAGRAMA_CLASES_BD.md`](../DIAGRAMA_CLASES_BD.md).

| Diagrama | Figuras (archivo → nombre exportado) | Formato |
|---|---|---|
| Casos de uso | `01a` → `casos-acceso`, `01b` → `casos-aula`, `01c` → `casos-clase` | apaisado |
| Clases | `02a` → `clases-identidad`, `02b` → `clases-academico`, `02c` → `clases-espacios`, `02d` → `clases-tiempo-real` | apaisado |
| Entidad-relación | `03a` → `er-identidad`, `03b` → `er-academico`, `03c` → `er-aula`, `03d` → `er-pizarra-chat`, `03e` → `er-encuestas-grabaciones` | apaisado |
| Secuencia: inicio de sesión | `04` → `secuencia-inicio-sesion` | vertical |
| Secuencia: ingreso al aula y voz | `05a` → `secuencia-ingreso-aula`, `05b` → `secuencia-voz` | vertical |
| Secuencia: clase y asistencia | `06a` → `secuencia-inicio-clase`, `06b` → `secuencia-asistencia`, `06c` → `secuencia-fin-clase` | vertical, `06c` apaisado |
| Componentes | `07` → `componentes` | apaisado |
| Despliegue | `08` → `despliegue` | apaisado |
| Estados de la sesión de clase | `09` → `estados-sesion-clase` | apaisado |

## Insertar en LaTeX

Se usa el **PNG**. Las figuras verticales van a `\textwidth`; las apaisadas, en página girada a `\textheight`. Las dos escalas dan el mismo tamaño de letra en papel (unos 6 pt la más chica).

```latex
\usepackage{graphicx}
\usepackage{rotating}   % sólo para las apaisadas

% vertical
\begin{figure}[htbp]
  \centering
  \includegraphics[width=\textwidth]{uml/export/secuencia-inicio-sesion.png}
  \caption{Secuencia de inicio de sesión.}
  \label{fig:sec-login}
\end{figure}

% apaisada
\begin{sidewaysfigure}
  \centering
  \includegraphics[width=\textheight]{uml/export/clases-espacios.png}
  \caption{Clases del paquete Espacios y clases.}
  \label{fig:clases-espacios}
\end{sidewaysfigure}
```

## Volver a exportar

Desde la raíz del repositorio, que ya tiene `playwright-core`:

```sh
S=~/Programación/claude-setup/plugins/uml-design/skills/uml-design/scripts/exportar.mjs
node $S docs/uml --solo-verificar           # sólo revisa la geometría
node $S docs/uml --salida docs/uml/export --formatos png   # revisa y exporta
```

El script mide cada figura en Chromium. Si un texto se sale de su caja, dos rótulos se pisan o una línea atraviesa una caja ajena, no exporta y dice cuál es el problema. Para editar una figura, se cambia su `<svg>` en el `.html`. Los generadores con los que se armaron están en `~/Programación/claude-setup/plugins/uml-design/ejemplos/generadores/`.

---

## Por qué hay más de una figura por diagrama

La skill fija un máximo de elementos por figura para que se lea impresa: 16 casos de uso, 10 clases, 9 tablas, 7 líneas de vida y unos 30 mensajes. Cuando un diagrama se pasa, primero se prueba en formato apaisado, y sólo si tampoco cabe se parte.

- **Casos de uso:** 26 casos y 6 actores. En una sola figura las asociaciones se cruzan sin remedio, así que se parte por grupo de actores.
- **Clases:** por paquete. Las clases de otro paquete aparecen como cajas grises con el nombre calificado (`Académico::Asignatura`), para que ninguna relación quede colgando.
- **Entidad-relación:** por dominio. Las tablas de otra figura aparecen en gris, sólo con su PK.
- **Secuencias:** el flujo 2 tiene unos 50 mensajes y el 3 unos 55, así que se parten por tramo. Cada figura remite a las otras con un fragmento `ref`.

## 1. Casos de uso (01a, 01b, 01c)

**Respaldo en el código**

| Caso de uso | Fuente |
|---|---|
| Ingresar como invitado | `server/src/index.ts:387`; `src/App.tsx:465` |
| Invitado sólo en el campus | `server/src/index.ts:482`; `server/src/socketHandler.ts:223` |
| Registrarse / Solicitar rol docente («extend») | `server/src/index.ts:188`, `:198-204`, `:225`; `src/components/Login.tsx:115` |
| Iniciar sesión | `server/src/index.ts:292`; `src/components/Login.tsx:175` |
| Personalizar avatar | `server/src/index.ts:587` |
| Datos personales y consentimientos | `server/src/index.ts:1581`, `:1597`, `:1662`, `:1678` |
| Explorar el campus | `server/src/socketHandler.ts:206`, `:353` |
| Conversar por voz | `src/components/AudioClient.ts:229`; `src/App.tsx:581` |
| Enviar mensaje de chat | `server/src/socketHandler.ts:674`, `:717-718` |
| Ingresar a un aula | `server/src/socketHandler.ts:227-241` |
| Canjear código del curso («extend») | `server/src/accesoAulaServidor.ts:53`; `src/components/SolicitudAccesoModal.tsx:82` |
| Solicitar acceso al docente («extend») | `server/src/socketHandler.ts:477`; respuesta en `:642` |
| Registrar asistencia («extend» de Ingresar, «include» de Iniciar clase) | `server/src/socketHandler.ts:339-341`; `server/src/index.ts:646`, `:763`; `server/src/socketHandler.ts:146` |
| Dibujar en la pizarra | `server/src/socketHandler.ts:97-99`, `:395` |
| Ver y descargar materiales; subir y mostrar | `server/src/materiales.ts:124`, `:158`, `:187`, `:237` |
| Levantar la mano | `server/src/socketHandler.ts:510-515` |
| Votar en una encuesta | `server/src/socketHandler.ts:562` |
| Iniciar clase | `server/src/index.ts:663`; `src/components/CrearCursoModal.tsx:44` |
| Finalizar clase (docente dueño o administrador) | `server/src/index.ts:785`, `:800-803` |
| Moderar el aula | `server/src/socketHandler.ts:497` (silenciar), `:522` (ceder palabra), `:547` (encuestas), `:586` (grabación), `:603` (grupos), `:615` (pantalla) |
| Consultar asistencia y actas | `server/src/reporteAsistencia.ts:89`, `:114`, `:161`; `server/src/grabacionServidor.ts:152`, `:176`; `server/src/index.ts:1811` |
| Gestionar usuarios y catálogos (carreras, asignaturas, espacios) | `server/src/index.ts:1050-1559` |
| Resolver solicitudes de docente | `server/src/solicitudesDocente.ts:12`, `:29` |
| Bitácora, panel y mapa de calor | `server/src/bitacoraAdmin.ts:55`; `server/src/index.ts:834`; `server/src/mapaCalorServidor.ts:54` |

**Decisiones de notación**

- **Seis actores, no tres.** El código tiene un cuarto rol real, *Invitado* (JWT sin fila en la base). Para no repetir asociaciones se agregan dos actores abstractos, en cursiva:
  - *Participante*: lo que hace cualquiera en el campus.
  - *Usuario registrado*: lo que hace cualquiera con cuenta.

  La jerarquía completa está en la `01a`. En la `01b` sólo aparece Estudiante → Usuario registrado, porque es la parte que esa figura usa.
- **Administrador no hereda de Docente.** Comparte con él Finalizar, Moderar y Consultar asistencia (`esDocenteOAdmin`, `socketHandler.ts:103`), pero no puede iniciar una clase (`requiereRol('docente')`, `index.ts:663`). En la `01c` esos tres casos van en una fila entre los dos actores: el docente llega desde arriba y el administrador desde abajo, sin cruces.
- **«extend»** sólo donde el código tiene una condición explícita. La flecha va del caso que extiende al caso base, y la condición se escribe debajo del caso que extiende.
- **«include»** sólo en *Iniciar clase → Registrar asistencia*: `registrarPresentesEnAula` se ejecuta siempre al iniciar. Al entrar a un aula, en cambio, *Registrar asistencia* es un «extend», porque sólo registra si hay clase en curso y el estudiante está inscrito (`helpers.ts:30`, `:41`).
- *Registrarse* se asocia a Estudiante: el registro público siempre crea un estudiante (`index.ts:203`).
- *Responder solicitud de acceso* sólo con Docente. El servidor también se lo permite al administrador (`socketHandler.ts:647`), pero el cliente sólo muestra la solicitud a los docentes (`App.tsx:417`).
- Asociaciones actor–caso como rectas sin punta (UML 2). Las de un mismo actor salen de puntos separados y en un orden que evita que se crucen.

## 2. Clases (02a–02d)

**Respaldo en el código**

- Entidades y atributos: `server/migrations/0001_esquema_inicial.up.sql:24-278`, más `0003` (tramos), `0007` (encuestas y votos), `0008` (grabaciones), `0009` (solicitudes) y `0010` (`confirmada`).
- Generalización Espacio → Campus/Aula: discriminador `tipo` y `CHECK chk_espacio_aula` (`0001:188`, `:194-197`).
- `Identidad` y `UserState`: `server/src/socketHandler.ts:43-61`. `activeUsers`: `:63`. `resolverIdentidad`: `:110`. `registrarPresentesEnAula`: `:146`. `setupSockets`: `:154`.
- `Pases`: `server/src/accesoAula.ts:16-31`. `helpers`: `server/src/helpers.ts:5`, `:16`, `:99`, `:108`.
- `AudioClient`: `src/components/AudioClient.ts:79-129` (atributos), `:171`, `:337`, `:471`, `:532`, `:542`, `:609`, `:874`, `:884`.
- Opciones de encuesta, de 2 a 6: `server/src/encuestas.ts:5-6`. `EstadoAsistencia` sólo `presente | tarde`: `server/src/helpers.ts:48`.

**Decisiones de notación**

- **Visibilidad real.** Los atributos de las entidades son privados (`-`). Los campos de las interfaces TypeScript son públicos (`+`), como están declarados. En `Pases` y `AudioClient`, `private` es `-`. No se usa `#` porque el código no declara ningún miembro `protected` (comprobado con `grep`).
- **Los métodos no se inventan.** El backend es procedural: las entidades son filas de PostgreSQL, sin métodos. Las operaciones están en las clases que sí las tienen (`Pases`, `AudioClient`) y en los módulos de funciones, dibujados como clases «utility» con operaciones estáticas (subrayadas).
- **Operaciones con nombre de parámetro, sin tipos ni retorno.** Con tipos completos, `bitacora(usuarioId: number, evento: string, detalle: string, ip: string): Promise<void>` ocupa más de la mitad del ancho de la figura. UML 2 permite omitirlos; están en el código.
- Atributos en camelCase. La correspondencia con las columnas está en el ER (`password_hash` → `passwordHash`).
- **Criterios de relación:**
  - **Composición** (◆): la parte no existe sin el todo. Su PK es la FK del dueño, o tiene FK `NOT NULL` con `ON DELETE CASCADE` y se crea desde él.
  - **Agregación** (◇): sólo *SesionClase ◇ Material* (`sesion_materiales`), porque el material se comparte entre sesiones.
  - **Clase de asociación**: cuando la tabla puente tiene datos propios. Son `AsignacionRol`, `Inscripcion` y `Voto`.
  - **Dependencia** (- - >): para el uso sin enlace estructural, con estereotipo («create», «use», «call»).
- *SesionClase* y *Encuesta* se componen en **Aula**, no en Espacio. La FK apunta a `espacios`, pero el código sólo las crea en aulas (`index.ts:56-66`; `socketHandler.ts:549`).
- `Asistencia ◆ AsistenciaTramo` es `1..*`: toda asistencia nace con su primer tramo (`helpers.ts:72`). La base no lo exige; en el ER es `o<`.
- `activeCalls` en `AudioClient` es `Map<string, any>`, como en el código (`AudioClient.ts:89`).
- **Fuera del diagrama de clases**, aunque sí están en el ER: `bitacora`, `chat_mensajes`, `pizarra_trazos`, `pizarra_snapshots` y `mapa_calor`. Son registros sin comportamiento propio.
- En `02d` no se dibuja la dependencia `helpers → SesionClase` (`registrarAsistencia` consulta `sesiones_clase`): no hay forma de trazarla sin cruzar otras cajas. Está en el código y en la secuencia `06b`.
- Naranja (foco) en la clase central de cada figura: Usuario, Asignatura, SesionClase y Pases.

## 3. Entidad-relación (03a–03e)

**Respaldo:** `server/migrations/0001` a `0010` (`*.up.sql`). Son las 23 tablas que crea `server/src/migraciones.ts:229` al arrancar el backend (`index.ts:1897`).

**Decisiones de notación**

- **Pata de gallo** (Information Engineering): `‖` exactamente uno, `o|` cero o uno, `o<` cero o muchos.
  - El lado de la tabla referenciada es `‖` si la FK es `NOT NULL`, y `o|` si admite `NULL` (por ejemplo `sesion_id` en chat, pizarra y encuestas, con `ON DELETE SET NULL`).
  - El lado de la tabla con la FK es `o|` si la FK también es PK o `UNIQUE` (1:0..1: avatares, datos personales, perfiles, solicitudes). Si no, `o<`.
- Cada línea entra a la tabla a la altura de la fila de su FK, para que se lea qué columna es.
- PK subrayada; marcas `PK`, `FK`, `UK` y combinadas (`PK FK`). Las columnas que admiten `NULL` van en *cursiva*.
- Tipos exactamente como en las migraciones. Los `CHECK`, índices y `ON DELETE` no se dibujan.
- Las tablas de otra figura van en gris, sólo con su PK. En `03d` y `03e`, `espacios`, `sesiones_clase` y `usuarios` van en una columna al centro, con las tablas que los referencian a los costados.
- Si hay dos FK entre las mismas tablas, la relación lleva el nombre de la columna (`asignado_por`, `resuelta_por`). También se rotulan `subido_por`, `autor_id` e `iniciada_por`.
- `03b` tiene un salto de cruce: `docente_id` pasa sobre `subido_por`.
- Se omite `schema_migraciones` (`server/src/migraciones.ts:65`): es control de versiones del esquema.

## 4–6. Secuencias

**Respaldo**

| Figura | Fuentes |
|---|---|
| `04` inicio de sesión | `src/components/Login.tsx:175-214`; `server/src/limites.ts:22-27`; `server/src/index.ts:292-382`; `src/App.tsx:368-386` |
| `05a` socket e ingreso al aula | `src/App.tsx:389-396`, `:494-578`; `server/src/socketHandler.ts:110-138`, `:156-166`, `:206-342`; `server/src/accesoAulaServidor.ts:53-87` |
| `05b` voz | `src/App.tsx:581-637`; `src/components/AudioClient.ts:171-190`, `:207-227`, `:259-327`, `:337-358`, `:395-420`, `:532-627`; `src/components/zonasVoz.ts:112`; `server/src/index.ts:138-183` |
| `06a` inicio de clase | `src/components/CrearCursoModal.tsx:44`; `server/src/index.ts:663-780`; `server/src/socketHandler.ts:146-152`, `:662-666`; `src/App.tsx:1494` |
| `06b` asistencia | `server/src/socketHandler.ts:339-341`, `:720-735`; `server/src/helpers.ts:16-135` |
| `06c` fin de clase | `src/App.tsx:889-914`; `server/src/index.ts:785-826`; `server/src/socketHandler.ts:668-672` |

**Decisiones de notación**

- **Tipos de mensaje:**
  - Síncrono (punta llena): se espera la respuesta, como HTTP con `await`, SQL o una llamada a función.
  - Asíncrono (punta abierta): eventos de Socket.io (`emit`) y señalización de PeerJS.
  - Respuesta: línea discontinua con punta abierta.
- **`break` para las salidas anticipadas** (`return res.status(4xx)` en el código). Es el operador de UML 2 para "si se cumple, se ejecuta esto y termina la interacción". Deja cada figura en un solo nivel en vez de `alt` anidados de hasta cuatro niveles.
- **`limiteLogin` no es una línea de vida.** Es un *middleware* dentro de Express, así que aparece como la guarda del primer `break`.
- **Creación:** en `05b` la caja de `AudioClient` aparece a la altura del `new AudioClient()` que la crea (notación UML 2 de creación).
- **ICE y los medios** van como un mensaje bidireccional entre los dos `AudioClient`: el audio va de navegador a navegador, sin pasar por el servidor.
- `alt` sólo con ramas que existen en el código, en el orden en que el código las evalúa. Las guardas son las condiciones reales, abreviadas.
- `CrearCursoModal` y `App` se dibujan como una sola línea de vida, "App (docente)": son la misma aplicación cliente. El formulario se nombra en el primer mensaje.
- `cerrarTramosDeSesion` y `detenerGrabacionDeSesion` van como mensajes de Express a sí mismo: son funciones importadas que corren en el mismo proceso.
- Las figuras de un flujo se enlazan con `ref`: `05a` ↔ `05b` en `handleJoinSpace` y `join_space`; `05a` y `06a` → `06b` en `registrarAsistencia`.

## 7. Componentes

**Respaldo:** `package.json` (React, three, socket.io-client, peerjs); `server/package.json` (express, socket.io, peer, pg, jsonwebtoken); `server/src/index.ts:110-152` (rutas, Socket.io y PeerServer sobre el mismo servidor HTTP); `server/src/middleware/auth.ts`; `server/src/db.ts`; `docker-compose.yml:43-47` (volúmenes de archivos); `server/src/index.ts:165-183` (STUN y TURN).

**Decisiones de notación**

- **Interfaz provista:** piruleta, unida al componente que la implementa (API REST, Tiempo real, Señalización, PostgreSQL, Archivos, STUN, TURN).
- **Interfaz requerida:** enchufe. Las tres interfaces hacia el backend se requieren desde el **borde del subsistema** Frontend, porque las usan varios de sus componentes (App, Paneles y AudioClient llaman a `/api`).
- Frontend y Backend son componentes «subsystem» con sus partes dentro. Las dependencias internas van con línea discontinua; un cruce lleva salto.
- El servicio de tiempo real son dos componentes: Socket.io (eventos) y PeerServer (señalización WebRTC). Corren en el mismo proceso Node; eso se ve en el despliegue.
- `fs` es la interfaz de archivos: el módulo de Node con el que el dominio lee y escribe en los volúmenes.
- La API REST también usa `db.ts` directamente; esa dependencia se omite para no cruzar el subsistema.
- STUN y TURN son externos (gris). TURN es opcional: sólo se usa si `TURN_URLS`, `TURN_USERNAME` y `TURN_CREDENTIAL` están definidos (`index.ts:171-180`).

## 8. Despliegue

**Respaldo:** `docker-compose.yml:1-88`; `nginx.conf:38` (`/api`), `:51` (`/socket.io`), `:69` (`/peer`); `Dockerfile` y `server/Dockerfile`; `server/.env.example:18-20` (TURN); `src/components/AudioClient.ts:259-267` (PeerJS por el mismo origen); `docs/tunel.md`.

**Decisiones de notación**

- Nodos como cubos, anidados: «device» ⊃ «executionEnvironment» (navegador o contenedor Docker) ⊃ «artifact».
- Rutas de comunicación sin flecha, con protocolo y puerto. HTTPS y WSS sólo existen entre el navegador y Cloudflare: el túnel termina el TLS, y nginx escucha HTTP en `:80`.
- Línea discontinua para lo opcional o alternativo: TURN (sin configurar por defecto) y el acceso directo por LAN a `:5173`.
- WebRTC va entre navegadores (DTLS-SRTP sobre UDP); el servidor sólo da la señalización.
- Los tres volúmenes de Docker se agrupan en un nodo «storage»: `db` monta `postgres_data`, y `backend` monta `materiales_data` y `grabaciones_data`.

## 9. Estados de la sesión de clase

**Respaldo:** `server/migrations/0001_esquema_inicial.up.sql:213-214` (`CHECK` de estados); `server/src/index.ts:638-643` y `:744-748` (creación en `en_curso`); `:730-741` (crear-curso cierra la clase previa del mismo docente); `:801-818` (finalizar); `server/src/grabacionServidor.ts:36-60` (sólo se graba con clase en curso); `server/src/helpers.ts:16`, `:108`.

**Decisiones de notación**

- La transición inicial lleva el disparador «create»; UML 2.5 lo permite sólo en el primer nivel. Las precondiciones van en una nota, porque una transición inicial no admite guarda.
- Las transiciones siguen el formato `evento [guarda] / efecto`.
- `en_curso` es un estado compuesto. Su compartimento lleva las actividades internas (`entry /` y `evento / acción`) y una región con la grabación: *Sin grabar* ⇄ *Grabando*.
- Los nombres de estado son los literales de la base (`en_curso`, `finalizada`).
- **Trabajo futuro:** `programada` y `cancelada` se dibujan con borde discontinuo y en gris, con transiciones discontinuas rotuladas "(futuro)" y una nota que explica que el esquema los admite pero ninguna ruta los escribe. UML no tiene notación propia para "previsto"; los eventos de esas transiciones no están definidos en el código, así que sólo se nombran.

---

## No implementado (no se dibuja)

| Qué | Evidencia |
|---|---|
| Estados `programada` y `cancelada` de la sesión de clase | Están en el `CHECK` (`0001:213-214`) y las consultas los leen (`helpers.ts:23`), pero ninguna ruta los escribe. Se dibujan en la figura `09` como trabajo futuro. |
| Programar una clase a futuro desde el Panel de Docente | `src/components/TeacherPanel.tsx:30` llama a `POST /api/docente/clases`, que **no existe** en el backend. El formulario falla en silencio. |
| Estado de asistencia `ausente` guardado | El `CHECK` lo permite (`0001:233`), pero nunca se inserta. Se calcula al vuelo en los reportes (`asistencia.ts:114`; `index.ts:1862`). |
| Rol `invitado` en `usuario_roles` | El rol está en el catálogo (`0001:289`), pero los invitados no tienen fila en `usuarios`: el rol sólo vive en el JWT (`index.ts:395`). |
| Recuperar contraseña por el propio usuario | No hay ruta. Sólo el administrador la restablece (`index.ts:1200`). |
| Registro de asistencia por REST desde el cliente | `POST /api/asistencia` existe (`index.ts:1709`), pero el frontend no la usa: la asistencia se registra por socket. |
| Consulta `GET /api/sesiones` y `POST /api/sesiones` desde el cliente | Existen (`index.ts:1748`, `:613`), pero el frontend no las llama. `POST /api/sesiones` aparece en el diagrama de estados porque es una forma real de crear la sesión. |
| Servidor TURN propio | El código lo soporta, pero el repositorio no provee ninguno (`server/.env.example:18-20` vacío). |

## Decisiones tomadas

1. **Documentación previa:** `docs/DIAGRAMAS_CASOS_USO.md` y `docs/DIAGRAMA_CLASES_BD.md` (v2.3, de la época MySQL/PHP) se reemplazaron por la versión 3.0, alineada con el código y las migraciones y con estas figuras insertas.
2. **Estados `programada` y `cancelada`:** se muestran en la figura `09` como trabajo futuro, separados de lo implementado.
