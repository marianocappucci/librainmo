# syntax=docker/dockerfile:1

# Etapa aparte para el frontend (React+Vite), mismo patrón que el resto de la
# familia: node no hace falta en la imagen final, sólo el resultado del build.
# `app/asgi.py` busca el build en `/opt/frontend-dist` y lo sirve con
# `libracore.spa.montar_spa`.
FROM node:22-slim AS frontend-build
WORKDIR /frontend
# `libra-ui` se instala desde GitHub (`github:marianocappucci/libra-ui#vX.Y.Z`).
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build
# 🔴 `npm run build` puede devolver 0 aunque `tsc -b` haya fallado y no haya escrito
# nada. Sin esta línea la imagen se construye igual y sirve un 404 donde iba la
# SPA: un build verde que no incluye nada.
RUN test -f dist/index.html || { echo "ERROR: el build del frontend no dejó dist/index.html"; exit 1; }

FROM python:3.12-slim

# Las dependencias de terceros salen de `uv.lock`, no de la resolución de pip
# del día del build: dos builds del mismo commit dan la misma imagen. El venv
# vive FUERA de /app porque el compose de dev monta ./:/app encima y lo taparía.
COPY --from=ghcr.io/astral-sh/uv:0.12.10 /uv /uvx /bin/
ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_NO_CACHE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/opt/venv/bin:$PATH"

# Huso horario del ecosistema: UTC-3 fijo, sin horario de verano.
ENV TZ=America/Argentina/Buenos_Aires \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# `postgresql-client` trae `pg_dump` y `pg_restore`, que es lo que corre
# `libracore.respaldo`. `git` hace falta porque `libraauth` y `libracore` se
# instalan desde `git+https` (ver pyproject.toml).
#
# 🔴 El cliente va CLAVADO en la major del servidor (`postgres:16`), no ">= la
# del servidor": `pg_restore` de una major más nueva abre la sesión con
# parámetros que el 16 no conoce y, como el restore corre con
# `--single-transaction`, aborta entero. Si algún día sube la imagen del sidecar
# en `docker-compose.yml`, sube este número en el mismo movimiento.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tzdata curl git ca-certificates gnupg \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo $VERSION_CODENAME)-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-16 \
 && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone \
 && rm -rf /var/lib/apt/lists/*

# Que el binario esté, y que sea el 16: un `pg_restore` de otra major se instala
# sin quejarse y falla recién el día que alguien restaura.
RUN pg_restore --version | grep -q ' 16\.' \
 || { echo "ERROR: pg_restore no es 16.x -> $(pg_restore --version)"; exit 1; }

WORKDIR /app

COPY pyproject.toml uv.lock .python-version plans.py ./
COPY app ./app
RUN uv sync --frozen --no-dev --no-editable

COPY alembic.ini ./
COPY migrations ./migrations

# El build de la SPA va FUERA de /app, por lo mismo que el venv: el compose de dev
# monta `./:/app` entero (para el `--reload`) y taparía cualquier cosa copiada ahí.
COPY --from=frontend-build /frontend/dist /opt/frontend-dist

# `data/` es el punto de montaje del volumen donde caen los ZIP de backup y el
# logo. Se crea en la imagen para que nazca con el dueño correcto: Docker le
# copia el propietario al volumen la primera vez, y si no existiera quedaría de
# root y el proceso —que corre sin privilegios— no podría escribirlo.
RUN mkdir -p /app/data \
 && useradd -m -u 10001 librainmo && chown -R librainmo /app
USER librainmo

EXPOSE 8000

# El healthcheck consulta la base: `/salud` hace un `SELECT 1` antes de
# contestar, así que si PostgreSQL no responde el contenedor no se reporta sano.
# Mira el CUERPO y no el código HTTP: con la SPA servida por un catch-all
# cualquier ruta devuelve `200 text/html`, y `curl -f` no podría fallar nunca.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["python3", "-c", "import json,urllib.request; assert isinstance(json.load(urllib.request.urlopen('http://localhost:8000/salud', timeout=3)), dict)"]

CMD ["uvicorn", "app.asgi:app", "--host", "0.0.0.0", "--port", "8000"]
