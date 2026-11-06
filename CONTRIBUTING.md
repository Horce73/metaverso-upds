# Cómo contribuir

## Ramas

- **`main`** es lo que está en producción. Solo recibe cambios por pull request desde `dev` (o un arreglo urgente).
- **`dev`** es la rama de trabajo diario. Todo cambio entra por pull request.
- Cada tarea va en su propia rama, que sale de `dev` y vuelve a `dev`:

  ```bash
  git switch dev && git pull
  git switch -c campus-02-edificio-nuevo
  # … commits …
  git push -u origin campus-02-edificio-nuevo
  gh pr create --base dev
  ```

  El nombre lleva el área y un número (`campus-02`, `sec-09`, `voz-03`) y una descripción corta.
- Si un PR depende de otro que todavía no se mergeó, la rama sale de la del otro PR y la descripción lo dice.

Al mergear, GitHub borra la rama remota. Después, en tu copia local:

```bash
git switch dev && git pull --prune
git branch -d campus-02-edificio-nuevo
```

Si `git pull` dice que «no se pudo hacer fetch» de una rama, seguías parado en una rama ya borrada: vuelve a `dev`.

## Lo que exigen `main` y `dev`

Las dos ramas están protegidas con rulesets:

- No se puede hacer push directo, force push ni borrarlas.
- Todo PR necesita **una aprobación**, que se vuelve a pedir si llegan commits nuevos, y las conversaciones resueltas.
- Tiene que pasar el CI: **Frontend (tipos, lint, build)** y **Backend (tipos y suite QA)**.

Antes de abrir el PR, córrelo en tu máquina:

```bash
npm run lint && npm run test:unidad && npm run build
cd server && npm run build && npm run test:qa   # con el backend y la base levantados
```

## Base de datos

Los cambios de esquema van en una migración nueva, `server/migrations/NNNN_nombre.up.sql`, con su `.down.sql`. Nunca se edita una migración ya mergeada.

## Secretos

- Nunca subas `server/.env` ni el `.env` de la raíz (credenciales TURN, `JWT_SECRET`, `TUNNEL_TOKEN`).
- GitGuardian revisa cada PR: no escribas contraseñas literales en pruebas ni en el CI. Las cuentas de demo usan `@demo.local` y la clave de `DEMO_CLAVE` (ver [docs/demo.md](docs/demo.md)).
- El repositorio es público. Los planos y referencias de la universidad (`docs/referencias-upds`, `docs/mapas`) quedan fuera de git.
