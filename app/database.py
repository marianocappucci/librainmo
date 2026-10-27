"""Módulos y add-ons de la instancia: el contrato que espera el backoffice.

🔴 **Este módulo existe por un contrato externo, no por el producto.** El backoffice
(`libracore.admin.services`) lee y prende los módulos y los add-ons corriendo un snippet
ADENTRO de este contenedor:

    docker exec <contenedor> python3 -c "... from app.database import get_modulos, set_addon; ..."

así que `app.database` tiene que exportar `get_modulos` y `set_addon` con esos nombres. El único
add-on es `resguardo_externo` (la copia en la nube de la inmobiliaria), y el backoffice lo prende por acá: sin esto
el `docker exec` muere con `ImportError` y la pantalla de la instancia queda en blanco. Es el mismo contrato que
cumplen LibraCargo y LibraDesk.

**No confundir con `app.db`**, que es el engine de SQLAlchemy del dominio. Esto habla con el
schema de **`libracore`** por la conexión SQL cruda de `libracore.db.core`, que es la misma base
(ADR-002).

Acá no se copia lógica: se delega en `libracore.db.modulos`, que es la implementación única de la familia.
"""

from __future__ import annotations

from libracore.db import core as libracore_core
from libracore.db import modulos as _modulos

from app.config import Config


def _asegurar_core_configurado() -> None:
    """Apunta `libracore.db.core` a la base de ESTA instancia si nadie lo hizo.

    Adentro de la app, `crear_app()` ya configuró el core y acá no hay nada que hacer. Bajo el
    `docker exec` del backoffice no corrió ningún arranque, así que el core está sin configurar y
    `get_connection()` levantaría `RuntimeError`: ese caso se resuelve solo, sin bootear la app entera.
    Se pregunta antes (`esta_configurado()`) para no pisarle la configuración a una app viva.
    """
    if not libracore_core.esta_configurado():
        libracore_core.configure(Config.desde_entorno().database_url)


def get_modulos() -> dict[str, bool]:
    """`{modulo: habilitado}` de esta instancia."""
    _asegurar_core_configurado()
    return _modulos.get_modulos()


def set_addon(nombre: str, habilitado: bool) -> None:
    """Prende o apaga un add-on en esta instancia (efecto inmediato).

    No valida que `nombre` sea un add-on: eso lo hace quien llama, contra `plans.ADDONS`.
    """
    _asegurar_core_configurado()
    _modulos.set_addon(nombre, habilitado)
