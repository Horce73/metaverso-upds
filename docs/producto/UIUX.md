# Diseño UI/UX

Dirección visual y de interacción para las mejoras del [PRD](PRD.md). Parte de lo que ya existe en `src/index.css` y en los paneles actuales: **se pule, no se rehace**.

## 1. Principios

1. **Primero la escena.** El 3D es el producto; la interfaz lo enmarca y no lo tapa. Paneles translúcidos, ocultables y cerrables con `Esc`.
2. **Una acción, un lugar.** Voz, subtítulos, gestos y reacciones viven en la barra inferior; lo administrativo, en paneles laterales o modales.
3. **Se entiende sin ser gamer** (RNF-02). Cada atajo tiene botón equivalente; cada botón, texto accesible.
4. **Mismo lenguaje en todo.** Un solo juego de tokens, de estados y de componentes.
5. **Tuteo en todo el texto de la interfaz.**
6. **No cuesta FPS** (RNF-10). Efectos de interfaz con CSS compuesto (`transform`, `opacity`); nada de `backdrop-filter` nuevo sobre el canvas sin medir.

## 2. Sistema de diseño

### 2.1 Tokens (ya existen; se completan)

| Grupo | Existente en `index.css` | Se agrega |
|---|---|---|
| Marca | `--upds-primary #004596`, `--upds-secondary #4d82bc`, `--upds-accent #84b6f4`, `--upds-soft #c4dafa` | — |
| Superficies | `--background #070b16`, `--panel-bg`, `--card-bg`, bordes | `--surface-raised`, `--surface-overlay` |
| Texto | `--text-primary`, `--text-secondary`, `--text-muted` | — |
| Estado | `--success`, `--error`, `--warning` | `--info` |
| Tipografía | `--font-family: 'Outfit'` | escala: 12 / 14 / 16 / 20 / 28 / 40 px |
| Espaciado | — | escala 4 / 8 / 12 / 16 / 24 / 32 |
| Radios | — | `--r-sm 8px`, `--r-md 14px`, `--r-lg 22px`, `--r-pill 999px` |
| Capas | — | `--z-hud 10`, `--z-panel 20`, `--z-modal 40`, `--z-toast 60` (hoy hay colisiones de z-index) |
| Movimiento | `--transition` | `--dur-1 120ms`, `--dur-2 220ms`, `--ease-out cubic-bezier(.2,.8,.2,1)` |

Tema oscuro es el principal; el claro ya existe en `App.tsx` y debe conservar contraste AA con los mismos tokens.

### 2.2 Componentes base

| Componente | Variantes | Estados obligatorios |
|---|---|---|
| Botón | primario, secundario, fantasma, peligro, icono | reposo, hover, foco, activo, deshabilitado, cargando |
| Control de barra (`.control-btn`) | normal, activo (`aria-pressed`), silenciado | todos los anteriores |
| Panel de vidrio (`.glass-panel`) | lateral, flotante, modal | abierto, cerrado, vacío |
| Campo y selector | texto, área, fecha-hora, número | error con mensaje, ayuda |
| Insignia | rol (`Docente`, `Oyente`, `Admin`), estado de evento, estado de reporte | — |
| Toast | éxito, error, info | cierre automático y manual |
| Estado vacío | con ilustración mínima y una acción | — |
| Diálogo | confirmar, formulario | `Esc` cierra, foco atrapado |

Reglas de pulido: foco visible en todo elemento interactivo; objetivo táctil ≥ 44 px; contraste AA (4,5:1 texto, 3:1 iconos); `prefers-reduced-motion` apaga animaciones de entrada y las flotantes de reacciones.

### 2.3 Breakpoints
Los de hoy: 1024, 768, 640, 480. Se mantienen. Diseñar **primero para 360 px de ancho y para horizontal en móvil** (la prueba en celular real ya dio ajustes de menú y modales).

## 3. Pantallas y estados

### 3.1 Landing y login (pulir)
- Cabecera con el logotipo de `public/upds/`; un solo botón principal por pantalla.
- Bloque nuevo **«Próximos eventos»** (RF-33) bajo el héroe: hasta 3 tarjetas.
- Errores del formulario junto al campo, no en un `alert`.

### 3.2 Escena (HUD)
```
┌──────────────────────────────────────────────────────────────┐
│ [≡] Aula ISW · 24/30            Clase en curso · 00:42   [👥][💬] │ ← barra superior
│                                                              │
│                         ESCENA 3D                            │
│              (reacciones flotan sobre cada avatar)           │
│                                                              │
│  subtítulos ────────────────────────────────                 │
│ [🎙][PTT][CC]  [😀 Gestos ▾][👍 ❤️ 👏 ❓]  [✋ Mano][⋯ Más] │ ← barra inferior
└──────────────────────────────────────────────────────────────┘
```
- La barra inferior gana el grupo **Expresión** (RF-19, RF-20) entre voz y mano.
- En móvil horizontal, el grupo Expresión se pliega en un solo botón que abre la rueda.
- La guía de teclas desaparece en táctil (ya ocurre).

### 3.3 Interacción del avatar (campo A)

**Rueda de gestos** (tecla `G` o botón 😀; en táctil, pulsación larga sobre el avatar propio):

| Posición | Gesto | Atajo |
|---|---|---|
| Arriba | Saludar 👋 | `1` |
| Derecha | Aplaudir 👏 | `2` |
| Abajo | Asentir ✔ | `3` |
| Izquierda | Negar ✖ | `4` |
| Arriba-derecha | Señalar 👉 | `5` |

**Reacciones rápidas:** fila de 5 emoji (👍 ❤️ 😂 👏 ❓) siempre visible en la barra. Flotan 2,5 s sobre la cabeza y se desvanecen. Máximo 3 a la vez por avatar. Sin sonido por defecto.

**Comportamiento:** el gesto no bloquea el movimiento; si caminas, el brazo anima y el cuerpo sigue. Sentado, algunos gestos se limitan al torso. Duración 1,5 s, con un enfriamiento visible de 0,5 s en el botón.

**Tecla `E` unificada (RF-22):** un indicador en pantalla muestra «E · Sentarte», «E · Abrir», etc., según el objeto más cercano. Hoy solo existe sentarse.

### 3.4 Oyentes y eventos (campos C y D)

**Página pública del evento** (`#/evento/<token>`):
```
┌──────────────────────────────────────┐
│ [logo]   Charla: Introducción a ...  │
│ Sáb 14 dic · 16:00  · Auditorio      │
│ Empieza en  02 : 14 : 33             │
│ Organiza: Nombre del docente         │
│ ──────────────────────────────────── │
│ Tu nombre en pantalla  [__________]  │
│ ☐ Acepto los términos y el uso de voz│
│ [ Entrar como oyente ]               │
│ ¿Sin 3D? Entra en modo ligero        │
└──────────────────────────────────────┘
```
Estados: **antes** (cuenta regresiva, botón «Avisarme»), **abierto** (botón activo), **lleno** (cola de espera con posición), **terminado**, **enlace inválido o revocado** (mensaje claro y nada más).

**Vista del oyente en escena:** barra inferior reducida: reacciones, ✋ Mano, 💬 Chat (si está permitido), CC subtítulos. Sin micrófono, sin pizarra, sin personalizar avatar. Insignia «Oyente» sobre su nombre visible. Aviso persistente «Estás como oyente: pide la palabra con ✋».

**Crear evento** (modal de 3 pasos en el panel docente y admin):
1. **Qué:** título, descripción, espacio.
2. **Cuándo y cuántos:** fecha-hora de inicio y fin, aforo, oyentes con voz.
3. **Quién:** visibilidad (interno / por enlace), chat de oyentes sí/no. Al guardar: enlace copiable con botón «Copiar», «Revocar» y vista previa de la página pública.

**Lista «Mis eventos»**: tarjetas con insignia de estado; acciones por estado (programado: Editar, Cancelar, Enlace; en curso: Entrar, Finalizar; finalizado: Asistentes, Acta).

**Cartelera 3D:** letrero en el campus con los próximos 3 eventos; `E` abre el detalle.

### 3.5 Moderación (campo E)

**Menú contextual sobre un avatar** (clic o pulsación larga):
- Para todos: **Reportar**.
- Para moderador: **Silenciar voz · Silenciar chat · Expulsar · Vetar**, cada uno con duración (5 min, 30 min, 1 h, hasta el final) y motivo obligatorio.

**Reportar** (diálogo corto): motivo (acoso, spam, ofensivo, suplantación, otro) + detalle opcional de 300 caracteres. Confirmación: «Gracias, un moderador lo revisará». No se avisa al reportado.

**Panel de moderación** (lateral, solo moderadores):
```
Reportes (3 abiertos)            Filtro: abiertos ▾
┌────────────────────────────────────────────┐
│ ⚠ Spam · Ana R. → mensaje                  │
│ "compra aquí: …"                           │
│ [Silenciar chat 30 min] [Descartar] [Ver]  │
└────────────────────────────────────────────┘
Sanciones activas (1)   Reglas del chat ⚙
```
- Cada tarjeta tiene la acción sugerida a un clic; «Ver» centra la cámara en el avatar.
- **Reglas del chat** (⚙): palabras bloqueadas, bloquear enlaces, modo lento (0, 5, 10, 30 s).
- Toda acción pide confirmación solo si es irreversible (expulsar, vetar). Las demás se deshacen desde «Sanciones activas».

**Lo que ve el sancionado:** un banner claro con el motivo y el tiempo restante («Chat silenciado 12 min: lenguaje ofensivo»). Nunca una desconexión muda.

### 3.6 Panel de administración (pulir)
Pestaña **Moderación** nueva junto a las existentes: bitácora de acciones, sanciones activas y reportes por espacio, con filtros por fecha, moderador y espacio.

## 4. Accesibilidad (RF-24)

| Tema | Regla |
|---|---|
| Teclado | Todo alcanzable con `Tab`; rueda de gestos con flechas; `Esc` cierra el nivel superior |
| Lectores de pantalla | Reacciones y gestos de otros se anuncian en una región `aria-live="polite"` («Ana aplaude»), con límite de frecuencia |
| Color | Nunca solo color: estados con icono y texto (silenciado, sancionado, oyente) |
| Movimiento | `prefers-reduced-motion`: reacciones aparecen sin flotar |
| Idioma | `lang="es"`; subtítulos ya existen (A11Y-01) |
| Sin 3D | El oyente puede usar `VistaSinTresD` con las mismas reacciones y chat |

## 5. Contenido (textos)

Tono cercano y directo, en tuteo. Ejemplos aprobados para fijar el estilo:
- «Entra como oyente y escucha la charla. No necesitas cuenta.»
- «Este enlace ya no es válido. Pídele uno nuevo a quien organiza el evento.»
- «Tu chat está silenciado 12 min. Motivo: lenguaje ofensivo.»
- «Gracias. Un moderador lo revisará.»

Sin culpa, sin jerga técnica, sin signos de exclamación en errores.

## 6. Criterios de aceptación de diseño

| Criterio | Cómo se comprueba |
|---|---|
| Contraste AA en paneles nuevos y existentes | Revisión manual + herramienta de contraste |
| Todo el flujo usable a 360 px y en horizontal | Playwright con `devices['Pixel 7']` y viewport horizontal |
| Foco visible y orden de tabulación lógico | Recorrido por teclado |
| FPS sin caída | `npm run carga:render` antes y después |
| Un usuario nuevo llega a su aula en menos de 3 minutos (RNF-02) | Prueba con una persona que no conozca el proyecto |
| Sin colisiones de z-index ni overlays sin botón de cierre | Levantar la pantalla en el dispositivo real, no solo `tsc` |

## 7. Referencias visuales (para quien pule el diseño)
Estilo low-poly estilizado tipo Gather o Spatial (opción 2 del rediseño) combinado con la fidelidad del campus real (opción 3). Las fotos de la facultad están en `docs/referencias-upds/` (local, fuera de git).
