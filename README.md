# 🌐 Metaverso Educativo UPDS — Aula Virtual 3D

Este es el prototipo piloto de la plataforma de clases virtuales en 3D para la **Facultad de Ingeniería (Ingeniería de Software)** de la Universidad Privada Domingo Savio (UPDS). Permite a los docentes dictar clases y a los estudiantes participar en un entorno tridimensional interactivo directamente desde el navegador, sin necesidad de instalar programas adicionales.

---

## ✨ Características Principales

*   **👥 Entorno Multijugador 3D**: Explora el *Campus Central UPDS* y el *Aula Virtual de Ingeniería de Software* con avatares en tercera persona usando física de movimiento fluida con las teclas `W` `A` `S` `D`.
*   **🎙️ VoIP con Audio Espacial**: Comunicación por voz en tiempo real con WebRTC (PeerJS) y Web Audio API. Las voces de otros usuarios se atenúan y posicionan de forma realista según la distancia y rotación de tu avatar en la escena 3D (escuchas más fuerte a quien tienes al lado).
*   **📋 Pizarra Digital Interactiva**: Pizarra interactiva sincronizada. Los docentes pueden dibujar trazos en vivo visibles para todos los estudiantes en el aula y guardar instantáneas (snapshots vectoriales) en la base de datos.
*   **📝 Asistencia Automática (RF-05)**: Registro de asistencias automático al cruzar el umbral del aula. El servidor detecta la entrada de los estudiantes, determina su estado ("presente" o "tarde" según la tolerancia configurada por el profesor) y registra la hora de salida al desconectarse.
*   **🎨 Personalización de Avatares**: Menú de configuración para que los usuarios elijan sus colores de ropa, cabello, rasgos y escala (altura), con un esquema listo para migrar a avatares profesionales externos de Ready Player Me (`.glb`).
*   **📦 Base de Datos Autónoma**: Esquema optimizado para PostgreSQL 15+ que cuenta con datos semilla de inicio y está configurado para ejecutarse en contenedores Docker o Podman.

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
> **Nota**: El contenedor se inicializará automáticamente con todas las tablas e índices definidos en `database.md`, además de inyectar datos semilla (docente de prueba, asignatura piloto y aulas).

### Paso 2: Configurar e iniciar el Backend
Abre una terminal nueva en el directorio `/server`:
```bash
cd server
# Instalar dependencias
npm install
# Compilar y arrancar el servidor en modo desarrollo
npm run dev
```
Al arrancar correctamente, verás la salida:
```text
✅ Conexión exitosa a PostgreSQL
🚀 Metaverso UPDS Backend corriendo en http://localhost:3001
```

### Paso 3: Configurar e iniciar el Frontend
Abre otra terminal diferente en la raíz del proyecto y ejecuta:
```bash
# Instalar dependencias 3D y de sockets
npm install
# Iniciar el servidor local de Vite
npm run dev
```
Vite levantará la interfaz del metaverso en `http://localhost:5173`.

---

## 🔑 Credenciales de Prueba por Defecto

Para iniciar sesión de inmediato como docente y probar la administración del aula y pizarras, usa las siguientes credenciales:

*   **Correo Institucional**: `docente.isw@upds.edu.bo`
*   **Contraseña**: `123456`

> También puedes utilizar la pestaña **"Regístrate aquí"** para crear cuentas rápidas de alumnos de prueba y abrir varias ventanas de navegador (o ventanas en modo incógnito) para comprobar las físicas multijugador y el audio tridimensional.

---

## 📂 Estructura del Proyecto

```text
├── database.md            # Documentación del diseño físico de base de datos PostgreSQL
├── requerimientos.md      # Ingeniería de Requerimientos y trazabilidad RF/RNF
├── docker-compose.yml     # Archivo Compose para levantar la BD Postgres 15
├── package.json           # Dependencias y scripts del Frontend
├── src/                   # Código fuente del Frontend React
│   ├── components/
│   │   ├── AudioClient.ts      # Cliente VoIP y Web Audio API espacializada
│   │   ├── Avatar3D.tsx        # Geometría del Avatar 3D configurable
│   │   ├── CustomAvatar.tsx    # Interfaz 2D para cambiar rasgos/colores
│   │   ├── Login.tsx           # Interfaz de acceso glassmorphic
│   │   ├── MetaversoCanvas.tsx # Lienzo principal Three.js y controles de teclado
│   │   └── Pizarra2D.tsx       # Canvas de dibujo colaborativo
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
