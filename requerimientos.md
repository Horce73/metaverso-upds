# Ingeniería de Requerimientos — Metaverso Educativo UPDS

**Proyecto:** Metaverso para clases virtuales (piloto: Ingeniería de Software)
**Alcance:** Proyecto básico — Campus Central + 1 aula virtual, por navegador, sin instalación.

---

## 1. Requerimientos Funcionales (RF)

| Código | Requerimiento |
|---|---|
| RF-01 | El sistema debe permitir la creación de avatares 3D personalizables (género, ropa, rasgos). |
| RF-02 | El sistema debe contar con un "Campus Central" (zona de encuentro) y "Aulas Virtuales" (salas privadas por asignatura). |
| RF-03 | El sistema debe soportar comunicación por voz en tiempo real (VoIP) con efecto espacial (oír más fuerte al que está cerca), con opción de silenciar el propio micrófono. |
| RF-04 | El sistema debe permitir compartir pizarras digitales y presentaciones PPT/PDF dentro del aula. |
| RF-05 | El sistema debe registrar la asistencia automáticamente al ingresar al aula. |
| RF-06 | El sistema debe permitir registrarse e iniciar sesión, con dos roles: estudiante y docente. |
| RF-07 | El sistema debe permitir mover el avatar con el teclado y ver en tiempo real a los demás usuarios conectados en el mismo espacio. |
| RF-08 | El docente debe poder programar las sesiones de clase y consultar el reporte de asistencia de la asignatura. |

## 2. Requerimientos No Funcionales (RNF)

| Código | Requerimiento | Cómo se verifica |
|---|---|---|
| RNF-01 (Rendimiento) | La latencia de audio no debe superar los 150 ms para garantizar fluidez en la conversación. | Medición extremo a extremo ≤ 150 ms |
| RNF-02 (Usabilidad) | La interfaz debe ser intuitiva para usuarios sin experiencia en videojuegos. | Un usuario nuevo llega a su aula en < 3 min sin ayuda |
| RNF-03 (Protección de datos) | El sistema debe cumplir con la protección de datos y privacidad de los usuarios según normativa local. | Aceptación de términos de uso; solo datos mínimos almacenados |
| RNF-04 (Disponibilidad) | El servicio debe tener un Uptime del 99.9% durante el horario lectivo. | ≤ 43 min de caída al mes en horario lectivo |
| RNF-05 (Seguridad) | Toda comunicación debe ir cifrada (HTTPS/WSS), las contraseñas deben almacenarse con hash (bcrypt/argon2) y el acceso a las aulas debe validarse según rol e inscripción. | Verificación de tráfico cifrado, esquema de BD y pruebas de acceso |
| RNF-06 (Rendimiento/Portabilidad) | La aplicación debe cargar en menos de 15 s con conexión de 10 Mbps, mantener 30 FPS en equipos de gama media y funcionar sin instalación en Chrome, Edge y Firefox. | Peso inicial ≤ 25 MB; ≥ 30 FPS con gráficos integrados; prueba en los 3 navegadores |

---

## 3. Trazabilidad con la base de datos

| Requerimiento | Tablas que lo soportan |
|---|---|
| RF-01 | `usuarios`, `avatares` |
| RF-02, RF-07 | `espacios`, `inscripciones` |
| RF-03 | (tiempo real, WebRTC — no se persiste) |
| RF-04 | `materiales`, `pizarra_snapshots` |
| RF-05, RF-08 | `sesiones_clase`, `asistencias` |
| RF-06, RNF-05 | `usuarios` (roles, hash de contraseña) |
| RNF-03 | `usuarios` (acepta_terminos) |
