"""Los importes y porcentajes salen de la API como **texto decimal**, no como número de JSON.

FastAPI convierte un `Decimal` en `float`, y un `float` no tiene centavos exactos: `0.1 + 0.2` no es `0.3`. La plata
de terceros que maneja una inmobiliaria no puede depender de eso, así que toda salida pasa por acá y la pantalla
formatea el texto.
"""

from __future__ import annotations

from decimal import Decimal


def texto(valor: Decimal | None, decimales: int = 2) -> str | None:
    """Con la escala de la columna (`Numeric(14, 2)` da dos), así un valor recién cargado y uno releído de la base
    salen iguales: `Decimal("450000")` y `Decimal("450000.00")` son el mismo importe."""
    if valor is None:
        return None
    return format(Decimal(valor).quantize(Decimal(1).scaleb(-decimales)), "f")
