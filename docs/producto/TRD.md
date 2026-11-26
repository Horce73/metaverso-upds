# TRD — Diseño técnico de la mejora

Cómo se construye lo que pide el [PRD](PRD.md), sobre el código que ya existe. Todo lo de aquí es **propuesta**: cada tabla, endpoint o módulo nuevo se aprueba antes de escribirse.

## 1. Punto de partida (lo que ya hay y se reutiliza)

| Pieza | Dónde | Se reutiliza para |
|---|---|---|
| Servidor Express + Socket.io, un solo proceso | `server/src/index.ts` (REST), `server/src/socketHandler.ts` (tiempo real) | Todo lo nuevo; no hay microservicios |
| Identidad del socket: `{userId, esInvitado, nombre, roles}`, roles leídos de la base en cada conexión | `resolverIdentidad` en `socketHandler.ts` | Añadir la identidad `oyente` |
| Cupos por evento de socket | `CUPOS_SOCKET` y `on(evento, cupo, handler)` en `limites.ts` / `socketHandler.ts` | Gestos, reacciones, reportes |
| Saneamiento del chat y su persistencia | `chat.ts`, `chatPersistencia.ts`, tabla `chat_mensajes` | Filtro de moderación como paso siguiente |
| Levantar la mano y ceder la palabra | `preguntas.ts`, eventos `levantar_mano`… | RF-27 sin código nuevo de turnos |
| `silenciar_todos` | `socketHandler.ts` | Base de RF-35 |
| Bitácora | tabla `bitacora`, `bitacoraAdmin.ts` | RF-38 |
| Ciclo de vida de clase | `sesiones_clase`, `PUT /api/sesiones/:id/finalizar` | Mismo patrón para eventos |
| Apariencia saneada y difundida | `apariencia.ts`, evento `apariencia_actualizada` | Patrón para difundir gestos |
| Interés por distancia | `relevanciaPosicion.ts` | Gestos solo a quien está cerca |
| Pase de aula en servidor | `accesoAula.ts`, `accesoAulaServidor.ts` | Pase de evento |
| Modo sin 3D | `VistaSinTresD.tsx`, `LimiteTresD.tsx` | Oyente de bajo consumo |
| Migraciones numeradas con `.up/.down` | `server/migrations/`, última `0010` | `0011`…`0013` |

Convención de datos: ids `SERIAL`, texto cerrado con `CHECK (… IN (…))` en lugar de `ENUM`, `TIMESTAMPTZ`. Se sigue.

## 2. Decisiones técnicas

### 2.1 Gestos y reacciones: efímeros, sin base de datos (RF-19, RF-20)
- El cliente emite `gesto {id}` o `reaccion {id}`. El servidor valida `id` contra una **lista cerrada** (como `sanearApariencia`), añade `socketId` y difunde. No se guarda nada.
- `gesto` se envía solo a quien está dentro del radio de interés (`relevanciaPosicion`), igual que `user_moved`; `reaccion` va a todo el espacio.
- Cupos nuevos: `gesto: [5, 5_000]`, `reaccion: [8, 5_000]`.
- Cliente: el estado de animación vive en un singleton como `posicionesRemotas.ts` (no en React state, para no re-renderizar `App`). `AvatarModel.tsx` lee `gestoActual` y lo mezcla con caminar/sentado por prioridad. Las reacciones flotantes son sprites con textura cacheada (lección: no crear texturas dentro del JSX, `texto3d.ts`).
- Sin migración.

### 2.2 Eventos (RF-29 a RF-33)
- Tabla `eventos` con ciclo de vida igual al de `sesiones_clase`. Un evento **usa un espacio existente** y, al iniciarse, crea o enlaza una `sesiones_clase` para reutilizar asistencia, chat, actas y grabación sin duplicar código (supuesto 5 del PRD).
- Enlace de invitación: JWT firmado con `JWT_SECRET` (`{eventoId, jti}`), con el `jti` guardado en `evento_enlaces` para poder **revocarlo**. No hay URLs adivinables.
- Pase: `POST /api/eventos/:id/entrar` valida enlace, estado (`en_curso` o dentro de la ventana de entrada), aforo y vetos, y devuelve un **token de oyente** (§2.3).
- Cartelera (RF-33): `GET /api/eventos/proximos` público, solo campos no sensibles.

### 2.3 Oyente: tercera identidad (RF-25 a RF-28)
- Token con `isOyente: true`, `oyenteId` (UUID generado en el servidor), `eventoId`, `nombre`. Vive lo que dura el evento más un margen.
- `resolverIdentidad` devuelve `{userId: 0, esOyente: true, oyenteId, eventoId, roles: ['oyente']}`. El `userId: 0` ya es el contrato de los invitados, así que lo existente que filtra por `userId` sigue sin romperse; hay que **revisar cada sitio que compara `esInvitado`** y decidir qué hace con un oyente.
- `join_space`: el oyente solo entra al espacio de **su** evento y solo mientras el evento esté vigente. Hoy los invitados solo entran al campus (`join_rechazado`); se añade la rama del oyente.
- Permisos de oyente en el servidor (nunca en el cliente, RNF-07): puede `levantar_mano`, `reaccion`, `chat` (si `eventos.chat_oyentes`), no puede dibujar en la pizarra, compartir pantalla, grabar ni mover mobiliario.
- Para quien no entiende `userId: 0` en moderación: los oyentes **sí tienen identidad estable** (`oyenteId`, más un hash de IP guardado solo para vetos), a diferencia del invitado.

### 2.4 Voz con oyentes: el límite real
La voz es una malla (ADR 0001): la CPU crece por flujo **recibido**. Un oyente solo recibe, pero el **emisor** (docente) sube un flujo por cada oyente, y eso sí escala con el público.
- v1: el oyente recibe únicamente del docente y de quien tiene la palabra (extiende VOZ-03). Tope de oyentes con audio: **configurable, 20 por defecto**, a validar con el harness `carga:voz`. Más allá, entran solo con vista (reacciones, chat, pantalla por imágenes: ADR 0002).
- Si el piloto necesita más, se activa el plan B ya escrito en el ADR 0001 (SFU). No se promete en este plan.

### 2.5 Moderación (RF-34 a RF-39)
- Núcleo **puro** en `server/src/moderacion.ts` (sin Express ni Socket.io) para probarlo con `node --test`: `puedeModerar(rolesActor, contexto)`, `evaluarMensaje(texto, reglas, historial)`, `calcularSancion(...)`, `estaSancionado(sanciones, ahora)`.
- Capa de red en `moderacionServidor.ts`, patrón de `encuestasServidor.ts`.
- Tablas: `reportes`, `sanciones`, `moderacion_reglas` (§ esquema). La bitácora usa la tabla existente `bitacora` con eventos nuevos (`MOD_SILENCIO`, `MOD_EXPULSION`, `MOD_VETO`, `MOD_REPORTE_RESUELTO`).
- **Quién puede qué**: admin en cualquier espacio; docente en sus aulas y en sus eventos; nadie modera a un admin; un docente no veta de la plataforma, solo de su evento.
- Sanciones activas en memoria por espacio (como `preguntas.ts`) y persistidas en `sanciones`. Se consultan al `join_space` y en `chat` / audio, así que sobreviven a recargar la página.
- Silencio de voz: el servidor emite `silenciado_por_moderacion` y el cliente corta el micrófono; el servidor además **descarta** las señales de ese socket (no depende de que el cliente obedezca).
- Expulsión: `expulsado {motivo}`, `socket.leave` y desconexión del espacio; el cierre de tramos de asistencia reutiliza el flujo de `disconnect` (lección DATA-01: no cerrar tramos con `NOW()` de la transacción).
- Filtro de chat: se ejecuta **después** de `sanearTextoChat`. Orden: sanear → sancionado → reglas (palabras, enlaces, ráfaga, modo lento) → persistir → difundir. El rechazo devuelve `chat_rechazado` (ya existe).

### 2.6 Diseño (RF-23, RF-24)
- Los tokens ya están en `src/index.css` (`--upds-primary`, `--panel-bg`, …). Se completan (escala de espaciado, radios, sombras, z-index, tipografía) y se documentan en [UIUX.md](UIUX.md); no se agrega librería de componentes.
- Cambios visuales no tocan lógica de escena ni protocolos.

### 2.7 Réplica de la facultad (RF-40, RF-41)
Se hace sobre `planoCampus.ts` (lógica pura, probada) y `EdificiosUPDS.tsx`. El procedimiento y las restricciones están en el prompt dedicado. Regla fija: **los planos no se suben al repo**.

## 3. Contratos nuevos

### 3.1 Socket.io

| Evento | Dirección | Payload | Quién | Cupo |
|---|---|---|---|---|
| `gesto` | cliente → servidor | `{id}` | cualquiera conectado | 5 / 5 s |
| `gesto_difundido` | servidor → cercanos | `{socketId, id, t}` | | |
| `reaccion` | cliente → servidor | `{id}` | cualquiera, incluido oyente | 8 / 5 s |
| `reaccion_difundida` | servidor → espacio | `{socketId, id}` | | |
| `reportar` | cliente → servidor | `{tipo, objetivoSocketId \| mensajeId, motivo}` | cualquiera | 3 / min |
| `reporte_nuevo` | servidor → moderadores del espacio | `{reporteId, …}` | | |
| `moderar` | cliente → servidor | `{accion, objetivoSocketId, minutos?, motivo}` | moderador | 20 / min |
| `silenciado_por_moderacion` | servidor → objetivo | `{hasta, motivo}` | | |
| `expulsado` | servidor → objetivo | `{motivo, hasta?}` | | |
| `modo_lento` | servidor → espacio | `{segundos}` | | |
| `evento_estado` | servidor → espacio | `{estado, aforo, oyentes}` | | |

`accion` ∈ `silenciar_voz`, `silenciar_chat`, `expulsar`, `vetar`, `levantar_sancion`.

### 3.2 REST

| Método y ruta | Rol | Para |
|---|---|---|
| `POST /api/eventos` | docente, admin | crear (RF-29) |
| `GET /api/eventos` | autenticado | mis eventos y los visibles |
| `GET /api/eventos/proximos` | público | cartelera (RF-33) |
| `GET /api/eventos/:id` | según visibilidad | detalle |
| `PUT /api/eventos/:id` | organizador, admin | editar o cancelar |
| `PUT /api/eventos/:id/iniciar` · `…/finalizar` | organizador, admin | ciclo de vida |
| `POST /api/eventos/:id/enlace` · `DELETE …/enlace/:jti` | organizador, admin | crear y revocar enlace |
| `POST /api/eventos/:id/inscripcion` | autenticado u oyente | RSVP |
| `POST /api/eventos/:id/entrar` | público con enlace | token de oyente |
| `GET /api/eventos/:id/asistentes` | organizador, admin | lista con entrada y salida |
| `GET /api/moderacion/reportes` · `PUT …/:id` | moderador | cola y resolución |
| `GET/PUT /api/moderacion/reglas/:espacioId` | docente del espacio, admin | reglas del filtro |
| `GET /api/admin/moderacion` | admin | bitácora y sanciones |

Todo va detrás de `authenticateJWT` y `requiereRol` salvo lo marcado público, y bajo `limiteApi`. Las rutas públicas (`entrar`, `proximos`) llevan limitador propio como `limiteInvitado`.

### 3.3 Flags (puntos que necesitan aprobación institucional)
`EVENTOS_EXTERNOS` (oyentes sin cuenta) y `MODERACION_ACTIVA`, por variable de entorno, **apagados por defecto**. Con el flag apagado las rutas responden 404 y la UI no muestra nada. Se añaden a `.env.example` sin valores sensibles.

## 4. Seguridad

| Riesgo | Control |
|---|---|
| Enlace de evento filtrado | `jti` revocable, expiración, aforo, veto por `oyenteId` y hash de IP |
| Oyente que se hace pasar por docente | Nombre visible con marca «Oyente»; el rol sale del token firmado, no del cliente |
| Inundación de reacciones/gestos | Cupos por socket; descarte silencioso |
| Abuso del propio moderador | Toda acción deja fila en `bitacora`; el admin puede revertir |
| Vetos eludidos con otro nombre | Veto por `oyenteId` + hash de IP; documentado como mitigación parcial |
| XSS en títulos o descripciones de evento | Texto plano, saneado como el chat; el cliente nunca usa `dangerouslySetInnerHTML` |
| Datos de externos | Solo nombre visible y hash de IP; consentimiento en el enlace; se borran a los N días (valor por definir, supuesto 4) |
| GitGuardian | Sin claves literales en pruebas ni CI |

## 5. Rendimiento (RNF-10)

- Presupuesto de red: gestos + reacciones ≤ 5 % del tráfico medido con `npm run carga:trafico` en un aula de 30.
- Sin texturas ni geometrías creadas por frame; sprites de reacción compartidos.
- Los paneles nuevos (eventos, moderación) van en `lazy()` con `Suspense`, como `AdminPanel`; el bundle inicial no crece.
- El mismo `carga:render` antes y después de cada cambio visual; no se acepta caída de FPS.

## 6. Pruebas

| Nivel | Qué | Cómo |
|---|---|---|
| Unidad | `moderacion.ts`, validación de gestos, lógica de eventos (ventanas, aforo) | `pruebas/unidad/*.test.mjs`, `npm run test:unidad` |
| Integración | Rutas REST nuevas, permisos por rol, enlace revocado, aforo | ampliar `server/qa_suite.js` (`npm run test:qa`) |
| Tiempo real | Gesto llega a cercanos; sanción corta chat y voz; oyente no puede dibujar | sockets crudos de `socket.io-client`, estilo `pruebas/carga-trafico` |
| Navegador | Flujo completo con oyente | Playwright con `devices['Pixel 7']` para táctil; Chromium con GPU real |
| Carga | Evento con N oyentes y voz | `carga:voz` ampliado |

CI exige `tsc`, `oxlint`, Frontend y Backend en verde, y una aprobación. Antes del PR: `npm run lint && npm run test:unidad && npm run build` y `cd server && npm run build && npm run test:qa`.

## 7. Riesgos técnicos

| Riesgo | Efecto | Mitigación |
|---|---|---|
| Docente sube un flujo de voz por oyente | La CPU/ancho de banda del docente limita el público | Tope configurable (§2.4); plan B SFU |
| Código que asume `userId > 0` o `esInvitado` | Un oyente cae en rutas no pensadas para él | Auditar cada `esInvitado`/`userId` antes de abrir RF-25 |
| `App.tsx` de 2 000 líneas | Conflictos entre cinco personas | Una rama por tarea, componentes nuevos en archivos propios, nada de refactor general |
| `index.ts` de 1 900 líneas | Igual | Rutas nuevas en módulos `eventosServidor.ts` y `moderacionServidor.ts`, registradas con una línea |
| Conflictos al fusionar en GitHub | Se pierden líneas (ya pasó dos veces) | Resolver en la rama con `git merge dev`, `tsc` y pruebas; verificar que cada archivo llegó |
| Moderación sin respuesta institucional | Regla que luego se revierte | Flag apagado y propuesta escrita |
