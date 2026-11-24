# PRD — Mejora del Metaverso UPDS

| | |
|---|---|
| Estado | Propuesta, pendiente de aprobación |
| Base | rama `dev`, requisitos RF-01…RF-18 de [PROPUESTA_INGENIERIA_SOFTWARE.md](../../PROPUESTA_INGENIERIA_SOFTWARE.md) |
| Requisitos nuevos | RF-19 en adelante, RNF-10 en adelante |
| Documentos hermanos | [TRD](TRD.md) · [UI/UX](UIUX.md) · [App flow](APPFLOW.md) · [Esquema backend](BACKEND_SCHEMA.md) · [Plan de implementación](PLAN_IMPLEMENTACION.md) |

## 1. Contexto

El Metaverso UPDS ya permite dictar una clase 3D completa: campus y aulas, voz espacial, pizarra, asistencia, chat, encuestas, actas y grabación. Se usó en solitario durante el piloto. Ahora entra un equipo de cinco personas y hay que decidir en qué mejorarlo.

Hoy el sistema funciona para **una clase con docente y alumnos inscritos**. Le falta todo lo que ocurre alrededor: que los avatares se expresen, que se vea bien, que entre público que no es de la universidad, que alguien pueda convocar un evento y que haya orden cuando hay mucha gente.

## 2. Objetivo

Pasar de «aula virtual» a «plataforma de encuentros»: la misma base 3D sirve para clases, charlas y eventos abiertos, con reglas claras de convivencia.

**Qué significa que salió bien**
- Un docente o un administrador crea un evento, lo comparte por enlace y 50 personas externas lo siguen sin crear cuenta.
- Un avatar saluda, aplaude, levanta la mano y reacciona, y los demás lo ven.
- Quien molesta se silencia o se expulsa en menos de 10 segundos, y queda registro.

## 3. Usuarios

| Actor | Qué necesita que hoy no tiene |
|---|---|
| Docente / organizador | Convocar un evento con fecha, aforo y enlace; controlar quién habla y quién molesta |
| Estudiante | Expresarse sin voz (gestos, reacciones); sentirse seguro en el chat |
| **Oyente** (nuevo, puede ser externo) | Entrar a un evento por enlace, escuchar, reaccionar y preguntar sin cuenta completa |
| Moderador (nuevo; docente o admin) | Ver reportes, silenciar, expulsar, vetar y dejar constancia |
| Administrador | Auditar eventos y moderación |

El **oyente** no es el invitado actual: el invitado solo ve el campus y no entra a aulas (RF-13). El oyente entra a un espacio concreto, solo durante un evento, con permisos de escucha.

## 4. Alcance por campo de mejora

Cada campo tiene un responsable de implementación. «Con Claude» son los tres que no podrán desarrollar y que se hacen en sesión con Claude.

| # | Campo | Quién | Requisitos |
|---|---|---|---|
| A | Interacción del avatar | Con Claude (tarea de Pedro) | RF-19 a RF-22 |
| B | Pulir diseño | Ignacio | RF-23, RF-24, RNF-10 |
| C | Interacción de oyentes | Cristian | RF-25 a RF-28 |
| D | Creación de eventos | Con Claude (tarea de Lucas) | RF-29 a RF-33 |
| E | Moderación de interacciones | Con Claude (tarea de Melvin) | RF-34 a RF-39 |
| F | Réplica fiel de la facultad | Con Claude (prompt aparte) | RF-40, RF-41 |

### A. Interacción del avatar
| ID | Requisito | Prioridad |
|---|---|---|
| RF-19 | El usuario dispara **gestos** desde una rueda o atajos (saludar, aplaudir, asentir, negar, señalar). Todos en el espacio los ven. | Debe |
| RF-20 | **Reacciones** efímeras sobre el avatar (👍 ❤️ 😂 👏 ❓) que flotan unos segundos. Sirven también a oyentes sin voz. | Debe |
| RF-21 | El avatar **mira** a quien habla o al objetivo señalado (cabeza), sin costo de red extra relevante. | Podría |
| RF-22 | Interacciones con objetos además de sentarse: pizarra, puertas, letreros (tecla `E` unificada). | Podría |

### B. Pulir diseño
| ID | Requisito | Prioridad |
|---|---|---|
| RF-23 | Sistema de diseño único (tokens, componentes, estados) aplicado a landing, login, HUD, paneles y modales. | Debe |
| RF-24 | Revisión de accesibilidad y responsive: foco visible, contraste AA, navegación por teclado, móvil vertical y horizontal. | Debe |
| RNF-10 | Ninguna mejora visual baja el rendimiento medido: el harness `npm run carga:render` no empeora. | Debe |

### C. Interacción de oyentes
| ID | Requisito | Prioridad |
|---|---|---|
| RF-25 | Entrada por **enlace de evento** con solo un nombre visible, sin registro. Emite un token con rol `oyente`. | Debe |
| RF-26 | El oyente **escucha** (voz y pantalla compartida), usa reacciones y escribe en el chat del evento si el organizador lo permite. | Debe |
| RF-27 | El oyente **pide la palabra** (levantar la mano, AULA-03) y el organizador se la cede o no. | Debe |
| RF-28 | Límite de oyentes por evento (aforo) con cola de espera; vista ligera sin 3D reutilizando `VistaSinTresD`. | Podría |

### D. Creación de eventos
| ID | Requisito | Prioridad |
|---|---|---|
| RF-29 | Docente o admin **crea un evento**: título, descripción, fecha y hora, espacio, aforo, visibilidad (interno / por enlace). | Debe |
| RF-30 | Ciclo de vida del evento: programado → en curso → finalizado / cancelado, con el mismo patrón que `sesiones_clase`. | Debe |
| RF-31 | **Enlace de invitación** firmado y revocable; página pública del evento con cuenta regresiva. | Debe |
| RF-32 | **Inscripción** previa (RSVP) y lista de asistentes con hora de entrada y salida. | Debe |
| RF-33 | Cartelera de próximos eventos en el campus (letrero 3D) y en la landing. | Podría |

### E. Moderación de interacciones
| ID | Requisito | Prioridad |
|---|---|---|
| RF-34 | Cualquier participante **reporta** un mensaje o a un usuario con un motivo. | Debe |
| RF-35 | El moderador **silencia** (voz y/o chat) a un usuario por un tiempo y lo **expulsa** del espacio. | Debe |
| RF-36 | El moderador **veta** a un usuario de un evento o de la plataforma. Funciona también con oyentes sin cuenta. | Debe |
| RF-37 | **Filtro de chat** configurable (palabras bloqueadas, enlaces, mayúsculas, ráfagas) y modo lento. | Debe |
| RF-38 | **Bitácora de moderación**: quién hizo qué, a quién, cuándo y por qué. Visible para el admin. | Debe |
| RF-39 | Panel de moderación con cola de reportes y acciones en un clic. | Debe |

### F. Réplica de la facultad
| ID | Requisito | Prioridad |
|---|---|---|
| RF-40 | El campus replica el edificio real de la facultad (plantas, circulaciones, aulas) con medidas fieles. | Debe |
| RF-41 | Cada aula real del plano corresponde a un espacio del sistema con su capacidad. | Podría |

## 5. Fuera de alcance

- Transmitir a miles de personas: se mantiene la malla de voz (ADR 0001). El tope práctico es del orden de 30 con voz; los oyentes reciben audio sin enviar el suyo.
- Moderación automática con IA.
- Monetización, pagos o entradas.
- Aplicación nativa móvil.
- Subir al repositorio los planos o fotos de la universidad (el repo es público).

## 6. Métricas de éxito

| Métrica | Meta |
|---|---|
| Tiempo desde abrir el enlace hasta estar dentro (oyente) | < 30 s |
| Acción de moderación aplicada, de principio a fin | < 10 s |
| Evento con 30 asistentes, CPU por participante | ≤ la medida del aula de 30 (docs/decisiones/0001) |
| FPS en gama media con la mejora visual | sin caída frente a `main` |
| Reportes resueltos con constancia en bitácora | 100 % |

## 7. Supuestos y preguntas abiertas

| # | Asumido | Pregunta | Responde | Si es falso | Bloquea |
|---|---|---|---|---|---|
| 1 | El oyente externo no necesita cuenta | ¿La universidad exige identificar a externos (correo, CI)? | Facultad / quien dirige el proyecto | Se agrega verificación por correo; sube el costo de RF-25 | RF-25, RF-36 |
| 2 | Docentes y admin pueden crear eventos; estudiantes no | ¿Un estudiante o centro de estudiantes puede organizar uno? | Facultad | Se agrega el permiso `crear_evento` por rol | RF-29 |
| 3 | El docente de cada aula modera su aula; el admin, todo | ¿Hay moderadores designados fuera de docentes y admin? | Facultad | Se crea el rol `moderador` en `roles` | RF-35, RF-39 |
| 4 | Los externos aceptan términos en el enlace (consentimiento) | ¿Qué texto legal aplica a voz y grabación de externos? | Facultad | Se bloquea la grabación en eventos con externos | RF-25, grabación |
| 5 | Un evento usa un espacio existente (campus o aula) | ¿Se necesita un auditorio nuevo? | Equipo con Claude | Se agrega un espacio `auditorio` (depende de F) | RF-29 |
| 6 | Los planos permiten replicar a escala | ¿Hay planos más nítidos que la lámina de vista general? | Quien dirige el proyecto | La réplica se hace por planta, con menos precisión | RF-40 |

Los puntos 1, 3 y 4 son decisiones institucionales: las funciones se dejan detrás de un flag (`EVENTOS_EXTERNOS`, `MODERACION_ACTIVA`) hasta tener la respuesta.

## 8. Trazabilidad

Cada tarea del [plan](PLAN_IMPLEMENTACION.md) cita su RF. Al cerrar una tarea se actualiza el estado en la tabla de la sección 8 de la propuesta de ingeniería.
