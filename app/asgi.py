"""Entrypoint ASGI: `uvicorn app.asgi:app`.

Cuando exista el build del frontend (F1b) lo sirve desde el **mismo origen** que
la API, con catch-all a `index.html` para el ruteo del lado del cliente. Sin
build —hoy— la app levanta igual y sólo sirve la API.

El dist se hornea fuera de `/app` (`/opt/frontend-dist`) porque el compose de dev
monta `./:/app` entero para el `--reload`, y eso taparía cualquier build copiado
adentro.
"""

from __future__ import annotations

import os
from pathlib import Path

from libracore.spa import montar_spa

from app.main import crear_app

app = crear_app()

_DIST_DOCKER = Path("/opt/frontend-dist")
_DIST_LOCAL = Path(__file__).resolve().parent.parent / "frontend" / "dist"
#: `LIBRAINMO_FRONTEND_DIST` pisa la búsqueda: lo usan los tests para medir la app
#: con y sin build sin depender de si el repo tiene `frontend/dist` compilado.
_DIST_ENTORNO = os.environ.get("LIBRAINMO_FRONTEND_DIST")
if _DIST_ENTORNO:
    FRONTEND_DIST = Path(_DIST_ENTORNO)
else:
    FRONTEND_DIST = _DIST_DOCKER if _DIST_DOCKER.is_dir() else _DIST_LOCAL

# `montar_spa` es del motor: cabeceras de caché, `HEAD`, y 404 (no el index) para
# las rutas de `/api` que no existen.
if (FRONTEND_DIST / "index.html").is_file():
    montar_spa(app, FRONTEND_DIST, prefijos_api=("api", "auth", "admin", "terminos", "salud", "health"))
