"""Monta el router `/auth` (login / logout / me / change-password) de `libraauth`.

Sin recuperación de contraseña ni login de demo todavía: los dos necesitan
cablear piezas más (SMTP, `PasswordResetService`, usuario de demo) que no son del
núcleo de la administración de alquileres. Se suman cuando haya correo configurado.
"""

from __future__ import annotations

from fastapi import APIRouter
from libraauth.session_auth import build_json_api_auth_router


def construir_router() -> APIRouter:
    return build_json_api_auth_router()
