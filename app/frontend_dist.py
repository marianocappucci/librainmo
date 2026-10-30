"""Dónde está el build del frontend.

Lo usan `asgi.py` (para servirlo) y `main.py` (el manifest de la marca cae al `manifest.webmanifest` del build).

`LIBRAINMO_FRONTEND_DIST` pisa la búsqueda: lo usan los tests para medir la app con y sin build sin depender de si el
repo tiene `frontend/dist` compilado.

El dist se hornea fuera de `/app` (`/opt/frontend-dist`) porque el compose de dev monta `./:/app` entero para el
`--reload`, y eso taparía cualquier build copiado adentro.
"""

from __future__ import annotations

import os
from pathlib import Path

_DIST_DOCKER = Path("/opt/frontend-dist")
_DIST_LOCAL = Path(__file__).resolve().parent.parent / "frontend" / "dist"


def frontend_dist() -> Path:
    entorno = os.environ.get("LIBRAINMO_FRONTEND_DIST")
    if entorno:
        return Path(entorno)
    return _DIST_DOCKER if _DIST_DOCKER.is_dir() else _DIST_LOCAL
