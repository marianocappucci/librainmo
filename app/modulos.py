"""Módulos habilitados por plan (`plans.py`) y el gate para los routers.

Mismo patrón que el resto de la familia: `app.state.modules` es un repositorio con
`is_enabled(modulo)`, y `libracore.modules_gate.require_module` lo consulta en cada
request, así que prender o apagar un módulo tiene efecto inmediato.

🔑 **La tabla es la del motor.** La tabla `modulos` no es del dominio: la crea la cadena de
`libracore` (misma base, ADR-002) y es la que lee el backoffice (`app.database.get_modulos` y
`set_addon` por `docker exec`, ver `app/database.py`). Este repositorio no la mapea con
SQLAlchemy: delega en `libracore.db.modulos` y en `libracore.provisioning.apply_plan_modules`,
que escriben el tipo REAL de la columna `habilitado` (entero en unas instancias, booleano en
otras) y no repiten esa lógica acá. `libracore.db.core` tiene que estar configurado
(`crear_app()` lo hace).

Diferencias con MedLibra, a propósito:

- Los módulos **son** el producto, no extras: una instancia sin plan asignado arranca
  con **todo habilitado** (`ensure_seeded`: el seed no bloquea nada) y `aplicar_plan`
  apaga lo que el plan no incluye.
- Un módulo que no existe en `plans.py` está **apagado** (falla cerrado): un error de
  tipeo en `exigir_modulo("alquilers")` no deja una ruta abierta.
- 🔴 **Un add-on (`plans.ADDONS`) arranca APAGADO**: no se siembra y sin fila está apagado. Es la
  regla inversa a la de los módulos del plan; sin ella `resguardo_externo` quedaría prendido en todas
  las instancias al arrancar. Su fila la crea el backoffice (`app.database.set_addon`) al prenderlo.
"""

from __future__ import annotations

from fastapi import Depends
from libracore.db import modulos as modulos_del_motor
from libracore.modules_gate import require_module
from libracore.provisioning import apply_plan_modules

from app.auth import get_current_user
from plans import ADDONS, MODULOS, PLAN_MODULOS, PLANES, TODOS_LOS_MODULOS, modulos_de_plan

#: El plan con el que arranca una instancia que todavía no tiene ninguno asignado.
PLAN_POR_DEFECTO = PLANES[0]


class ModuleRepository:
    def __init__(self, database_url: str) -> None:
        # La URL hace falta sólo para escribir un plan (`apply_plan_modules` abre su propia
        # conexión, sin tocar el estado global del proceso); leer usa la del core configurado.
        self.database_url = database_url

    def ensure_seeded(self) -> None:
        """Inserta los módulos que falten con `habilitado=True`. No pisa el estado
        de los que ya existen: es idempotente ante reinicios."""
        faltan = TODOS_LOS_MODULOS - self.get_all().keys()
        if faltan:
            apply_plan_modules(self.database_url, active_modules=faltan, all_modules=faltan, plan=PLAN_POR_DEFECTO)

    def is_enabled(self, modulo: str) -> bool:
        if modulo in ADDONS:
            return bool(modulos_del_motor.get_modulos().get(modulo, False))
        if modulo not in TODOS_LOS_MODULOS:
            return False
        # Sin fila (no debería pasar tras `ensure_seeded`): el seed no bloquea.
        return self.get_all().get(modulo, True)

    def get_all(self) -> dict[str, bool]:
        return {m: h for m, h in modulos_del_motor.get_modulos().items() if m in TODOS_LOS_MODULOS}

    def set_enabled(self, modulo: str, habilitado: bool) -> None:
        if modulo not in TODOS_LOS_MODULOS | ADDONS:
            raise ValueError(f"Módulo desconocido: {modulo!r} (válidos: {', '.join(MODULOS)})")
        # `set_addon` del motor sólo cambia `habilitado` si la fila existe (no toca su `plan`).
        modulos_del_motor.set_addon(modulo, habilitado)

    def aplicar_plan(self, plan: str) -> None:
        """Habilita los módulos del plan y apaga los demás."""
        if plan not in PLAN_MODULOS:
            raise ValueError(f"Plan desconocido: {plan!r}")
        apply_plan_modules(
            self.database_url,
            active_modules=modulos_de_plan(plan),
            all_modules=TODOS_LOS_MODULOS - ADDONS,
            plan=plan,
        )


def exigir_modulo(modulo: str) -> list:
    """Las dependencias de un router que pertenece a `modulo`.

    La sesión va **primero**: sin ella el pedido es un 401, no un 403 que le
    cuenta a un anónimo qué módulos tiene contratados la instancia. Después, el
    gate del motor (403 si el plan no incluye el módulo). Se usa así:

        APIRouter(dependencies=exigir_modulo("alquileres"))
    """
    return [Depends(get_current_user), Depends(require_module(modulo))]
