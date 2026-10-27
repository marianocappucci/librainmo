# Desarrollo local

LibraInmo corre sobre **PostgreSQL** (no hay SQLite, ni siquiera en los tests) y
Python 3.12. Todo es local: no hay remoto, dominio ni deploy todavía.

## Requisitos

- Python 3.12 y [`uv`](https://docs.astral.sh/uv/) (`~/.local/bin/uv`).
- Un PostgreSQL 16 al que tu usuario pueda crear bases. Para la suite alcanza un contenedor descartable (ver abajo).
- Acceso de lectura a los repos `libraauth` y `libracore` en GitHub: se instalan por
  `git+https` con los tags pineados en `pyproject.toml`.

## Instalar

```bash
cd ~/proyectos/librainmo
uv sync --extra dev        # crea .venv y respeta uv.lock
```

## Base de tests

La suite **reconstruye la base entera** (`DROP SCHEMA public CASCADE` y migra las tres
cadenas) y por eso sólo corre sobre bases cuyo nombre empiece con `librainmo_`: con
otra, aborta. Con `pytest -n N` (xdist) **cada worker usa su propia base**
(`<base>_gw0`, `<base>_gw1`…), que se crea al arrancar y se borra al salir; y sin xdist,
`<base>_main`. Por eso `DATABASE_URL` apunta a una base que exista en el servidor, la
«original», y la suite deriva las suyas.

```bash
# un PostgreSQL descartable (se borra solo al pararlo)
docker run -d --rm --name pg-librainmo -e POSTGRES_USER=librainmo -e POSTGRES_PASSWORD=librainmo-ci \
  -e POSTGRES_DB=librainmo -e TZ=America/Argentina/Buenos_Aires -p 127.0.0.1:55433:5432 postgres:16
export DATABASE_URL=postgresql+psycopg://librainmo:librainmo-ci@127.0.0.1:55433/librainmo
# ... y al terminar:
docker rm -f pg-librainmo
```

Sin `DATABASE_URL` los tests se saltean (no fallan). Los tests de migraciones crean y
borran por su cuenta bases auxiliares cuyo nombre deriva de la del worker
(`<base>_migracion`, `<base>_motor`, `<base>_vacia`, `<base>_comando`).

## Correr los tests

La máquina es compartida y WSL ya se colgó por correr suites en paralelo: **siempre
a través de `suite-local.sh`**, que toma un candado, baja la prioridad y topea
`-n` en 2.

```bash
bash ~/Proyectos-Wiki/herramientas/suite-local.sh .venv/bin/pytest -n 2 -q
# con cobertura (el piso está en pyproject.toml, [tool.coverage.report]):
bash ~/Proyectos-Wiki/herramientas/suite-local.sh .venv/bin/pytest -n 2 -q --cov=app --cov=plans
.venv/bin/ruff check .
```

Un archivo o un test suelto: agregá la ruta (`tests/test_modulos.py -k plan`).

> `app/asgi.py` se prueba en un subproceso (arma la app al importar), y la cobertura no lo ve.

## Correr la app

### Sin Docker, contra tu Postgres local

```bash
createdb librainmo_dev
export LIBRAINMO_DATABASE_URL=postgresql+psycopg:///librainmo_dev
export SECRET_KEY=$(openssl rand -hex 32)
export LIBRAINMO_ADMIN_PASSWORD=una-clave-de-desarrollo   # sin esto la app NO arranca

.venv/bin/python -m app.migrar           # las tres cadenas: libraauth, libracore y la del dominio
.venv/bin/uvicorn app.asgi:app --reload --port 8107
```

- API y documentación interactiva: <http://127.0.0.1:8107/docs>
- Sonda: <http://127.0.0.1:8107/salud>
- Usuario inicial: `admin` / la clave de `LIBRAINMO_ADMIN_PASSWORD`. Se crea sólo
  si la tabla de usuarios está vacía.
- La cookie de sesión es `Secure`: el navegador la acepta en `localhost`, pero
  `curl` hay que usarlo con `-c`/`-b` y `https`, o probar desde `/docs`.
- Mientras la instancia no haya aceptado los Términos, la API de administración contesta 403
  (`terminos_pendientes`): se aceptan desde la SPA, o con `POST /terminos/aceptar`.

La app **no crea tablas al arrancar**: si falta migrar cualquiera de las tres cadenas, no
levanta y dice qué correr. Cada cambio de modelo trae su revisión en `migrations/versions/` (se
escribe a mano; `test_el_modelo_y_la_migracion_dicen_lo_mismo` avisa si divergen).

## Correr el frontend

La SPA vive en `frontend/` (React + TypeScript + Vite + Tailwind, sobre `libra-ui`). Hace falta
Node 22 y acceso de lectura a `marianocappucci/libra-ui` en GitHub: el kit se instala desde ahí, con
el tag pineado en `frontend/package.json` y el commit resuelto en `package-lock.json`.

```bash
cd ~/proyectos/librainmo/frontend
npm ci                  # instala lo del lock (la primera vez, o al cambiar el lock)
npm test                # vitest: pantallas, guardas y helpers
npm run lint            # oxlint
npx tsc -b              # typecheck
npm run build           # tsc -b + vite build → frontend/dist
```

**Dos formas de verla**, las dos contra el backend de arriba (`:8107`):

- **Servida por el backend** (como en producción): después de `npm run build`, `uvicorn app.asgi:app`
  sirve `frontend/dist` en el mismo origen, <http://127.0.0.1:8107/>. Hay que volver a construir
  para ver un cambio.
- **Con recarga en caliente**: `npm run dev` abre <http://localhost:5173>, y el proxy de Vite manda
  al backend `/api`, `/auth`, `/terminos`, `/salud`, `/health`, `/docs` y `/openapi.json`. Tiene que
  ser `localhost` (no la IP): la cookie de sesión es `Secure` y sólo `localhost` está exceptuado. Si el
  backend corre en otro puerto: `LIBRAINMO_BACKEND=http://localhost:8197 npm run dev`.

Lo primero que se ve es el login (`admin` y la clave de `LIBRAINMO_ADMIN_PASSWORD`) y, la primera vez
de una base, la pantalla de aceptación de los Términos. Para probar el otro rol, se crea desde
Usuarios (`operador`).

### Con Docker

```bash
cp .env.example .env     # completá LIBRAINMO_POSTGRES_PASSWORD, SECRET_KEY y LIBRAINMO_ADMIN_PASSWORD
docker compose up --build
```

Levanta `librainmo-postgres` (`postgres:16` con `timezone=America/Argentina/Buenos_Aires`,
sin puertos publicados) y `librainmo-dev` en <http://127.0.0.1:8107>. El compose
migra antes de arrancar. El `Dockerfile` construye la SPA en una etapa aparte y la deja en
`/opt/frontend-dist`, que es donde `app/asgi.py` la busca; en este compose, con `./:/app` montado, el
`frontend/dist` local no se usa.

## Variables de entorno

| Variable | Para qué | Default |
|---|---|---|
| `LIBRAINMO_DATABASE_URL` (o `DATABASE_URL`) | Base PostgreSQL (única: dominio, `libraauth` y `libracore`) | — (obligatoria) |
| `SECRET_KEY` | Firma de la cookie de sesión | — (obligatoria; `ENV=development` usa una de desarrollo) |
| `LIBRAINMO_ADMIN_USERNAME` | Usuario inicial | `admin` |
| `LIBRAINMO_ADMIN_PASSWORD` | Clave del usuario inicial | — (obligatoria, fail-closed) |
| `LIBRAINMO_ENTORNO` (o `ENTORNO`) | `dev`, `prod`… | `dev` |
| `LIBRAINMO_DATA_DIR` (o `DATA_DIR`) | Backups y logo | `./data` |
| `LIBRAINMO_FRONTEND_DIST` | Pisa dónde se busca el build de la SPA (lo usan los tests) | — |
| `LIBRA_SERVICE_TOKEN` / `LIBRA_PANEL_TOKEN` | Credenciales del backoffice y del panel para `/api/usuarios` | vacías (sólo admin) |
| `DEMO_MODE` + `DEMO_USERNAME` | Prenden la demo pública (`POST /auth/demo` con código de acceso, rol `operador`). Van **las dos** o no hay demo; en una instancia de cliente no se ponen | — (sin demo) |
| `DEMO_PASSWORD` / `DEMO_NAME` | Opcionales de la demo: una clave tipeable para el visitante y su nombre | clave aleatoria / `Visitante de la demo` |
| `LIBRAINMO_RESET_URL_BASE` | Pantalla a la que apunta el enlace del correo de recuperación de contraseña | `https://dev.librainmo.com.ar/reset-password` |
| `LIBRAAUTH_SMTP_HOST`, `_PORT`, `_USER`, `_PASSWORD`, `_FROM_EMAIL` | SMTP de respaldo para el correo de recuperación, si no hay uno guardado en Configuración → Integraciones | vacías (forgot-password contesta 503) |

## Planes y módulos

Una instancia nueva arranca con todos los módulos habilitados (hoy, `alquileres`). Para simular un
plan, o apagarlo:

```bash
.venv/bin/python -c "import plans; plans.aplicar_plan_en_db('postgresql+psycopg:///librainmo_dev', 'alquileres')"
```

La tabla es la `modulos` de `libracore`, no una del dominio (ADR-002).

## Datos de prueba

Nombres, CUIT, direcciones y teléfonos de tests y demos son **ficticios**; nunca personas o
empresas reales.
