"""Los códigos correlativos del dominio: `P-000001` para propiedades, `C-000001` para contratos."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session


def siguiente(sesion: Session, columna, prefijo: str) -> str:
    """El próximo código después del mayor que existe. Lo protege el índice único de la columna: dos altas a la vez
    chocan ahí y el segundo pedido falla en vez de repetir el número."""
    ultimo = sesion.scalar(select(func.max(columna)).where(columna.like(f"{prefijo}%")))
    numero = int(ultimo.removeprefix(prefijo)) + 1 if ultimo else 1
    return f"{prefijo}{numero:06d}"
