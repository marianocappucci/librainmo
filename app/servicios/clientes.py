"""Los clientes del motor que el dominio referencia: inquilinos, propietarios y garantes."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errores import Invalido
from app.models.motor import clients


def nombres(sesion: Session, ids) -> dict[int, str]:
    ids = {i for i in ids if i is not None}
    if not ids:
        return {}
    return {fila.id: fila.name for fila in sesion.execute(select(clients.c.id, clients.c.name)
                                                          .where(clients.c.id.in_(ids)))}


def exigir(sesion: Session, cliente_id: int, rol: str) -> None:
    """El cliente tiene que existir: la FK lo frenaría igual, pero con un 500 y no con un mensaje."""
    if not nombres(sesion, [cliente_id]):
        raise Invalido(f"El {rol} elegido no existe en Clientes.")
