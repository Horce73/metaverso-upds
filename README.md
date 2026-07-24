# 🌐 Metaverso Educativo UPDS — Aula Virtual 3D

Este es el prototipo piloto de la plataforma de clases virtuales en 3D para la **Facultad de Ingeniería (Ingeniería de Software)** de la Universidad Privada Domingo Savio (UPDS). Permite a los docentes dictar clases y a los estudiantes participar en un entorno tridimensional interactivo directamente desde el navegador, sin necesidad de instalar programas adicionales.

---

## ✨ Características Principales

*   **👥 Entorno Multijugador 3D**: Explora el *Campus Central UPDS* (con edificaciones, aulas 101/102, sala de descanso, sala de decanos y mobiliario detallado) y el *Aula Virtual de Ingeniería de Software* con avatares en tercera persona usando física de movimiento fluida con las teclas `W` `A` `S` `D`.
*   **🎙️ VoIP con Audio Espacial**: Comunicación por voz en tiempo real con WebRTC (PeerJS) y Web Audio API. Las voces de otros usuarios se atenúan y posicionan de forma realista según la distancia y rotación de tu avatar en la escena 3D.
*   **📋 Pizarra Digital Interactiva**: Pizarra interactiva sincronizada. Los docentes pueden dibujar trazos en vivo visibles para todos los estudiantes en el aula y guardar instantáneas vectoriales en la base de datos.
*   **📝 Asistencia Automática (RF-05)**: Registro de asistencias automático al cruzar el portón o umbral del aula. El servidor detecta la entrada de los estudiantes, determina su estado ("presente" o "tarde") y registra la hora de salida al desconectarse.
*   **🎨 Personalización de Avatares en Vivo**: Menú flotante interactivo para personalizar en tiempo real la vestimenta, color de piel, tamaño y accesorios (sombrero, gafas, mochila).
*   **📦 Base de Datos Autónoma**: Esquema optimizado para PostgreSQL 15+ configurado para ejecutarse en contenedores Docker o Podman.

---

## 🛠️ Stack Tecnológico

### Frontend
*   **React 19** + **TypeScript** + **Vite**
*   **Three.js** con **React Three Fiber (R3F)** y **@react-three/drei** (Motor 3D)
*   **Socket.io-client** (Sincronización en tiempo real)
*   **PeerJS** (Cliente de señalización WebRTC)
*   **CSS Modules / Vanilla CSS** (Estilos UI glassmorphic oscuros premium)

### Backend & Base de Datos
*   **Node.js** con **Express** y **TypeScript**
*   **Socket.io** (Servidor de eventos en tiempo real)
*   **PeerJS Server** integrado (Servidor de señalización VoIP WebRTC)
*   **PostgreSQL 15** + **pg client** (Persistencia relacional)
*   **Docker / Podman** (Contenerización de la BD)

---

## 🚀 Guía de Instalación y Uso Local

Sigue estos pasos en tu máquina de desarrollo para correr el proyecto completo:

### Paso 1: Levantar la Base de Datos (PostgreSQL 15)
Asegúrate de tener instalado Docker o Podman en tu sistema.
En la raíz de tu proyecto, levanta el contenedor con:
```bash
# Con Podman:
podman compose up -d

# Con Docker:
docker compose up -d
```

### Paso 2: Iniciar Servidores (Método Rápido Recomendado)
Puedes iniciar el Backend y el Frontend simultáneamente ejecutando el script incluido:
```bash
./start-dev.sh
```

### Paso 3: Iniciar Manualmente (Alternativo)
Si prefieres ejecutarlos en terminales independientes:
* **Backend:**
  ```bash
  cd server
  npm install
  npm run dev
  ```
* **Frontend:**
  ```bash
  npm install
  npm run dev
  ```

Vite levantará la interfaz del metaverso en `http://localhost:5173`.

---

## 🔑 Credenciales de Prueba por Defecto

*   **Correo Institucional Docente**: `docente.isw@upds.edu.bo`
*   **Contraseña**: `123456`

> También puedes utilizar la pestaña **"Regístrate aquí"** o el **"Ingreso como Invitado"** para probar la plataforma en ventanas de navegador normales o de modo incógnito.

---

## 📂 Estructura del Proyecto

```text
├── start-dev.sh           # Script bash para levantar Backend y Frontend simultáneamente
├── database.md            # Documentación del diseño físico de base de datos PostgreSQL
├── requerimientos.md      # Ingeniería de Requerimientos y trazabilidad RF/RNF
├── docker-compose.yml     # Archivo Compose para levantar la BD Postgres 15
├── package.json           # Dependencias y scripts del Frontend principal
├── src/                   # Código fuente del Frontend React 3D
│   ├── components/
│   │   ├── mundo3d/       # Módulo 3D unificado del Campus y Avatares
│   │   │   ├── AvatarModel.tsx       # Geometría del avatar 3D animado y accesorios
│   │   │   ├── CameraRig.tsx         # Cámara de 3ra persona con raycasting anti-paredes
│   │   │   ├── Campus.tsx            # Escenario 3D completo del Campus UPDS
│   │   │   ├── CustomizadorAvatar.tsx# Panel flotante de personalización en vivo
│   │   │   ├── Door.tsx              # Portón principal de ingreso y asistencia
│   │   │   ├── Edificio.tsx          # Módulo de arquitectura 3D para aulas y salas
│   │   │   ├── Mobiliario.tsx        # Muebles, escritorios, pizarras y elementos decorativos
│   │   │   ├── texto3d.ts            # Texturas Canvas para etiquetas flotantes sobre avatares
│   │   │   └── useKeyboardControls.ts# Hook optimizado de captura de teclado WASD/Flechas
│   │   ├── AudioClient.ts      # Cliente VoIP y Web Audio API espacializada
│   │   ├── Login.tsx           # Interfaz de acceso glassmorphic
│   │   ├── MetaversoCanvas.tsx # Lienzo principal Three.js y coordinador Sockets/VoIP
│   │   └── Pizarra2D.tsx       # Canvas de dibujo colaborativo en vivo
│   ├── App.tsx                 # Enrutamiento, sockets globales y layouts
│   ├── index.css               # Estilos globales y tokens visuales premium
│   └── main.tsx
└── server/                # Código fuente del Backend Node.js
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── db.ts               # Driver de conexión y Mock DB de contingencia
        ├── socketHandler.ts    # Manejador de eventos sockets (asistencia/3D)
        └── index.ts            # Servidor HTTP, APIs Express y Server PeerJS
```
