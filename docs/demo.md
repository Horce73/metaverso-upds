# Entorno de demostración (OPS-06)

Objetivo: que mostrar el proyecto no dependa de tener la laptop encendida en ese momento. Se necesitan tres cosas:

1. **Una máquina siempre encendida** con Docker.
2. **Una URL fija** (OPS-02, `docs/tunel.md`).
3. **Datos de ejemplo** para que el tablero, las actas y los mapas no estén vacíos.

## 1. La máquina

Cualquier Linux con Docker y Docker Compose sirve, sin abrir puertos: el túnel sale hacia Cloudflare.

| Opción | Costo | Nota |
|---|---|---|
| Servidor o VM de la universidad | 0 | Lo más estable si TI lo permite. |
| Oracle Cloud *Always Free* (VM Ampere) | 0 | Pide tarjeta para verificar la cuenta; la imagen de Postgres y Node tiene versión ARM. |
| Mini PC o PC vieja en casa | luz | Funciona igual, mientras no se apague. |

Mínimo razonable: 2 vCPU, 2 GB de RAM y 10 GB de disco. La voz va entre navegadores (y por TURN), no por esta máquina, así que el número de personas casi no la carga.

## 2. Instalar y arrancar

```sh
git clone https://github.com/Horce73/metaverso-upds.git && cd metaverso-upds

# Configuración del backend: JWT_SECRET (largo y al azar) y las credenciales
# TURN. Es la misma que server/.env en desarrollo; no se sube al repositorio.
cp server/.env.example server/.env   # y completar
# URL fija: TUNEL_COMANDO y TUNNEL_TOKEN (ver docs/tunel.md)
cp .env.example .env                 # y completar

docker compose up -d --build
docker compose ps                    # backend "healthy" (OPS-03)
```

Todos los servicios tienen `restart: always`: si la máquina se reinicia, la demo vuelve sola.

## 3. Datos de ejemplo

```sh
docker compose exec -e DEMO_CLAVE='una-clave-para-la-demo' backend node dist/sembrarDemo.js
```

Esto crea, todo identificable por el dominio `@demo.local` y la asignatura `DEMO-101`:

- **Docente** `docente@demo.local` y **12 estudiantes** (`estudiante1@demo.local` a `estudiante12@demo.local`), todos con la clave de `DEMO_CLAVE`. Si no se pasa, se genera una y se muestra.
- La asignatura **Ingeniería de Software (demo)** con su **Aula de demostración**.
- **Seis clases ya dictadas**, una por semana, con:
  - Asistencia variada: presentes, tardanzas, ausencias y quienes se fueron antes.
  - Chat.
  - En la última, una encuesta cerrada y el acta grabada con subtítulos.
- El **mapa de calor** del aula.

Así, al entrar como el docente demo:

- **Mis Clases → Asistencia** muestra el semestre y se puede exportar a CSV.
- **Actas de clase** muestra la última clase grabada.

El administrador ve el mapa de calor del aula de demostración.

Correrlo de nuevo **borra lo anterior y lo vuelve a crear**: la demo vuelve a su estado inicial después de que alguien la use. Para dejarla siempre limpia, se puede programar cada noche:

```cron
0 4 * * *  cd /ruta/metaverso-upds && docker compose exec -T -e DEMO_CLAVE=… backend node dist/sembrarDemo.js
```

Para quitar los datos de demo: `docker compose exec backend node dist/sembrarDemo.js --borrar`.

En desarrollo, sin Docker: `cd server && DEMO_CLAVE=… npm run demo:sembrar`.

## Antes de una presentación

- Abrir la URL fija desde un celular con datos móviles, no desde el Wi-Fi de la casa. Es lo que van a ver los demás.
- Entrar al Aula de demostración con dos cuentas a la vez (por ejemplo, una ventana privada) para mostrar voz, encuesta y subtítulos en vivo.
- `docker compose logs backend --since 10m --no-log-prefix | jq 'select(.nivel=="error")'` debería salir vacío (OPS-03, `docs/operacion.md`).
