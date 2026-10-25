# Operación

Cómo ver qué está pasando en un backend en marcha y cómo saber si está sano.

## Registro (logs)

El backend escribe **una línea por evento** (`server/src/registro.ts`):

- En Docker Compose el formato es **JSON** (`LOG_FORMATO=json`).
- Con `npm run dev` es **texto** legible.
- `LOG_FORMATO=json|texto` fuerza uno u otro.

Cada línea trae `t` (hora UTC), `nivel` (`info`, `warn` o `error`) y `msg`, más los campos del evento. Los errores van en `error`, con `mensaje`, `codigo` y `pila`.

```sh
# Todo lo que falló en la última hora
docker compose logs backend --since 1h --no-log-prefix | jq -c 'select(.nivel=="error")'

# Pedidos lentos o con error de servidor
docker compose logs backend --no-log-prefix | jq -c 'select(.msg=="pedido" and (.ms > 500 or .estado >= 500))'

# Qué hizo un usuario: pedidos, entradas a espacios, sockets
docker compose logs backend --no-log-prefix | jq -c 'select(.usuarioId==42)'

# Quién entró a un aula
docker compose logs backend --no-log-prefix | jq -c 'select(.msg=="unido al espacio" and .espacioId==2)'
```

Eventos que se registran:

| `msg` | Campos |
|---|---|
| `pedido` | `metodo`, `ruta` (sin query), `estado`, `ms`, `usuarioId`, `ip`. Se registra como `warn` si el estado es 5xx. Las sondas de salud no se registran. |
| `socket conectado`, `socket desconectado` | `socketId`, `usuarioId` y, al desconectarse, `espacioId` |
| `unido al espacio` | `socketId`, `usuarioId`, `espacioId`, `tipo` |
| `clase iniciada`, `clase finalizada` | `sesionId`, `espacioId` |
| `migración aplicada`, `migración revertida` | `version`, `nombre` |
| `excepción sin atrapar`, `promesa rechazada sin atrapar` | `error` con la pila |

La **bitácora** (tabla `bitacora`, visible en Panel de administración → Reportes) es otra cosa. Es el registro de auditoría de lo que hacen las personas: logins, exportaciones, clases. Los logs son para diagnosticar el servidor.

## Sondas de salud

| Ruta | Responde 200 cuando | Si no |
|---|---|---|
| `GET /api/salud` | el proceso responde | no contesta |
| `GET /api/salud/lista` | la base contesta en menos de 2 s y no hay migraciones pendientes | **503** con el motivo (`baseDeDatos`, `migraciones`) |

```sh
curl -s localhost:3001/api/salud/lista
# {"estado":"ok","baseDeDatos":"ok","migraciones":"ok"}
```

- Docker Compose usa `/api/salud/lista` como `healthcheck` del backend (`docker compose ps` muestra `healthy`), y el frontend espera a que el backend esté sano para arrancar.
- Si PostgreSQL se reinicia, el backend **sigue vivo**: la sonda da 503 mientras la base no conteste y vuelve a 200 sola. Antes, una conexión cortada por la base tumbaba el proceso.
