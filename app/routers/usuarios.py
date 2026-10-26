"""ABM de usuarios: el router unificado de `libraauth` con los roles de LibraInmo.

`/api/usuarios` es el prefijo de la familia (lo consume `Usuarios` de `libra-ui` y
el backoffice). El gate es admin **o** credencial de servicio/panel, para que el
backoffice administre los usuarios de la instancia sin tener sesión en ella.
"""

from __future__ import annotations

from fastapi import APIRouter
from libraauth.usuarios import build_users_router

from app.auth import require_admin_o_servicio_o_panel
from app.roles import ROLES


def construir_router() -> APIRouter:
    return build_users_router(
        prefix="/api/usuarios",
        roles=ROLES,
        admin_guard=require_admin_o_servicio_o_panel,
    )
