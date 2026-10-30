"""Entrypoint ASGI: `uvicorn app.asgi:app`.

Cuando exista el build del frontend (F1b) lo sirve desde el **mismo origen** que
la API, con catch-all a `index.html` para el ruteo del lado del cliente. Sin
build —hoy— la app levanta igual y sólo sirve la API.

El dist se hornea fuera de `/app` (`/opt/frontend-dist`) porque el compose de dev
monta `./:/app` entero para el `--reload`, y eso taparía cualquier build copiado
adentro.
"""

from __future__ import annotations

from libracore.spa import montar_spa

from app.frontend_dist import frontend_dist
from app.main import crear_app

app = crear_app()

FRONTEND_DIST = frontend_dist()

# `montar_spa` es del motor: cabeceras de caché, `HEAD`, y 404 (no el index) para
# las rutas de `/api` que no existen.
if (FRONTEND_DIST / "index.html").is_file():
    montar_spa(app, FRONTEND_DIST, prefijos_api=("api", "auth", "admin", "terminos", "salud", "health"))
