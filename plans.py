"""Los planes comerciales de LibraInmo y qué módulos habilita cada uno.

Fuente de verdad compartida con `libracore.provisioning.nuevo_cliente` (que
asigna el plan al dar de alta un cliente) y con `app.modulos` (que lo aplica
dentro de la instancia). Mismo patrón que el `plans.py` del resto de la familia.

## Qué es un módulo acá

Hoy hay **uno solo**, `alquileres`: la administración de alquileres (propiedades,
contratos con ajuste por índice, cobro al inquilino y liquidación al propietario).
Es el producto, no un extra: un plan sin él no sería un plan más barato sino otra
cosa. Por eso hay un único plan, `alquileres`, que lo habilita.

La parte comercial (ventas, reservas con seña, interesados) es la fase 3 del
`ROADMAP.md`. **Se declara como módulo cuando esté construida**, no antes: declararla
ahora le daría al backoffice una casilla para habilitar algo que la instancia no sirve.

⚠️ **Los precios son una decisión comercial** y todavía no se tomó [H]:
`PLAN_PRECIOS` va vacío a propósito. Cuando se defina, se completa acá y nada más.
"""

PLANES = ["alquileres"]

PLAN_LABELS = {
    "alquileres": "LibraInmo Alquileres",
}

#: Precio mensual de referencia (informativo, para el backoffice). Vacío hasta
#: que el negocio lo defina.
PLAN_PRECIOS: dict[str, int] = {}

PLAN_MODULOS = {
    "alquileres": {"alquileres"},
}

#: Todos los módulos gateables.
TODOS_LOS_MODULOS = set().union(*PLAN_MODULOS.values())

MODULOS = sorted(TODOS_LOS_MODULOS)

MODULO_LABELS = {
    "alquileres": "Alquileres (propiedades, contratos, cobro y liquidación)",
}

#: Sin add-ons todavía.
ADDONS: set[str] = set()


def modulos_de_plan(plan: str) -> set[str]:
    """Los módulos habilitados para un plan (vacío si el plan es desconocido).

    La llama `libracore.admin.services.planes_info()` (`GET /api/planes` del backoffice).
    """
    return set(PLAN_MODULOS.get(plan, set()))


def aplicar_plan_en_db(url: str, plan: str) -> None:
    """Aplica un plan en la base de una instancia (PostgreSQL), escribiendo la
    tabla `modulos` **del motor** (`libracore`, ADR-002 de este repo). Es lo que
    corre el alta de un cliente.

    Shim sobre `libracore.provisioning.apply_plan_modules`, como el resto de la
    familia. Requiere que la cadena de `libracore` ya esté migrada.
    """
    if plan not in PLAN_MODULOS:
        raise ValueError(f"Plan desconocido: {plan!r}")
    from libracore.provisioning import apply_plan_modules

    apply_plan_modules(
        url,
        active_modules=modulos_de_plan(plan),
        # `- ADDONS`: aplicar un plan nunca toca un add-on (hoy no hay ninguno).
        all_modules=TODOS_LOS_MODULOS - ADDONS,
        plan=plan,
    )
