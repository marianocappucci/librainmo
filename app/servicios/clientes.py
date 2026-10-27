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


def impide_desactivar(sesion: Session, cliente_id: int) -> str | None:
    """Por qué no se da de baja a este cliente, o `None`. Es el gancho `impide_desactivar` del router de clientes del
    motor: lo que vive en las tablas del dominio y el motor no ve. Un inquilino o garante de un contrato abierto
    (borrador o vigente) y un titular de una propiedad que no está dada de baja siguen siendo parte de algo vivo."""
    from app.models.contratos import ESTADOS_CERRADOS, Contrato, Garantia
    from app.models.propiedades import Propiedad, Titular

    abiertos = Contrato.estado.not_in(ESTADOS_CERRADOS)
    numero = sesion.scalar(select(Contrato.numero).where(Contrato.inquilino_id == cliente_id, abiertos)
                           .order_by(Contrato.numero))
    if numero:
        return f"es el inquilino del contrato {numero}, que sigue abierto."
    numero = sesion.scalar(select(Contrato.numero).join(Garantia, Garantia.contrato_id == Contrato.id)
                           .where(Garantia.garante_id == cliente_id, abiertos).order_by(Contrato.numero))
    if numero:
        return f"es garante del contrato {numero}, que sigue abierto."
    codigo = sesion.scalar(select(Propiedad.codigo).join(Titular, Titular.propiedad_id == Propiedad.id)
                           .where(Titular.cliente_id == cliente_id, Propiedad.estado != "baja")
                           .order_by(Propiedad.codigo))
    if codigo:
        return f"es titular de la propiedad {codigo}."
    return None

