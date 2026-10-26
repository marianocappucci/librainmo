"""Los errores de validación de la API (el 422 de FastAPI), en español.

La forma no cambia —`{"detail": [{"loc", "msg", "type", ...}]}`, que es lo que lee la pantalla (`mensajeDeError` en
`frontend/src/lib/api.ts`)—: sólo el `msg`, que pydantic arma en inglés («Input should be greater than 0»). Se
traducen los tipos que estas entradas pueden dar; uno que no esté acá sale como vino.
"""

from __future__ import annotations

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


def _mensaje(e: dict) -> str:
    ctx = e.get("ctx") or {}
    tipo = e.get("type", "")
    return {
        "missing": "Falta este dato.",
        "greater_than": f"Tiene que ser mayor que {ctx.get('gt')}.",
        "greater_than_equal": f"Tiene que ser {ctx.get('ge')} o más.",
        "less_than": f"Tiene que ser menor que {ctx.get('lt')}.",
        "less_than_equal": f"Tiene que ser {ctx.get('le')} o menos.",
        "string_too_short": "No puede quedar vacío." if ctx.get("min_length") == 1
        else f"Tiene que tener al menos {ctx.get('min_length')} caracteres.",
        "string_too_long": f"Tiene que tener {ctx.get('max_length')} caracteres o menos.",
        "too_short": f"Tiene que tener al menos {ctx.get('min_length')} elemento(s).",
        "decimal_parsing": "No es un número.",
        "decimal_max_places": f"Admite hasta {ctx.get('decimal_places')} decimales.",
        "int_parsing": "Tiene que ser un número entero.",
        "date_from_datetime_parsing": "No es una fecha válida.",
        "date_parsing": "No es una fecha válida.",
        "bool_parsing": "Tiene que ser sí o no.",
        "json_invalid": "El cuerpo del pedido no es JSON válido.",
    }.get(tipo, e.get("msg", ""))


async def errores_en_espanol(_request: Request, exc: RequestValidationError) -> JSONResponse:
    detalle = []
    for e in exc.errors():
        item = {k: v for k, v in e.items() if k in ("type", "loc", "msg", "input")}
        item["msg"] = _mensaje(e)
        if isinstance(item.get("input"), bytes | bytearray):
            item.pop("input")
        detalle.append(item)
    return JSONResponse({"detail": detalle}, status_code=422)
