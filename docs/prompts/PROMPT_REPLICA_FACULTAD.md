# Prompt de arranque — réplica fiel de la facultad

Pega el bloque de abajo como primer mensaje de un chat nuevo de Claude Code abierto en la raíz del repo. Necesita en local `docs/mapas/` (planos DWG y láminas PNG) y `docs/referencias-upds/` (fotos); ambas carpetas están fuera de git y deben seguir así.

````text
Quiero que el campus 3D del Metaverso UPDS sea una réplica fiel del edificio real de la facultad. El diseño actual no es preciso. Trabajamos tú y yo, en el repo donde estás.

# Qué hay hoy
- CAMPUS-01 a 03 ya están fusionados en dev: manzana UPDS con calle, edificio antiguo con patio y galerías, edificio nuevo, cancha, y altura (gradas, galerías, piso alto). Es una versión jugable, no un relevamiento: el nivel 1 y el nivel 4 del edificio nuevo se "juntan" en un solo plano, y de los pisos altos solo hay fachada.
- La lógica es pura y está probada: src/components/mundo3d/planoCampus.ts (lee su cabecera completa), con pruebas en pruebas/unidad/planoCampus.test.mjs. La escena sale de EdificiosUPDS.tsx, Campus.tsx y DecoradoCampus.tsx. Hay un recorrido automático en pruebas/escena/recorrer.mjs (acepta x, z, giro, y).

# Fuentes (locales, no se suben)
- docs/mapas/*.dwg: PLANOS ARQUITECTONICOS 2024 (capas limpias A-WALL, A-DOOR, S-STRS; plantas N1–N10 y cortes A–E), Plano de sitio y techos, y dos de cableado (el 1 trae el edificio nuevo planta por planta, alineado a ejes, con la arquitectura en una sola capa).
- docs/mapas/imagenes/00 a 09: láminas PNG de esos planos.
- docs/referencias-upds/: fotos de frontis, pasillos, aulas y bloques, y un croquis desde arriba.

# La lámina clave y su límite
La que más información da de las plantas es docs/mapas/imagenes/02-arquitectonicos-vista-general.png, pero está borrosa (3315×720). Úsala solo como ÍNDICE para orientarte, no para medir. Lo que se distingue en ella, a confirmar contra los DWG:
- Plantas rotuladas: planta baja, primer, segundo, tercer, cuarto nivel (con "patio principal", "bloque 2" y "conexión"), nivel 5 (con "conexión con bloque nuevo"), planta tipo 6–8, nivel 10 y "patio de circulación".
- Cortes A-A, B-B y elevación frontal con niveles 1 a 11.
- El edificio nuevo se repite en torre con aulas en cuadrícula (la lámina 05 las muestra por piso).
- En el nivel 4 (lámina 04) están el bloque antiguo (oficinas, administración, auditorio con gradas y tarima, fila de 5 aulas, cafetería, biblioteca, lectura) y el bloque 2 (aulas de 25, 30 y 40 personas, baños, ascensor), con cotas +10,36, +10,90, +12,00, +12,30 y terreno natural.
No des por buena ninguna lectura de esa imagen sin comprobarla en el DWG.

# Primero lee y mide, no modeles
1. Lee la memoria del proyecto sobre los planos (planos-upds-dwg) y la cabecera de planoCampus.ts.
2. Convierte los DWG a DXF con ODA File Converter sin sudo: extrae el .deb que está en docs/mapas (ar x, luego tar -xf data.tar.xz) y corre
   LD_LIBRARY_PATH=<dir> QT_QPA_PLATFORM=xcb <dir>/ODAFileConverter in out ACAD2013 DXF 0 1 "*.DWG"
   LibreCAD no los abre. Unidades: METROS en todos (el encabezado dice mm, es falso; las cotas lo confirman). Haz las conversiones y los extractos en el scratchpad, en carpetas nuevas y vacías, y corre Python con -I.
3. Extrae por planta y por capa: muros, puertas, escaleras, ascensores, huecos, cotas de nivel y textos de los ambientes (nombre y capacidad de cada aula). Guarda un resumen por nivel (rectángulos, aberturas, cotas) en el scratchpad.
4. Hallazgo ya confirmado, no lo redescubras: el patio del bloque antiguo está a +12,00, al nivel N4 (+10,90) del edificio nuevo; la calle entra al edificio nuevo en N1 (±0,00); el terreno sube hacia el fondo.

# Entregable 1 (sin modelar todavía): diagnóstico y plan
Máximo una página y media:
1. Tabla de brechas: por nivel (N1…N10 del nuevo, antiguo, cancha, patio), qué hay hoy en planoCampus.ts y qué dice el plano (posición, tamaño, cota, ambientes, capacidades).
2. Qué se puede replicar con precisión y qué no (por la resolución, por datos faltantes). Lista las preguntas para mí.
3. Propuesta por tandas, cada una una rama a dev y un PR, empezando por lo que conecta lo demás (N1, N4 y la circulación vertical) y dejando los pisos tipo repetidos (N6–N8) para generarlos con un solo módulo parametrizado.
4. Presupuesto de rendimiento: la escena no puede empeorar en npm run carga:render. Hay que fusionar geometría estática (Fusionar.tsx), reutilizar materiales y recortar lo lejano (recorteVista.ts, VISTA-01). Una torre de 11 niveles no puede dibujarse entera con todos sus interiores.
Espera mi aprobación antes de tocar código.

# Reglas
- Español con tuteo. Cambio mínimo, sigue el estilo de planoCampus.ts (lógica pura sin three.js, constantes con nombre, comentarios que explican el porqué). Carga las skills antislop, ponytail y las de threejs que apliquen.
- El repo es PÚBLICO y docs/mapas y docs/referencias-upds están en .gitignore: no subas planos, capturas de planos, fotos ni medidas exactas. Las medidas del código van redondeadas, como en CAMPUS-02. Antes de cualquier commit, revisa git status y que no se cuele nada de esas carpetas.
- Pregúntame antes de: commit, push, PR, borrar algo que no escribiste, crear dependencias o módulos nuevos. Ramas desde dev, nombre campus-NN-descripcion. Sin pedirlo, deja los cambios sin commitear y propón los comandos.
- Cada aula del plano debe poder corresponder a un espacio del sistema con su capacidad (RF-41); no cambies el contrato de planoCampus (puertas de aula, colisión, altura) sin avisarme.
- Nunca toques skip-worktree ni .env. No uses subagentes salvo que te lo pida.

# Verificación (de verdad)
- node --test: sube pruebas a planoCampus.test.mjs por cada tanda (colisión, alturas alcanzables, cada aula con su puerta, escaleras que conectan niveles). npm run test:unidad, npm run lint, npm run build.
- Recorrido: pruebas/escena/recorrer.mjs y capturas con Playwright aparecidas en un punto inyectando avatar.ultima_posicion en localStorage (más preciso que caminar con teclas). Hay dos espacios campus en la base local ("Campus Central UPDS" y "prueba"): elige por nombre. Chromium con GPU real: --use-angle=gl-egl --ignore-gpu-blocklist --enable-gpu.
- Las capturas van al scratchpad, no al repo. Comparación visual: lámina o foto de referencia al lado de la captura de la escena, en la misma planta.
- npm run carga:render antes y después de cada tanda.
- Si algo falla en pruebas, compáralo con un HEAD limpio.
````
