# App flow

Recorridos de usuario y de datos de las mejoras. Los diagramas son Mermaid (GitHub los dibuja). Para el informe impreso, la skill `uml-design` puede convertirlos en las figuras del estilo de `docs/uml/`.

## 1. Mapa de navegación

Rutas actuales (hash): `/`, `/login`, `/espacios`, `/metaverso`, `/admin`, `/docente`. Nuevas en negrita.

```mermaid
flowchart TD
  L["/ Landing"] --> LG["/login"]
  L --> G["Ingreso invitado"] --> E
  L --> CAR["Cartelera: próximos eventos"]
  CAR --> EV["**/evento/:token**<br/>página pública"]
  EV -->|entrar como oyente| M
  LG --> E["/espacios"]
  E --> M["/metaverso<br/>campus o aula"]
  E --> D["/docente"]
  E --> A["/admin"]
  D --> ME["**Mis eventos**<br/>crear · enlace · iniciar"]
  A --> MO["**Moderación**<br/>bitácora · sanciones"]
  M --> PM["**Panel de moderación**<br/>(solo moderadores)"]
```

## 2. Quién ve qué

| Ruta o función | Invitado | Oyente | Estudiante | Docente | Admin |
|---|---|---|---|---|---|
| Landing y cartelera | ✔ | ✔ | ✔ | ✔ | ✔ |
| Campus | ✔ | — | ✔ | ✔ | ✔ |
| Aula propia | — | — | ✔ | ✔ | ✔ |
| Espacio de **su** evento | — | ✔ (solo en curso) | ✔ | ✔ | ✔ |
| Gestos y reacciones | ✔ | reacciones | ✔ | ✔ | ✔ |
| Voz (emitir) | ✔ campus | ✘ (con palabra cedida, sí) | ✔ | ✔ | ✔ |
| Chat | ✔ campus | si el evento lo permite | ✔ | ✔ | ✔ |
| Reportar | — | ✔ | ✔ | ✔ | ✔ |
| Crear evento | — | — | — | ✔ | ✔ |
| Moderar | — | — | — | su aula/evento | todo |

## 3. Flujo A — Gesto o reacción

```mermaid
sequenceDiagram
  actor U as Usuario
  participant C as Cliente
  participant S as Servidor (socketHandler)
  participant O as Otros clientes
  U->>C: pulsa G / toca reacción
  C->>C: reproduce el gesto en su avatar al instante
  C->>S: gesto {id}
  S->>S: cupo por socket · id en lista cerrada · ¿sancionado?
  alt válido
    S->>O: gesto_difundido {socketId, id} (solo cercanos)
  else cupo excedido o id inválido
    S--xC: se descarta en silencio
  end
  O->>O: animan el gesto del avatar remoto
```
Casos borde: sentado → gesto reducido; reacciones a todo el espacio; oyente → solo reacciones; en modo sin 3D, la reacción aparece en la lista de usuarios.

## 4. Flujo B — Organizar un evento

```mermaid
flowchart TD
  A[Docente o admin abre Mis eventos] --> B[Nuevo evento: qué, cuándo y cuántos, quién]
  B --> C{¿Datos válidos y espacio libre?}
  C -- no --> B
  C -- sí --> D[(eventos: programado)]
  D --> E{¿Visibilidad por enlace y EVENTOS_EXTERNOS activo?}
  E -- sí --> F[Generar enlace firmado con jti]
  E -- no --> G[Solo usuarios de la universidad]
  F --> H[Compartir enlace]
  H --> I[Llega la hora: organizador pulsa Iniciar]
  G --> I
  I --> J[(estado en_curso · se crea sesión de clase)]
  J --> K[Evento en marcha]
  K --> L[Organizador pulsa Finalizar]
  L --> M[(finalizado · cierra asistencias · acta disponible)]
  D --> X[Cancelar → estado cancelado, enlaces revocados]
```

### Estados del evento
```mermaid
stateDiagram-v2
  [*] --> programado
  programado --> en_curso: iniciar
  programado --> cancelado: cancelar
  en_curso --> finalizado: finalizar
  en_curso --> cancelado: cancelar
  finalizado --> [*]
  cancelado --> [*]
```
Un evento que pasa su `fin_programado` sin finalizarse lo cierra el admin o el organizador; no se cierra solo (mismo criterio que RNF-09 para las clases).

## 5. Flujo C — Entrada de un oyente

```mermaid
sequenceDiagram
  actor O as Oyente
  participant W as Página #/evento/:token
  participant API as REST /api/eventos/:id/entrar
  participant S as Socket.io
  O->>W: abre el enlace
  W->>API: validar enlace
  API-->>W: título, fecha, estado
  alt revocado, vencido o cancelado
    W-->>O: «Este enlace ya no es válido»
  else programado
    W-->>O: cuenta regresiva
  else en curso
    O->>W: escribe su nombre y acepta términos
    W->>API: entrar {nombre, acepto}
    API->>API: aforo · vetos (oyenteId/IP) · crea token de oyente
    alt lleno
      API-->>W: cola de espera con posición
    else vetado
      API-->>W: «No puedes entrar a este evento»
    else ok
      API-->>W: token con rol oyente
      W->>S: conectar y join_space del evento
      S->>S: ¿es el espacio de su evento y está en curso?
      S-->>O: join_aceptado
    end
  end
```
Salidas: cerrar la pestaña → `disconnect` anota `ultima_salida`; reingresar con el mismo token entra con el mismo `oyenteId` (los vetos y silencios siguen).

## 6. Flujo D — Pedir la palabra (oyente)

```mermaid
flowchart LR
  A[Oyente pulsa ✋] --> B[servidor: levantar_mano]
  B --> C[Cola visible para el organizador]
  C --> D{¿Cede la palabra?}
  D -- sí --> E[Oyente recibe permiso de voz]
  E --> F[Su voz llega a todos hasta que la devuelve o se la quitan]
  D -- no --> G[Baja la mano o espera]
```
Reutiliza el mecanismo AULA-03; lo nuevo es que el oyente puede ser quien reciba la palabra.

## 7. Flujo E — Reportar y moderar

```mermaid
sequenceDiagram
  actor R as Reportante
  participant S as Servidor
  participant DB as Base de datos
  actor M as Moderador
  actor T as Objetivo
  R->>S: reportar {objetivo o mensaje, motivo}
  S->>DB: INSERT reportes (abierto)
  S->>M: reporte_nuevo (solo moderadores del espacio)
  S-->>R: «Gracias, un moderador lo revisará»
  M->>S: moderar {silenciar_chat, objetivo, 30 min, motivo}
  S->>S: ¿puede moderar? (rol, espacio, no a un admin)
  S->>DB: INSERT sanciones · INSERT bitacora (MOD_SILENCIO) · UPDATE reportes → resuelto
  S->>T: silenciado_por_moderacion {hasta, motivo}
  S->>S: guarda sanción en memoria del espacio
  Note over S,T: Cada chat o señal de voz del objetivo se descarta mientras dure
  S-->>M: confirmación y reporte cerrado
```

### Qué pasa con cada acción

| Acción | Efecto inmediato | Persistencia | Al reconectar |
|---|---|---|---|
| Silenciar voz | Se corta su micrófono y se descartan sus señales | `sanciones` con `hasta` | Sigue silenciado hasta `hasta` |
| Silenciar chat | `chat` devuelve `chat_rechazado` con el motivo | idem | idem |
| Expulsar | `expulsado`, sale del espacio, se cierra su tramo de asistencia | `sanciones` sin `hasta` | No puede volver a ese espacio mientras no se levante |
| Vetar (evento) | Igual que expulsar; para oyentes, por `oyenteId` + hash de IP | `sanciones.veto_evento` | `entrar` responde «No puedes entrar» |
| Eliminar mensaje | Desaparece del chat de todos | `chat_mensajes.eliminado_en` | No aparece en el historial |
| Levantar sanción | Vuelve a la normalidad | `levantada_en` | — |

### Estados de un reporte
```mermaid
stateDiagram-v2
  [*] --> abierto
  abierto --> resuelto: moderador aplica una acción
  abierto --> descartado: moderador lo descarta
  resuelto --> [*]
  descartado --> [*]
```

## 8. Flujo F — Filtro de chat

```mermaid
flowchart TD
  A[Llega chat] --> B[sanearTextoChat]
  B -- vacío o largo --> X1[chat_rechazado]
  B --> C{¿Sancionado en chat?}
  C -- sí --> X2[chat_rechazado con motivo y tiempo]
  C -- no --> D{¿Modo lento y mandó hace poco?}
  D -- sí --> X3[chat_rechazado: espera N s]
  D -- no --> E{¿Palabra bloqueada, enlace o exceso de mayúsculas?}
  E -- sí --> X4[chat_rechazado]
  E -- no --> F[(INSERT chat_mensajes)]
  F --> G[chat_msg_received a todo el espacio]
```
El orden está fijado: primero sanear, luego sanción, luego reglas, luego guardar. Así un mensaje rechazado nunca se persiste.

## 9. Flujo G — Réplica de la facultad (resumen)
Plano (local, fuera de git) → medidas redondeadas en `planoCampus.ts` → geometría en `EdificiosUPDS.tsx` → pruebas de colisión y altura en `pruebas/unidad/planoCampus.test.mjs` → recorrido con `pruebas/escena/recorrer.mjs`. Detalle en el prompt dedicado.

## 10. Casos de error comunes

| Situación | Respuesta de la interfaz |
|---|---|
| Se cae la conexión del socket | Banner «Reconectando…»; al volver, se reaplica el estado (sanciones, evento) |
| El evento termina con oyentes dentro | Pantalla «El evento terminó» con enlace a la cartelera |
| Oyente recarga la página | Vuelve a entrar con su token si el evento sigue en curso |
| El organizador se desconecta | El evento sigue; el aforo y la voz dependen de él, se avisa a los oyentes |
| Moderador pierde el rol a mitad de sesión | Los roles se leen de la base en cada conexión; pierde el panel al reconectar |
| Flag apagado (`EVENTOS_EXTERNOS`, `MODERACION_ACTIVA`) | La función no se muestra; las rutas responden 404 |
