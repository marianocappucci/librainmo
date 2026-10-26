"""Session auth de LibraInmo — shim sobre `libraauth`.

Existe para que el resto del producto importe los gates de un solo lugar: si
mañana cambia la forma de pedir un rol, se toca acá y no en cada router.

El «quién hizo qué» del log de actividad no se cablea acá: lo resuelve el
middleware de `libraauth` (`agregar_middleware_de_usuario`, en `main.py`), que
lee el usuario de la cookie firmada.
"""

from __future__ import annotations

from libraauth.repository import UserRepository
from libraauth.session_auth import (
    SessionAuth,
    json_api_get_current_user,
    json_api_get_session_auth,
    json_api_require_admin_o_servicio_o_panel,
    json_api_require_role,
)

from app.roles import ADMIN

#: Nombre de la cookie. Propio por producto: dos instancias de productos
#: distintos bajo el mismo dominio padre se pisarían la sesión si compartieran
#: nombre.
COOKIE = "inmo_session"

get_current_user = json_api_get_current_user
get_session_auth = json_api_get_session_auth

#: Rol admin **o** la credencial de servicio del backoffice / del panel. Es el
#: gate del ABM de usuarios: el backoffice administra los usuarios de cada
#: instancia sin tener una sesión en ella. Sin `LIBRA_SERVICE_TOKEN` ni
#: `LIBRA_PANEL_TOKEN` en el entorno se comporta igual que `require_admin`.
require_admin_o_servicio_o_panel = json_api_require_admin_o_servicio_o_panel


def require_rol(*roles: str):
    """403 salvo que el usuario tenga alguno de `roles` (y 401 sin sesión).

    Es el `json_api_require_role` del motor, que además corta con 403 mientras la
    instancia no haya aceptado los Términos y deja pasar al visitante de la demo
    sólo en lecturas.
    """
    return json_api_require_role(*roles)


require_admin = require_rol(ADMIN)


def construir_session_auth(usuarios: UserRepository) -> SessionAuth:
    return SessionAuth(
        dev_secret_fallback="librainmo-dev-secret-not-for-prod",
        get_user_by_username=usuarios.get_by_username,
        check_credentials=usuarios.check_credentials,
        cookie_name=COOKIE,
    )


__all__ = [
    "SessionAuth",
    "UserRepository",
    "construir_session_auth",
    "get_current_user",
    "get_session_auth",
    "require_admin",
    "require_admin_o_servicio_o_panel",
    "require_rol",
]
