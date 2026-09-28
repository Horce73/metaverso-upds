# 0001 · Malla o SFU para la voz

- **Estado:** aceptada
- **Fecha:** 2026-09-28
- **Fase:** 2 del plan XP ("Medir el techo de la voz")
- **Aula objetivo:** 30 participantes simultáneos

## Contexto

La voz usa PeerJS en malla: cada participante abre una `RTCPeerConnection` con
cada uno de los demás. Con N participantes hay N·(N−1)/2 conexiones (435 con 30)
y cada navegador envía y recibe N−1 flujos. La alternativa es un SFU (LiveKit,
mediasoup): cada participante sube su voz una sola vez y el servidor la reenvía.

Había que decidir con un número si la malla sirve para el aula antes de construir
zonas de audio (VOZ-03) y compartir pantalla (AULA-01), que se implementan
distinto según la respuesta.

## Cómo se midió

`pruebas/carga-voz/spike.mjs` (`npm run carga:voz`) abre N participantes en
Chrome contra un mismo espacio, con el `AudioClient` real (PeerJS, audio espacial
HRTF) y el protocolo de socket de la app, sin la escena 3D. Cada participante
ocupa una posición fija en un aula de 20 × 20 m y "habla" con voz sintetizada
(espeak-ng) como micrófono falso. Espera a que la malla se complete y mide 15 s
con `AudioClient.obtenerDiagnostico()`, el mismo del panel VOZ-05.

**Audio aceptable** se fijó antes de medir: ≥ 99 % de pares conectados, audio
oculto medio ≤ 2 % y p95 ≤ 5 %, jitter p95 ≤ 30 ms.

Cada tamaño se midió 3 veces, con 20 s de reposo, y se reporta la mediana.
Host: i7-11800H (8 núcleos, 16 hilos), enchufado. La CPU se da en % de un
núcleo por participante.

**Límite del método.** Los N participantes corren en la misma máquina, así que
el coste total crece como N². Por encima de 12 participantes el host pasa del
50 % y la CPU medida describe la contención del host, no a un participante. Por
eso los tamaños llegan a 12 y lo que sigue es extrapolación. Una serie corrida
con la laptop a batería (CPU a 800 MHz) se descartó.

## Resultados

En todas las series y todos los tamaños: 100 % de pares conectados, 0 % de
audio oculto, jitter p95 ≤ 2 ms. **La calidad no se degradó en ningún punto
medible**; lo que crece es el coste.

**CPU por participante (% de un núcleo)**

| N | Todos hablan | Todos hablan, sin HRTF | Sólo el docente | Sólo el docente, DTX |
|---|---|---|---|---|
| 2 | 10,7 | 7,4 | 8,7 | 7,2 |
| 4 | 11,8 | 11,5 | 12,8 | 11,9 |
| 6 | 16,1 | 15,4 | 17,1 | 16,3 |
| 8 | 22,1 | 21,4 | 33,2 ¹ | 23,1 |
| 10 | 29,0 | 27,9 | 38,0 | 28,4 |
| 12 | 38,7 | 37,8 | 47,6 | 39,0 |

¹ Repeticiones de 24, 51 y 33 %: una quedó contaminada por el host.

Una serie de control con todos hablando, corrida junto a las dos de "sólo el
docente", dio 8,5 / 16,4 / 43,6 % con N = 2 / 6 / 12. Las columnas son
comparables dentro de un margen de unos ±5 puntos.

**Subida media por participante (kbps)**

| N | Todos hablan | Sólo el docente | Sólo el docente, DTX |
|---|---|---|---|
| 2 | 32 | 22 | 16 |
| 4 | 96 | 54 | 25 |
| 6 | 160 | 82 | 29 |
| 8 | 224 | 110 | 32 |
| 10 | 288 | 137 | 34 |
| 12 | 353 | 163 | 35 |

El docente sube 32 kbps por cada alumno en todos los casos: 353 kbps con 12.

## Lo que dicen los números

1. **El audio espacial no es el problema.** HRTF frente a `equalpower` cambia
   ≤ 1 punto de CPU.
2. **Un micrófono silenciado no es gratis.** La app silencia con
   `track.enabled = false`: el navegador sigue codificando y enviando silencio,
   unos 13 kbps a cada par. Con Opus DTX (`usedtx=1`) ese silencio cae a casi
   cero y la subida de un alumno deja de crecir con el aula. En esa columna,
   los 35 kbps de media con 12 son en su mayoría la subida del docente, que
   entra en el promedio.
3. **La CPU crece con el número de flujos recibidos, no con lo que se envía.**
   Todos hablando, un solo hablante y un solo hablante con DTX cuestan casi lo
   mismo. Lo caro es recibir, decodificar (con DTX, ruido de confort),
   espacializar y reproducir un flujo por cada compañero, unos 3–4 puntos de
   núcleo por flujo. Un SFU ahorra la codificación repetida, que aquí pesa poco.
   Sólo ahorraría CPU si además dejara de reenviar los flujos que el oyente no
   necesita, cosa que en malla se consigue no conectando a esos pares.

## Número documentado

- **Verificado:** 12 participantes simultáneos en malla completa, con audio
  aceptable y margen (39–48 % de un núcleo de escritorio por participante).
  12 es el límite del método de medida, no un punto de degradación observado.
- **Extrapolado a 30 en malla completa:** cerca de un núcleo de escritorio
  entero por participante, sólo en voz. En el equipo típico de un estudiante,
  sumado al render 3D, eso no es viable.
  Con DTX, la subida de un alumno queda baja y la del docente en ~0,9 Mbps
  (29 × 32 kbps).
- **En malla completa, la arquitectura actual no cubre las 30 personas.**

## Decisión

**Se mantiene la malla.** No se migra a un SFU ahora; VOZ-06 queda como plan B.
Para que la malla cubra el aula de 30 se hacen dos cambios, en la Fase 3:

1. **Activar Opus DTX** en `AudioClient` para que el silencio no ocupe subida.
   Es un cambio pequeño y ya se probó en el harness. Hecho: `AudioClient` lo
   negocia siempre y la prueba de carga compara sin él con `--sin-dtx`.
2. **Dejar de conectar a todos con todos.** Con las zonas de audio (VOZ-03),
   cada alumno abre llamada con quien dicta la clase y con los que tiene cerca,
   no con el aula entera. Con 5–8 flujos por alumno, las tablas dan 16–23 % de
   un núcleo. Quien dicta la clase sí mantiene una llamada con cada alumno
   (29): su equipo carga con alrededor de un núcleo y ~0,9 Mbps de subida.

Esto también cambia el orden de la Fase 3: VOZ-03 deja de ser sólo una mejora
de escucha y pasa a ser lo que hace escalar la malla.

## Cuándo se revisa (paso a SFU)

La Fase 3 cierra con una sesión de 30 participantes. Se reabre esta decisión y
entra VOZ-06 si ocurre cualquiera de estas cosas:

- Esa sesión no cumple los criterios de audio aceptable de arriba.
- El equipo de quien dicta la clase no sostiene sus 29 llamadas, medido con el
  panel VOZ-05.
- El aula necesita que todos se oigan con todos a la vez, por ejemplo un debate
  abierto con 30 personas, en lugar del formato docente más grupos.
- El TURN se vuelve un cuello de botella: con la malla, cada llamada que no
  logra conexión directa pasa por el relay de Metered (50 GB/mes). Un SFU con IP
  pública lo evitaría.

## Consecuencias

- No hay servidor de medios que desplegar ni operar, y el coste sigue en cero.
- Quien dicta la clase necesita un equipo y una conexión mejores que los
  alumnos (~1 núcleo, ~1 Mbps de subida). Hay que decirlo en la guía de uso.
- VOZ-03 se diseña sobre "a quién llamo", no sólo sobre "cuánto atenúo".
- AULA-01 (compartir pantalla) en malla significa que el docente sube el vídeo
  una vez por alumno. Es el caso que más empuja hacia un SFU y se vuelve a
  medir al llegar a la Fase 4.
