# Plan de implementación: oyentes externos en clases

**Estado:** implementación integrada; pendiente de validación funcional en navegador  
**Alcance:** permitir que personas sin cuenta universitaria entren a una sesión de clase como oyentes, sin participación académica ni interactiva.  
**Enfoque:** primero una versión segura y completa del flujo de oyente; después, mejoras opcionales de moderación y configuración.

## 1. Objetivo

Un docente puede habilitar el acceso de oyentes para una sesión y compartir un enlace o código temporal. El oyente entra con un nombre visible, puede observar la clase y escuchar al docente, pero no puede actuar como estudiante.

El permiso debe comprobarse en el servidor para cada ruta y evento relevante. Ocultar controles en la interfaz es una mejora de experiencia, no una medida de seguridad.

## 2. Estado actual del proyecto

- Los invitados pueden iniciar sesión temporalmente y actualmente solo pueden acceder al campus.
- El frontend bloquea a los invitados al intentar entrar a un aula.
- Socket.IO vuelve a verificar ese bloqueo y comprueba los pases de acceso a aulas.
- Los pases existentes son temporales y viven en memoria del servidor.
- Las clases y aulas están representadas por `sesiones_clase` y `espacios`.
- La asistencia se registra para estudiantes inscritos; los oyentes no deben entrar en ese flujo.
- La pizarra, el chat, la pantalla compartida y la voz tienen lógica propia en el servidor y deberán respetar los permisos del oyente.

Archivos de referencia:

- `src/App.tsx`: autenticación de invitado, ingreso a espacios y controles del aula.
- `src/components/MetaversoCanvas.tsx`: interfaz principal del aula y herramientas de participación.
- `server/src/index.ts`: autenticación y listado de espacios.
- `server/src/socketHandler.ts`: identidad, unión a salas y eventos en tiempo real.
- `server/src/accesoAulaServidor.ts` y `server/src/accesoAula.ts`: acceso actual a aulas.
- `server/src/migraciones.ts` y `server/migrations/`: esquema y migraciones de base de datos.

## 3. Decisiones de producto propuestas

1. **Oyente no equivale a invitado general.** El invitado actual conserva el acceso al campus; el oyente tiene acceso limitado a una sesión concreta.
2. **No se requiere cuenta universitaria.** El acceso se obtiene con un enlace o código compartido por el docente.
3. **La autorización queda ligada a una sesión**, no solo al aula. Un código de una clase no debe servir para otras clases de la asignatura.
4. **Los permisos iniciales son de solo observación.** El oyente ve la clase, la pizarra y la pantalla compartida, y escucha el audio permitido.
5. **No participa en voz, chat, preguntas, pizarra ni encuestas.** No se inscribe en la asignatura, no aparece como estudiante y no genera asistencia.
6. **Materiales privados se deniegan por defecto.** Su disponibilidad puede añadirse como opción en una etapa posterior.
7. El docente puede cerrar o regenerar el acceso. El acceso vence cuando termina la sesión o cuando vence el plazo definido.
8. No se debe registrar ni grabar audio adicional por ser oyente; se aplican los consentimientos y reglas de grabación ya existentes.

## 4. Permisos iniciales

| Acción | Oyente | Estudiante inscrito | Docente |
|---|---:|---:|---:|
| Entrar a la sesión autorizada | Sí | Sí | Sí |
| Ver avatares y escena | Sí | Sí | Sí |
| Escuchar voz de la clase | Sí, modo recepción | Sí | Sí |
| Ver pizarra y pantalla compartida | Sí | Sí | Sí |
| Leer chat e historial visible | Sí, si el chat está habilitado | Sí | Sí |
| Enviar mensajes | No | Sí | Sí |
| Encender micrófono o difundir voz | No | Sí, según reglas actuales | Sí |
| Levantar la mano o pedir la palabra | No | Sí | Sí |
| Dibujar o borrar trazos | No | Sí | Sí |
| Responder encuestas | No | Sí | Sí |
| Ver o descargar materiales privados | No, por defecto | Según permisos actuales | Sí |
| Registrar asistencia o inscripción | No | Según reglas actuales | No |

La aplicación debe mantener una única política de capacidades para la interfaz y el servidor. El servidor es la autoridad final y deniega cualquier evento fuera de las capacidades concedidas.

## 5. Diseño técnico propuesto

### 5.1 Acceso público de sesión

- Añadir a la sesión la configuración mínima: acceso de oyentes habilitado y cupo máximo.
- Crear una credencial pública aleatoria, no predecible, asociada a una sola sesión.
- Guardar únicamente el hash de la credencial en la base de datos; permitir regenerarla y revocar la anterior.
- Limitar intentos de canje por IP y por credencial, con respuestas que no revelen si una sesión existe cuando el código es incorrecto.
- El canje valida que la sesión esté activa o dentro de la ventana permitida, que acepte oyentes, que no haya vencido y que tenga cupo.
- Emitir una credencial temporal firmada con rol `oyente`, identificador propio, `sesionId`, expiración y capacidades. No reutilizar la identidad genérica del invitado.
- En las conexiones Socket.IO, verificar firma, vencimiento, sesión, revocación y estado de acceso. El cliente no puede enviar un `sesionId` distinto para ampliar sus permisos.

La forma exacta del enlace/código y la ventana de acceso deben quedar configurables con valores seguros por defecto. No incluir secretos ni códigos permanentes en el cliente o en el repositorio.

### 5.2 Persistencia y ciclo de vida

Crear una migración reversible para guardar accesos de oyente. Esquema conceptual a ajustar al estilo de las migraciones existentes:

```sql
CREATE TABLE accesos_oyente (
  id BIGSERIAL PRIMARY KEY,
  sesion_id INTEGER NOT NULL REFERENCES sesiones_clase(id) ON DELETE CASCADE,
  credencial_hash TEXT NOT NULL,
  creado_por INTEGER NOT NULL REFERENCES usuarios(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  vence_en TIMESTAMPTZ NOT NULL,
  revocado_en TIMESTAMPTZ,
  max_oyentes SMALLINT NOT NULL,
  CHECK (max_oyentes > 0),
  CHECK (vence_en > creado_en)
);

CREATE TABLE conexiones_oyente (
  id BIGSERIAL PRIMARY KEY,
  acceso_id BIGINT NOT NULL REFERENCES accesos_oyente(id) ON DELETE CASCADE,
  nombre_visible VARCHAR(80) NOT NULL,
  conectado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  desconectado_en TIMESTAMPTZ,
  expulsado_en TIMESTAMPTZ
);
```

Consideraciones:

- Revisar si `sesiones_clase` tiene ya los campos equivalentes antes de agregar columnas.
- Indexar las consultas de acceso por sesión, revocación y vencimiento.
- Contar conexiones activas de forma segura para aplicar el cupo, evitando carreras entre accesos simultáneos.
- Desconexiones inesperadas no deben dejar ocupación permanente; actualizar presencia al desconectar y definir una política para conexiones abandonadas.
- La migración de reversión debe eliminar solamente los objetos creados por esta funcionalidad.
- No guardar la credencial en claro ni incluirla en logs o bitácoras.

### 5.3 Autorización en tiempo real

Crear helpers reutilizables para identificar el rol y comprobar capacidades en vez de dispersar condicionales por cada handler.

En Socket.IO:

- Rechazar `join_space` si el oyente no está autorizado para la sesión asociada a esa aula.
- Asegurar que un oyente no entre a otra sesión o aula cambiando el payload.
- Permitirle recibir solamente los eventos de observación que correspondan a la sesión.
- Rechazar en servidor emisiones de chat, voz, levantar la mano, preguntas, pizarra, encuesta, compartir pantalla y cualquier evento que modifique estado.
- En rutas HTTP, negar inscripción, asistencia, materiales privados y operaciones académicas.
- Revisar el flujo de señalización de voz: el oyente puede recibir la voz autorizada, pero no iniciar ni aceptar una pista de micrófono que le permita difundir audio.
- Mantener los límites de tasa de Socket.IO y agregar límites específicos al canje del código.

Cada rechazo debe seguir el patrón de errores existente y generar un resultado observable para el cliente; no fallar silenciosamente.

### 5.4 Interfaz

- Añadir un flujo de ingreso por enlace/código con nombre visible y validaciones.
- Mostrar claramente el estado **“Estás en modo oyente”** y la sesión a la que se unió.
- Representar a los oyentes con una insignia o indicador distinto, sin presentarlos como estudiantes.
- Ocultar o deshabilitar controles no permitidos: micrófono, chat de envío, mano, dibujo, encuesta y materiales privados.
- Mantener visibles los controles de observación disponibles.
- Mostrar errores comprensibles para código inválido, sesión cerrada, cupo completo, credencial vencida o acceso revocado.
- Al expulsar, cerrar o vencer el acceso, salir de la sala y volver a una vista segura; no intentar conservar unirse automáticamente con una credencial inválida.
- Evitar guardar la credencial pública o token temporal en una ubicación persistente más tiempo del necesario.

### 5.5 Controles del docente

Primera entrega:

- Habilitar/deshabilitar oyentes para una sesión.
- Generar, copiar y regenerar enlace/código.
- Configurar un cupo máximo razonable.
- Ver cantidad de oyentes conectados.
- Cerrar el acceso al finalizar la clase.

Mejora posterior:

- Lista de oyentes conectados y hora de entrada.
- Expulsar un oyente y revocar su acceso.
- Permitir chat moderado o preguntas de oyentes.
- Habilitar materiales concretos para oyentes.

## 6. Fases de trabajo

### Fase 0 — Confirmar reglas de producto

- Acordar quién puede habilitar oyentes y para qué estados de sesión.
- Definir el cupo inicial, expiración y si la escucha incluye estudiantes que hablan.
- Confirmar si el docente necesita ver nombres o solo el total.
- Confirmar tratamiento de datos, aviso de privacidad y relación con grabaciones.

**Salida:** decisiones cerradas antes de definir migraciones y textos de interfaz.

### Fase 1 — Modelo de acceso y migración

- Revisar el esquema real y crear migración `up`/`down`.
- Persistir acceso revocable asociado a sesión.
- Crear servicios para generar, hashear, validar, vencer y revocar credenciales.
- Añadir pruebas unitarias del ciclo de vida y casos de credencial inválida.

**Criterio de aceptación:** credenciales impredecibles, guardadas como hash, limitadas a una sesión y revocables incluso tras reiniciar el backend.

### Fase 2 — API y emisión de credencial

- Añadir endpoints autenticados del docente para habilitar, consultar, regenerar y cerrar acceso.
- Añadir endpoint público de canje con rate limit, validación de sesión y control de cupo.
- Emitir token temporal de oyente con capacidades mínimas.
- No modificar inscripción ni asistencia al canjear.
- Registrar eventos administrativos sin registrar credenciales.

**Criterio de aceptación:** estudiante u oyente no pueden crear ni administrar accesos; docente autorizado solo gestiona sesiones propias; admin opera según política del proyecto.

### Fase 3 — Socket.IO y aislamiento

- Extender el modelo de identidad de socket para oyentes sin identidad universitaria.
- Autorizar la unión al aula solo para la sesión indicada en la credencial.
- Incorporar el helper de capacidades en cada handler de lectura/escritura.
- Verificar rutas de voz, chat, pizarra, pantalla, preguntas, encuestas, materiales y asistencia.
- Aplicar cupo, desconexión, expulsión y revocación.

**Criterio de aceptación:** manipular el cliente o enviar eventos manuales no permite realizar acciones prohibidas ni saltar a otra sesión.

### Fase 4 — Flujo de usuario y panel docente

- Construir pantalla de acceso público y estados de error.
- Adaptar el aula para modo de solo observación.
- Añadir identificación visual de oyentes.
- Añadir controles de acceso, regeneración y cierre para el docente.
- Comprobar navegación, reconexión y cierre de sesión.

**Criterio de aceptación:** un usuario externo puede completar el flujo sin cuenta y entiende que no está participando como estudiante.

### Fase 5 — Pruebas integradas y endurecimiento

- Añadir pruebas de API, Socket.IO y UI siguiendo las herramientas existentes.
- Validar que la asistencia y las inscripciones no se alteren.
- Probar simultaneidad de accesos al llegar al límite de cupo.
- Probar revocación en una conexión activa, reinicio de backend y fin de sesión.
- Ejecutar typecheck, lint y suite QA del backend.
- Revisar logs para asegurar que no exponen tokens, códigos ni datos personales innecesarios.

**Criterio de aceptación:** todas las pruebas de permisos pasan y los roles existentes conservan su comportamiento.

### Fase 6 — Documentación y despliegue

- Documentar configuración, uso docente, uso del oyente y respuesta ante problemas.
- Aplicar migración de forma compatible con despliegue.
- Probar el flujo en local con dos navegadores y después con un cliente externo.
- Desplegar primero con acceso deshabilitado por defecto.
- Habilitar progresivamente y observar errores, cupos y uso de recursos.

## 7. Casos de prueba mínimos

### Acceso

1. Código válido permite entrar a la sesión autorizada.
2. Código aleatorio, vencido, revocado o regenerado se rechaza.
3. Sesión cerrada o con oyentes deshabilitados se rechaza.
4. El código de una sesión no permite entrar a otra.
5. Al alcanzar el cupo, nuevas entradas se rechazan sin sobrepasarlo por concurrencia.
6. Credenciales de oyente vencidas o revocadas no sirven al reconectar.
7. Oyentes no pueden administrar enlaces ni cambiar configuración.

### Permisos

1. Oyente recibe los eventos de observación autorizados.
2. Oyente no puede emitir chat, voz, mano, pregunta, pizarra, encuesta o pantalla.
3. Oyente no accede a materiales privados ni rutas de asistencia.
4. Oyente no se inserta en `inscripciones` ni en `asistencias`.
5. Docente, admin y estudiante mantienen el comportamiento previo.
6. Una denegación del servidor sigue funcionando aunque se invoque el evento directamente sin interfaz.

### Ciclo de vida y experiencia

1. Desconectar libera o recupera el cupo según la política acordada.
2. El docente puede cerrar acceso y expulsar/revocar a un oyente conectado.
3. Al finalizar la sesión, los tokens dejan de autorizar el acceso.
4. La interfaz identifica al oyente y explica errores sin filtrar información sensible.
5. La conexión de oyente no afecta la asistencia ni el estado de otros usuarios.

## 8. Fuera del alcance inicial

- Dar de alta usuarios externos como estudiantes.
- Permitir participación libre por chat o micrófono.
- Acceso a calificaciones, actas, asistencia o datos académicos.
- Compartir enlaces permanentes entre sesiones.

## 9. Estado de implementación

La primera versión quedó integrada con estos valores y límites:

- Solo se habilita durante una sesión en curso; el acceso se revoca al cerrar o reemplazar la sesión.
- El enlace usa una credencial aleatoria de 32 bytes; la base de datos conserva únicamente su hash.
- El token de oyente dura 4 horas. El cupo predeterminado es 20 y el máximo permitido es 100.
- El docente puede consultar conexiones, regenerar el enlace o cerrar el acceso y expulsar a quienes estén conectados.
- El oyente entra sin cuenta universitaria, solo recibe su aula autorizada, no genera asistencia y usa audio de recepción sin solicitar micrófono.
- Los permisos de escritura se validan en API y Socket.IO; el cliente oculta los controles que no corresponden.

Archivos principales de la entrega: `server/src/oyentes.ts`, `server/migrations/0011_acceso_oyentes.up.sql`, `server/src/socketHandler.ts`, `src/components/AccesoOyente.tsx` y `src/components/OyentesSesion.tsx`.

La migración `0010_acceso_oyentes` ya se aplicó. La compilación del frontend, el typecheck del backend y los casos nuevos de oyentes pasan. La suite integrada completa registró 153 de 155 casos aprobados; los dos fallos restantes son de pruebas existentes de materiales y asistencia, fuera de esta funcionalidad. Falta validar el flujo visual en navegador.
- Grabación especial de oyentes o almacenamiento de audio.
- Permisos de materiales por archivo; se mantiene bloqueado hasta diseñarlo explícitamente.

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Adivinar o reutilizar enlaces | Entropía suficiente, hash en base, vencimiento, rate limit y regeneración |
| Saltarse los controles del frontend | Autorización central en API y en cada handler de Socket.IO |
| Acceso a otra clase | Credencial ligada a `sesion_id`; validar aula y sesión al unirse |
| Saturar la clase | Cupo máximo aplicado atómicamente y límites de tasa |
| Contar oyentes como alumnos | Identidad y registro separados; excluir de inscripción y asistencia |
| Perder revocaciones tras reinicio | Persistir el acceso y validar su estado en servidor |
| Filtrar credenciales en logs | Registrar identificadores internos y eventos, nunca el secreto |
| Sobrecarga de voz o pantalla | Medir con oyentes; respetar límites actuales de voz y envío de pantalla |

## 10. Criterio de finalización

La funcionalidad se considera lista cuando un docente puede abrir y cerrar un acceso temporal, una persona externa puede entrar a una sesión permitida en modo de observación, el servidor rechaza toda acción no autorizada, la revocación y los límites funcionan, y las pruebas confirman que no hay cambios en inscripción, asistencia ni permisos de usuarios existentes.

## 11. Estimación orientativa

Para una persona que ya conoce el código:

- Aclaración de reglas y revisión técnica: **0,5 día**.
- Migración, credenciales y API: **1–2 días**.
- Permisos de Socket.IO y voz: **1–2 días**.
- Interfaz de oyente y controles del docente: **1–2 días**.
- Pruebas integradas, correcciones y documentación: **1–2 días**.

**Total orientativo: 5–9 días de desarrollo**, sujeto a la complejidad real del flujo de voz, los handlers existentes y las decisiones de producto. Conviene implementar y validar por fases; no activar el acceso público antes de completar la autorización del servidor.
