"""Huso horario y formato de fecha del ecosistema.

Argentina, UTC-3 fijo, sin horario de verano. El reloj es el de LibraCore
(`libracore.fechas`, ADR-070): **una sola fuente** para «hoy» y «ahora», que un
test fija pisando `libracore.fechas._ahora_utc`. Se consulta el módulo en cada
llamada (no se importa la función) justamente para que ese parche se vea.

La base guarda `timestamptz`; el formato `dd-mm-aaaa` es sólo de presentación.
Las APIs hablan ISO 8601.
"""

from __future__ import annotations

from datetime import date, datetime

from libracore import fechas
from libracore.fechas import ZONA_AR


def ahora() -> datetime:
    """Momento actual con zona (UTC-3)."""
    return fechas.ahora()


def hoy() -> date:
    """El día de hoy en Argentina."""
    return fechas.hoy()


def a_local(valor: datetime) -> datetime:
    """El mismo instante expresado en hora de Argentina.

    Un datetime sin zona se toma como **hora argentina** (no UTC): es lo que
    escribe una persona en un formulario. Es lo contrario del criterio de
    LibraClub, que lo lee de la base; acá las columnas son siempre `timestamptz`
    y psycopg devuelve datetimes con zona, así que el caso naive sólo ocurre en
    la entrada de la API.
    """
    if valor.tzinfo is None:
        return valor.replace(tzinfo=ZONA_AR)
    return valor.astimezone(ZONA_AR)


def formatear_fecha(valor: date | None) -> str:
    """`dd-mm-aaaa`. Presentación únicamente: las APIs siguen en ISO 8601."""
    return valor.strftime("%d-%m-%Y") if valor else ""


def formatear_fecha_hora(valor: datetime | None) -> str:
    """`dd-mm-aaaa HH:MM`, reloj de 24 h, en hora local."""
    if valor is None:
        return ""
    return a_local(valor).strftime("%d-%m-%Y %H:%M")
