"""Los modelos del dominio de LibraInmo.

Hoy no hay ninguno: el esqueleto sólo trae la `Base` (con la convención de nombres de
constraints) y el reloj. Las tablas de propiedades, titulares y contratos entran con la
fase 1 del `ROADMAP.md`, cada una con su revisión en `migrations/versions/`.

🔴 **Tampoco hay `ModuloRow`.** En LibraView la tabla `modulos` es del dominio; acá no:
el schema de `libracore` (que vive en la misma base, ADR-002) ya trae la suya, con otra
forma (`id`, `modulo` único, `habilitado` entero), y dos tablas con el mismo nombre no
caben en un schema. `app/modulos.py` lee y escribe la del motor.
"""

from app.models.base import Base

__all__ = ["Base"]
