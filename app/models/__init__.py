"""Los modelos del dominio de LibraInmo.

La `Base` trae la convención de nombres de constraints y el reloj. Cada tabla entra con su
revisión en `migrations/versions/`. Las tablas del motor que el dominio referencia
(`clients`) están en una `MetaData` aparte (`app/models/motor.py`).

🔴 **Tampoco hay `ModuloRow`.** Acá la tabla `modulos` no es del dominio:
el schema de `libracore` (que vive en la misma base, ADR-002) ya trae la suya, con otra
forma (`id`, `modulo` único, `habilitado` entero), y dos tablas con el mismo nombre no
caben en un schema. `app/modulos.py` lee y escribe la del motor.
"""

from app.models.base import Base
from app.models.cobros import Cobro, CobroImputacion
from app.models.contratos import ConceptoContrato, Contrato, ContratoPrecio, Garantia
from app.models.cuotas import Cuota, CuotaLinea
from app.models.propiedades import Propiedad, Titular

__all__ = [
    "Base",
    "Cobro",
    "CobroImputacion",
    "ConceptoContrato",
    "Contrato",
    "ContratoPrecio",
    "Cuota",
    "CuotaLinea",
    "Garantia",
    "Propiedad",
    "Titular",
]
