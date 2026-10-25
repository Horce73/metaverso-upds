# Túnel público (OPS-02)

El servicio `tunnel` de `docker-compose.yml` publica el frontend en internet con Cloudflare, sin abrir puertos del router. Tiene dos modos.

## Túnel rápido (por defecto)

No hace falta configurar nada:

```sh
docker compose up -d
npm run tunel:url        # → https://palabras-al-azar.trycloudflare.com
```

La URL **cambia en cada arranque** del contenedor `tunnel`, y hay que volver a pasarla antes de cada prueba con otras personas. Sirve para probar solo; no tiene garantía de disponibilidad.

## Túnel con nombre fijo

Da una URL estable, por ejemplo `https://metaverso.tu-dominio.com`, que se comparte una vez.

**Requisito:** una cuenta gratuita de Cloudflare y un dominio que use los DNS de Cloudflare. Puede ser un dominio propio barato o un subdominio que la universidad delegue a Cloudflare. Sin dominio no hay URL fija: el túnel rápido es lo único que Cloudflare da sin dominio.

Pasos, una sola vez:

1. En el panel de Cloudflare: **Zero Trust → Networks → Tunnels → Create a tunnel**. Tipo *Cloudflared*, nombre `metaverso-upds`.
2. En "Install connector", copiar el **token**: la cadena larga que aparece después de `--token`. No hace falta instalar nada, porque el contenedor ya trae `cloudflared`.
3. En **Public Hostnames → Add a public hostname**:
   - Subdominio y dominio: el que se quiera, por ejemplo `metaverso.tu-dominio.com`.
   - Service: **HTTP** → `frontend:80`.
4. En la raíz del proyecto, copiar `.env.example` a `.env` y completar:
   ```sh
   TUNEL_COMANDO=tunnel --no-autoupdate run
   TUNNEL_TOKEN=el-token-del-paso-2
   ```
   `.env` está en `.gitignore`: **el token no se sube al repositorio**. Quien tenga el token puede publicar en ese dominio.
5. `docker compose up -d tunnel`. En `docker compose logs tunnel` deben aparecer cuatro `Registered tunnel connection`.

Para volver al túnel rápido, comentar las dos líneas del `.env` y volver a ejecutar `docker compose up -d tunnel`.

## Notas

- **No hace falta tocar CORS.** El navegador siempre habla con un único origen (el túnel apunta a nginx, que reenvía `/api`, `/socket.io` y `/peer` al backend).
- **Voz:** el túnel lleva la señalización. El audio va directo entre navegadores, o por el TURN configurado en `server/.env` cuando no se puede directo. Con URL fija o sin ella, funciona igual.
- **Si el túnel responde 301 a sí mismo o no carga,** suele ser que el contenedor `tunnel` arrancó antes que el frontend. `docker compose restart tunnel` lo arregla; con el túnel rápido, la URL cambia.
- **El puerto 5173 de la máquina** es el del frontend en Docker. Si al mismo tiempo corre `npm run dev`, que usa el mismo puerto, el contenedor del frontend no arranca y el túnel no tiene a qué apuntar.
