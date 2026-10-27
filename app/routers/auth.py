"""Monta el router `/auth` (login / logout / me / change-password / verify) de `libraauth`.

`incluir_verify=True` es lo que hace posible el login de `/docs/` de la landing
(`librainmo_web`): un chequeo de credenciales **server-to-server**, protegido por
el secreto compartido `DOCS_AUTH_SECRET`, que nunca crea cookie de sesión. Sin
este flag la documentación de la landing no puede validar a nadie y su login
contesta 502 para cualquier credencial, incluso las correctas. Sin el secreto en
la instancia, el endpoint falla cerrado con 401.

Sin recuperación de contraseña ni login de demo todavía: los dos necesitan
cablear piezas más (SMTP, `PasswordResetService`, usuario de demo) que no son del
núcleo de la administración de alquileres. Se suman cuando haya correo configurado.
"""

from __future__ import annotations

from fastapi import APIRouter
from libraauth.session_auth import build_json_api_auth_router


def construir_router() -> APIRouter:
    return build_json_api_auth_router(incluir_verify=True)
