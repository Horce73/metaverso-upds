# Gobernanza de IA — Metaverso UPDS

| | |
|---|---|
| Estado | **Borrador**, pendiente de aprobación |
| Aplica a | Todo el equipo y todo cambio que entre a `dev` o `main` |
| Revisión | Al cerrar cada fase del [plan](producto/PLAN_IMPLEMENTACION.md) y cuando cambie la herramienta de IA |

## 1. Para qué sirve

El proyecto usa asistentes de IA para escribir código y documentos. Este documento fija quién responde por lo que la IA produce, qué datos pueden usarse con ella y qué queda registrado, para que el uso sea revisable y no dependa de la costumbre de cada persona.

No prohíbe usar IA. Pide que siempre haya una persona responsable y evidencia de que se verificó.

## 2. Alcance

| Frente | Qué cubre |
|---|---|
| **A. IA como herramienta de desarrollo** | Código, pruebas, migraciones, documentación y diagramas generados o editados con un asistente (hoy, Claude Code) |
| **B. IA dentro del producto** | Cualquier función del metaverso que use un modelo o un servicio de IA (hoy: subtítulos con Web Speech) |

## 3. Principios

1. **Una persona responde.** Quien abre el PR responde por cada línea, la haya escrito él o la IA.
2. **La IA propone, las personas deciden.** Nada se fusiona, publica ni activa sin aprobación humana.
3. **Si no se probó, no entra.** El código generado cumple las mismas pruebas y el mismo CI que el escrito a mano.
4. **Mínimo de datos.** A la IA se le da lo que la tarea necesita y nada más.
5. **Trazable.** Se puede saber qué parte fue asistida, con qué instrucciones y quién la revisó.
6. **Sin automatismos sobre personas.** Ninguna sanción, evaluación ni decisión sobre un usuario la toma un modelo sin revisión humana.

## 4. Roles

| Rol | Responsabilidad |
|---|---|
| **Autor** | Quien pide el cambio a la IA y abre el PR. Lee, entiende y prueba lo generado antes de pedir revisión |
| **Revisor** | Otra persona distinta del autor. Revisa el diff completo, no solo el resumen del PR. Da la aprobación que exige el ruleset |
| **Responsable del proyecto** | Quien dirige el proyecto. Aprueba tablas, endpoints o módulos nuevos, decide los flags y responde ante la facultad |
| **Responsable de datos** | Persona designada para decidir retención y consentimientos (por definir; supuesto 1 de §10) |

## 5. Uso de IA en el desarrollo (frente A)

### 5.1 Permitido
- Generar y refactorizar código, pruebas, migraciones y documentación dentro de una tarea del plan.
- Leer el repositorio para diagnosticar, y proponer cambios.
- Redactar descripciones de PR, siempre revisadas por el autor.

### 5.2 Requiere aprobación previa del responsable del proyecto
- Crear tablas, endpoints, dependencias o módulos que no estén en el plan.
- Cualquier migración que borre o transforme datos.
- Cambios en autenticación, roles, permisos o moderación.
- Activar un flag que expone una función a usuarios externos (`EVENTOS_EXTERNOS`, `MODERACION_ACTIVA`).

### 5.3 Prohibido
- Que la IA haga commit, push, merge o abra PR sin que una persona lo pida en ese momento.
- Fusionar un PR sin aprobación humana ni con el CI en rojo.
- Pegar en un asistente de IA: secretos y `.env`, tokens, claves, contraseñas, datos personales reales de estudiantes o docentes, planos y fotos de la universidad, o los volcados de la base de producción.
- Subir al repositorio (público) planos, fotos o medidas exactas de la universidad, aunque la IA los haya procesado en local.
- Dejar que la IA edite archivos marcados `skip-worktree` o `.env`.

### 5.4 Flujo de cada cambio

| Paso | Qué ocurre | Evidencia |
|---|---|---|
| 1. Contexto | Se lee el código y los documentos de requisitos antes de pedir nada | Referencias al RF/RNF en la tarea |
| 2. Diagnóstico y plan | El asistente propone qué toca y en qué orden; el autor lo aprueba si el cambio no es trivial | Plan breve en el chat o en el PR |
| 3. Implementación acotada | Cambio mínimo, en rama `area-NN-descripcion` desde `dev` | Diff pequeño y enfocado |
| 4. Verificación | Pruebas unitarias, QA, build, lint y prueba real (navegador, `curl`, servicio levantado) | Salida real pegada en el PR |
| 5. Revisión humana | Otra persona revisa y aprueba | Aprobación en GitHub |
| 6. CI | Frontend (tipos, lint, build) y Backend (tipos y suite QA) en verde | Checks verdes |
| 7. Registro | Estado del requisito actualizado en `PROPUESTA_INGENIERIA_SOFTWARE.md`; ADR si hubo una decisión relevante | Commit de documentación |

Los conflictos de fusión se resuelven en la rama (`git merge dev`, `tsc`, pruebas), no en el editor de GitHub. Tras fusionar se verifica que cada archivo del PR llegó a `dev`.

### 5.5 Trazabilidad
- Los commits asistidos llevan el trailer `Co-Authored-By` del asistente.
- La plantilla de PR incluye: ¿hubo IA?, ¿qué partes?, ¿qué verificó una persona y cómo?
- Los prompts de arranque que definen reglas del trabajo se versionan en `docs/prompts/`.
- Las decisiones técnicas importantes se anotan en `docs/decisiones/` (ADR), con el contexto, la alternativa descartada y quién decidió.

### 5.6 Revisión reforzada
Un cambio generado con IA recibe revisión **más atenta**, no más ligera, cuando toca:
- Autorización o identidad (`resolverIdentidad`, roles, tokens de oyente).
- Moderación y sanciones.
- Migraciones y datos personales.
- Cualquier cosa que reciba entrada de usuarios sin cuenta.

Revisar aquí incluye ejecutar el cambio, no solo leerlo.

## 6. Datos y privacidad

| Dato | Puede usarse con IA | Notas |
|---|---|---|
| Código del repositorio | Sí | Es público |
| Documentación del proyecto | Sí | |
| Planos y fotos de la universidad | Solo en local y sin subirlos | `docs/mapas` y `docs/referencias-upds` están fuera de git |
| Datos de la base de desarrollo con cuentas `@demo.local` | Sí | |
| Datos personales reales | **No** | Ni en prompts, ni en capturas, ni en pruebas |
| Secretos, `.env`, tokens | **No** | GitGuardian revisa cada PR |
| Datos de producción | **No** | Si hace falta diagnosticar, se anonimiza primero |

Antes de pegar una captura de pantalla, una traza o un log en un asistente, se revisa que no contenga nombres, correos, IP ni tokens.

## 7. IA dentro del producto (frente B)

Hoy el producto no tiene funciones de IA propias. Los subtítulos usan la API de reconocimiento de voz del navegador, que en algunos navegadores envía el audio a un servicio externo del proveedor. **Verificar y documentar**, porque afecta al consentimiento de voz (RNF-03).

Reglas para cualquier función de IA que se agregue al producto:

1. **Propuesta escrita antes del código**: qué hace, qué datos recibe, a qué servicio los envía, dónde se guardan y por cuánto tiempo. La aprueba el responsable del proyecto.
2. **Consentimiento específico** y registrado en `consentimientos` para cada uso nuevo de voz, imagen o texto del usuario. Los externos (oyentes) aceptan en el enlace del evento.
3. **Apagada por defecto** con un flag, hasta tener respuesta institucional.
4. **Sin decisiones automáticas sobre personas.** La moderación es determinista (reglas visibles) y toda sanción la aplica una persona con motivo y bitácora (RF-38). Si se incorpora un clasificador, solo sugiere y un moderador confirma.
5. **Se informa al usuario** cuando algo lo procesa un modelo.
6. **Se mide y se registra**: tasa de falsos positivos de cualquier filtro, y cuántas acciones se revirtieron.
7. **Alternativa humana**: nada esencial (entrar a clase, asistencia, chat) depende de que funcione una IA.

## 8. Incidentes

Cuenta como incidente: secreto o dato personal pegado en una herramienta de IA o subido al repo, código generado que llegó a `main` sin revisión, sanción aplicada por error, o una función de IA que procesó datos sin consentimiento.

| Paso | Qué se hace |
|---|---|
| 1. Contener | Rotar el secreto, revertir el cambio, apagar el flag |
| 2. Avisar | Al responsable del proyecto, el mismo día |
| 3. Registrar | Qué pasó, qué datos, durante cuánto tiempo, en `docs/decisiones/` o en un issue privado (no en el repo público si contiene datos) |
| 4. Corregir | Regla, prueba o control que habría evitado el caso |

## 9. Cumplimiento y mejora

- La plantilla de PR y el ruleset ya obligan a la aprobación y al CI; es lo que se puede comprobar automáticamente.
- Una vez por fase se revisan 3 PRs al azar con IA: ¿la casilla estaba completa?, ¿la verificación es real?
- Este documento se actualiza al cierre de cada fase.

## 10. Supuestos y preguntas abiertas

| # | Asumido | Pregunta | Responde | Si es falso | Bloquea |
|---|---|---|---|---|---|
| 1 | Alguien del equipo puede ser responsable de datos | ¿Quién decide retención y consentimientos? | Quien dirige el proyecto | Se asigna a quien dirige el proyecto hasta designar a otra persona | Retención de datos de oyentes |
| 2 | No hay política de IA de la facultad | ¿La UPDS tiene lineamientos de uso de IA o de protección de datos? | Facultad | Se aplican los suyos, que prevalecen sobre este borrador | Aprobación de este documento |
| 3 | Un solo asistente de IA autorizado (Claude Code) | ¿Se permite que cada integrante use otras herramientas? | Quien dirige el proyecto | Se amplía §5 y §6 con cada herramienta y sus condiciones de datos | Reglas de §5.3 |
| 4 | Los subtítulos con Web Speech envían audio fuera | ¿Qué proveedor y con qué condiciones? | Equipo con Claude (verificación técnica) | Si es local, se simplifica §7 | Consentimiento de voz de oyentes |
| 5 | El repositorio sigue siendo público | ¿Se mantendrá público durante todo el proyecto? | Quien dirige el proyecto | Si pasa a privado, se relajan algunas reglas de §6, no las de datos personales | §5.3 y §6 |
| 6 | No hay normativa específica que cumplir fuera de las políticas de la facultad | ¿Aplica alguna norma de protección de datos del país? | Facultad / asesoría legal | Se agrega una sección de cumplimiento con las obligaciones concretas | Activar `EVENTOS_EXTERNOS` |

## 11. Archivos de apoyo propuestos (no creados)

| Archivo | Contenido |
|---|---|
| `.github/pull_request_template.md` | Casillas de §5.5 |
| `.github/CODEOWNERS` | Zonas de §5.6 con revisor obligatorio |
| `CLAUDE.md` (raíz) | Reglas de §5 para que todo el equipo use la misma configuración |
