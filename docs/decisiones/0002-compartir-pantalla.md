# 0002 · Cómo compartir pantalla en el aula

- **Estado:** aceptada
- **Fecha:** 2026-10-06
- **Fase:** 4 del plan XP ("Un aula que un docente elegiría"), elemento AULA-01
- **Depende de:** [0001 · Malla o SFU para la voz](0001-malla-o-sfu.md)

## Contexto

AULA-01 pide que el docente proyecte su pantalla en el aula. La decisión 0001
mantuvo la voz en malla y dejó anotado que compartir pantalla era "el caso que
más empuja hacia un SFU", porque en malla el docente tiene que enviar el video
una vez por alumno. Había que medirlo antes de elegir cómo implementarlo.

## Cómo se midió

Experimento sobre el cliente de la prueba de carga (no quedó en el repo): el
docente suma a cada llamada una pista de video que imita diapositivas
(1280 × 720, 5 fps, `contentHint = 'detail'`, tope de 300 kbps por llamada) con
un puntero que se mueve. El docente corre en un Chrome propio, para medir sólo
su CPU; los alumnos, en otro, separados más de 6 m para no llamarse entre sí
(sólo cuentan las llamadas del docente). Mismo host que la decisión 0001
(i7-11800H, 16 hilos, enchufado). Ventana de 15 s.

| Alumnos | CPU del docente, sólo voz | Con pantalla por la malla | Subida de video |
|---------|---------------------------|---------------------------|-----------------|
| 5       | 13 %                      | 31 %                      | 265 kbps        |
| 8       | —                         | 63 %                      | 411 kbps        |
| 11      | 22 %                      | 114 % (repetición: 108 %) | 579 kbps        |

CPU en % de un núcleo. Las diapositivas de prueba comprimen muy bien (~50 kbps
por llamada); una pantalla real con más detalle llega al tope de 300 kbps.

## Interpretación

- Cada llamada codifica su propia copia del video: Chrome no comparte el
  codificador entre `RTCPeerConnection`. El tiempo de codificación pasa de
  88 ms por segundo con 5 alumnos a 652 ms con 11, peor que lineal.
- Aun extrapolando en línea recta desde 5 alumnos (~3,6 % de un núcleo por
  alumno), con 29 el docente sumaría más de un núcleo **sólo para la pantalla**,
  encima del ~1 núcleo que ya lleva la voz (decisión 0001). Con lo medido a 11,
  bastante más.
- La subida también escala por alumno: 29 × 300 kbps son ~8,7 Mbps con
  contenido detallado, más de lo que tiene una conexión doméstica típica.

**Compartir pantalla como video por la malla no es viable para un aula de 30.**

## Decisión

La pantalla se comparte **por instantáneas a través del servidor**, no como
video por la malla:

- El docente captura la pantalla con `getDisplayMedia()` y, como mucho dos
  veces por segundo, compara la imagen con la anterior. Sólo si cambió la
  codifica (WebP, o JPEG donde el navegador no codifica WebP) y la sube **una
  vez** por el socket.
- El servidor la reenvía al aula y guarda la última, para quien entra tarde.
  Usa envíos `volatile`: a un alumno con la conexión saturada se le saltan
  cuadros en lugar de acumularlos.
- En el aula se ve en una pantalla de proyección delante de la pizarra y, para
  leer bien, en grande sobre la interfaz.

El coste del docente queda fijo (una captura y una codificación por cambio)
sin importar cuántos alumnos haya. Lo que crece con el aula es la salida del
servidor, y sólo cuando la imagen cambia.

## Resultado

Medido en Chrome sobre la implementación, con la pantalla falsa de Chrome
(una animación que cambia en cada cuadro, el peor caso) y la página sin escena
3D, para que el render no tape la diferencia:

| | CPU extra del docente | Imágenes por segundo | Subida |
|---|---|---|---|
| Video por la malla, 5 alumnos | +18 % | 5 por alumno | 265 kbps |
| Video por la malla, 11 alumnos | +92 % | 5 por alumno | 579 kbps |
| **Imágenes por el servidor, cualquier N** | **+5 %** | 1 | 52 kbps |

La imagen de prueba es simple (~6 KB); una diapositiva real a 1440 × 810 pesa
del orden de 50–150 KB, lo que sigue siendo una sola subida por cambio. En la
app real, el alumno ve la pantalla en el proyector 3D y en grande, y quien
entra tarde recibe la última imagen al llegar.

## Límites aceptados

- Hasta ~2 cuadros por segundo: sirve para diapositivas, documentos, código y
  la mayoría de demostraciones; **no para reproducir video**. Para un video, el
  docente lo comparte como material (AULA-06) o como enlace.
- El audio de la pantalla no se comparte.
- Sólo docentes y administradores comparten, de a uno por aula.

## Cuándo se revisa

Si se adopta un SFU (VOZ-06, plan B de la decisión 0001), compartir pantalla
pasa a ser una pista de video más hacia el SFU, con fluidez de video real. Hasta
entonces, también se revisa si las clases necesitan mostrar video en vivo de
forma habitual.

## Consecuencias

- No hace falta renegociar las llamadas de voz ni tocar la malla.
- El servidor reenvía imágenes: con 30 alumnos y una diapositiva de ~100 KB,
  cada cambio son ~3 MB de salida. Con diapositivas que cambian cada pocos
  segundos es poco; con una pantalla en movimiento constante, hasta ~6 MB/s.
  Por eso el límite de 2 cuadros por segundo y la comparación previa.
