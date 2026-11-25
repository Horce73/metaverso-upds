# Prompt de arranque — funcionalidades de Pedro, Lucas y Melvin

Pega el bloque de abajo como primer mensaje de un chat nuevo de Claude Code abierto en la raíz del repo, sobre la rama `dev` actualizada.

````text
Vamos a desarrollar tres funcionalidades del Metaverso UPDS que tres compañeros no pudieron tomar. Las hacemos tú y yo, en el repo donde estás.

# Las tres tareas
- A · Interacción del avatar (la de Pedro): gestos y reacciones visibles para todos en el espacio; luego la tecla E unificada con indicador (RF-19, RF-20, RF-22).
- D · Creación de eventos (la de Lucas): crear, programar, iniciar y finalizar eventos, con enlace de invitación revocable, inscripción y lista de asistentes (RF-29 a RF-33).
- E · Moderación de interacciones (la de Melvin): reportar, silenciar voz y chat, expulsar, vetar, filtro de chat, bitácora y panel (RF-34 a RF-39).

Hay otras dos tareas que NO son nuestras y que dependen de estas: oyentes (Cristian) y pulido de diseño (Ignacio). Deja los contratos limpios para que se enchufen, pero no las implementes.

# Primero lee, no escribas
Antes de proponer nada, lee en este orden:
1. docs/producto/PRD.md, TRD.md, BACKEND_SCHEMA.md, APPFLOW.md, UIUX.md y PLAN_IMPLEMENTACION.md. Son la fuente de verdad; si algo del código los contradice, avísame en vez de elegir tú.
2. CONTRIBUTING.md y docs/decisiones/ (ADR 0001 y 0002).
3. El código que vas a reutilizar: server/src/socketHandler.ts, limites.ts, chat.ts, chatPersistencia.ts, preguntas.ts, relevanciaPosicion.ts, apariencia.ts, bitacoraAdmin.ts; src/components/mundo3d/AvatarModel.tsx, CuerpoAvatar.tsx, posicionesRemotas.ts, texto3d.ts; src/App.tsx solo donde se monta la barra inferior y el chat.
4. server/migrations/ (última: 0010) y pruebas/unidad/ para copiar el estilo de las pruebas.

# Cómo trabajamos (reglas fijas)
- Respóndeme en español, con tuteo. Los identificadores siguen la convención del repo (español).
- Orden de cada tarea: diagnóstico y plan breve → espero tu plan y yo lo apruebo → implementación acotada → verificación real → entrega.
- Al entregar, dime qué archivos tocaste y por qué, uno por uno, en pocas líneas.
- Hazlo mínimo: el cambio más pequeño que resuelve la tarea, sin comentarios de relleno, sin refactors ajenos. Carga las skills antislop y ponytail.
- Pregúntame ANTES de: crear una tabla, endpoint, dependencia o módulo que no esté en el plan; cualquier commit, push, merge, rebase o PR; borrar o sobrescribir algo que no escribiste en esta sesión; tocar código de otros. Sin pedirlo, deja los cambios sin commitear y propón la secuencia de comandos.
- Los bugs que encuentres van aparte, en un worktree hermano del repo con rama y carpeta fix-NOMBRE-DEL-ERROR, basado en la rama donde vive el código. Las features se quedan en el árbol principal.
- Nunca toques archivos skip-worktree ni .env. Los formateadores solo sobre las rutas que cambié.
- Ramas desde dev, nombre area-NN-descripcion (avatar-01-gestos, mod-01-nucleo, evento-01-crud). PR a dev. Una rama por tarea del plan.
- Lo que dependa de la facultad va detrás de un flag apagado: EVENTOS_EXTERNOS y MODERACION_ACTIVA. Lo que dependa de otra persona va como supuesto con el formato: Asumido / Pregunta / Responde / Si es falso / Bloquea. No inventes la respuesta.
- No uses subagentes salvo que yo te lo pida.
- Al cerrar cada tarea, actualiza el estado del RF en PROPUESTA_INGENIERIA_SOFTWARE.md.

# Trampas ya conocidas del repo (no las repitas)
- App.tsx (2 000 líneas) e index.ts (1 900) son cuellos de botella: componentes y rutas nuevas en archivos propios; en App.tsx solo la línea que los monta.
- No crees texturas ni geometrías dentro del JSX de R3F: se fugan (~280 texturas/s). Usa cachés (ver texto3d.ts) y objetos compartidos fuera de React state, como posicionesRemotas.ts.
- R3F reemplaza userData en cada render: no guardes marcas ahí; usa WeakSet.
- Un evento de socket nuevo necesita su cupo en CUPOS_SOCKET y pasar por el helper on(evento, cupo, handler).
- La autorización se decide en el servidor con roles leídos de la base, nunca por lo que diga el cliente (RNF-07).
- Cuando cierres tramos de asistencia al expulsar, usa el flujo de disconnect; no NOW() de la transacción.
- Las migraciones llevan .down.sql y no se editan una vez fusionadas.
- GitGuardian: sin contraseñas literales en pruebas ni en CI. Correos de demo @demo.local.
- El repo es público: nada de planos ni fotos de la universidad.

# Cómo se verifica (de verdad, no solo tipos)
- Unidad: node --test sobre lógica pura (moderacion.ts, validación de gestos, ventanas y aforo de eventos): npm run test:unidad.
- Integración: ampliar server/qa_suite.js. Se corre como el CI, con Postgres efímero:
  docker run --rm --name qa-pg-efimero -e POSTGRES_HOST_AUTH_METHOD=trust -p 5433:5432 postgres:15-alpine, migrar, backend en 3002, node qa_suite.js con DATABASE_URL y BACKEND_URL. No toca mi base local.
- Tiempo real: sockets crudos de socket.io-client, al estilo de pruebas/carga-trafico/medir-trafico.mjs.
- Navegador: Playwright con devices['Pixel 7'] para táctil; Chromium con GPU real (flags --use-angle=gl-egl --ignore-gpu-blocklist --enable-gpu), si no SwiftShader da 1-2 FPS. Playwright puede pedir un Chromium que no está en caché: lista ~/.cache/ms-playwright y pasa executablePath.
- Rendimiento: npm run carga:render y npm run carga:trafico antes y después. No se acepta caída de FPS (RNF-10).
- Si algo falla, compáralo contra un HEAD limpio para separar lo previo de lo mío.
- Si levantas Docker para probar, apágalo al terminar (docker compose stop backend db). Los límites en memoria (limiteInvitado, limiteLogin) se reinician con docker compose restart backend.

# Por dónde empezar
Fase 1 de PLAN_IMPLEMENTACION.md, en este orden: MOD-01 (núcleo puro de moderación, es lo más aislado), AVATAR-01, AVATAR-02, AVATAR-03, EVENTO-01. Cada una en su rama.

Tu primer entregable NO es código: es un diagnóstico de 15 líneas como máximo con (1) lo que contradice o falta en los documentos frente al código real, (2) qué archivos tocarías en MOD-01 y en qué orden, (3) las preguntas que necesites que yo resuelva. Espera mi aprobación antes de crear ramas o archivos.
````
