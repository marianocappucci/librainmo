"""Monta el router `/auth` (login / logout / me / change-password / verify / demo / recuperación de contraseña /
captcha) de `libraauth`.

`incluir_verify=True` es lo que hace posible el login de `/docs/` de la landing (`librainmo_web`): un chequeo de
credenciales **server-to-server**, protegido por el secreto compartido `DOCS_AUTH_SECRET`, que nunca crea cookie de
sesión. Sin este flag la documentación de la landing no puede validar a nadie y su login contesta 502 para cualquier
credencial, incluso las correctas. Sin el secreto en la instancia, el endpoint falla cerrado con 401.

`incluir_demo=True` **no enciende nada por sí solo**: `POST /auth/demo` se registra únicamente si la instancia además
tiene `DEMO_MODE` y `DEMO_USERNAME`. En una instancia de cliente la ruta no existe. La otra mitad —el usuario del
visitante y el repositorio de códigos— la cablea `main.py`; son dos decisiones separadas y cada una falla distinto.

`incluir_password_reset=True` registra `POST /auth/forgot-password` y `POST /auth/reset-password`; necesita
`app.state.password_reset`, que pone `main.py`. Sin SMTP configurado la app levanta igual y el que avisa es el
endpoint, con un 503, cuando alguien pide un reset.

🔴 **El router se construye en una función y no al importar el módulo, a diferencia del resto de los routers de este
producto.** `build_json_api_auth_router` lee `DEMO_MODE`/`DEMO_USERNAME` *mientras construye*: un `router = ...` a
nivel de módulo las congela en el primer import, y en los tests `POST /auth/demo` daría 404 con la demo encendida.
"""

from __future__ import annotations

from fastapi import APIRouter
from libraauth.session_auth import build_json_api_auth_router


def construir_router() -> APIRouter:
    return build_json_api_auth_router(
        incluir_verify=True,
        incluir_password_reset=True,
        incluir_demo=True,
        # `GET /auth/captcha` (desafío ALTCHA) y el campo `captcha` obligatorio en el login y en forgot-password. Va
        # SIEMPRE, no recién después de N fallos: decisión del humano (2026-09-11, ADR-014 de libraauth). Un captcha
        # que falta o no vale da 400 y no suma intento fallido.
        captcha=True,
    )
