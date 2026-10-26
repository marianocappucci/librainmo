"""Propiedades y titulares.

🔑 **Los titulares se reemplazan juntos y suman 100.** Cargarlos de a uno deja estados intermedios (60 % de dueño)
que la liquidación no sabría repartir; por eso `fijar_titulares` recibe la lista entera y la valida antes de escribir.
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.errores import Conflicto, Invalido, NoEncontrado
from app.models.contratos import Contrato
from app.models.propiedades import ESTADOS_PROPIEDAD, TIPOS_PROPIEDAD, Propiedad, Titular
from app.servicios import clientes, numeracion
from app.servicios.montos import texto

CIEN = Decimal("100")


def _a_dict(sesion: Session, p: Propiedad) -> dict:
    nombres = clientes.nombres(sesion, [t.cliente_id for t in p.titulares])
    vigente = sesion.scalar(select(Contrato).where(Contrato.propiedad_id == p.id, Contrato.estado == "vigente"))
    return {
        "id": p.id, "codigo": p.codigo, "tipo": p.tipo, "direccion": p.direccion, "unidad": p.unidad,
        "localidad": p.localidad, "partida_abl": p.partida_abl, "partida_arba": p.partida_arba, "estado": p.estado,
        "observaciones": p.observaciones,
        "titulares": [{"cliente_id": t.cliente_id, "nombre": nombres.get(t.cliente_id, ""),
                       "porcentaje": texto(t.porcentaje)} for t in p.titulares],
        "titulares_completos": sum((t.porcentaje for t in p.titulares), Decimal(0)) == CIEN,
        "contrato_vigente": ({"id": vigente.id, "numero": vigente.numero} if vigente else None),
    }


def _obtener(sesion: Session, propiedad_id: int) -> Propiedad:
    p = sesion.get(Propiedad, propiedad_id)
    if p is None:
        raise NoEncontrado("La propiedad no existe.")
    return p


def _validar(datos: dict) -> None:
    if datos.get("tipo") is not None and datos["tipo"] not in TIPOS_PROPIEDAD:
        raise Invalido(f"Tipo de propiedad inválido: {datos['tipo']}")
    if datos.get("estado") is not None and datos["estado"] not in ESTADOS_PROPIEDAD:
        raise Invalido(f"Estado inválido: {datos['estado']}")
    if "direccion" in datos and not (datos["direccion"] or "").strip():
        raise Invalido("La dirección es obligatoria.")


def buscar(sesion: Session, *, q: str | None = None, estado: str | None = None, limit: int = 50,
           offset: int = 0) -> list[dict]:
    consulta = select(Propiedad).order_by(Propiedad.codigo)
    if estado:
        consulta = consulta.where(Propiedad.estado == estado)
    if q:
        patron = f"%{q.strip()}%"
        consulta = consulta.where(or_(Propiedad.direccion.ilike(patron), Propiedad.codigo.ilike(patron),
                                      Propiedad.localidad.ilike(patron), Propiedad.unidad.ilike(patron)))
    return [_a_dict(sesion, p) for p in sesion.scalars(consulta.limit(limit).offset(offset))]


def obtener(sesion: Session, propiedad_id: int) -> dict:
    return _a_dict(sesion, _obtener(sesion, propiedad_id))


def crear(sesion: Session, datos: dict) -> dict:
    _validar(datos)
    if datos.get("estado") == "alquilada":
        raise Invalido("Una propiedad pasa a «alquilada» cuando se activa su contrato.")
    p = Propiedad(codigo=numeracion.siguiente(sesion, Propiedad.codigo, "P-"), **datos)
    sesion.add(p)
    sesion.commit()
    return _a_dict(sesion, p)


def actualizar(sesion: Session, propiedad_id: int, datos: dict) -> dict:
    _validar(datos)
    p = _obtener(sesion, propiedad_id)
    nuevo_estado = datos.get("estado", p.estado)
    con_contrato = sesion.scalar(select(Contrato.id).where(Contrato.propiedad_id == p.id,
                                                            Contrato.estado == "vigente"))
    if nuevo_estado != p.estado and (con_contrato or nuevo_estado == "alquilada"):
        raise Conflicto("El estado «alquilada» lo pone y lo saca el contrato vigente.")
    for campo, valor in datos.items():
        setattr(p, campo, valor)
    sesion.commit()
    return _a_dict(sesion, p)


def fijar_titulares(sesion: Session, propiedad_id: int, titulares: list[dict]) -> dict:
    """Reemplaza los titulares. Suman 100 y ninguno se repite; una lista vacía no es válida."""
    p = _obtener(sesion, propiedad_id)
    if not titulares:
        raise Invalido("La propiedad tiene que tener al menos un titular.")
    ids = [t["cliente_id"] for t in titulares]
    if len(set(ids)) != len(ids):
        raise Invalido("Un titular aparece dos veces.")
    total = sum((Decimal(str(t["porcentaje"])) for t in titulares), Decimal(0))
    if total != CIEN:
        raise Invalido(f"Los porcentajes de los titulares suman {total} y tienen que sumar 100.")
    for t in titulares:
        clientes.exigir(sesion, t["cliente_id"], "titular")
    p.titulares.clear()
    sesion.flush()
    for t in titulares:
        p.titulares.append(Titular(cliente_id=t["cliente_id"], porcentaje=Decimal(str(t["porcentaje"]))))
    sesion.commit()
    return _a_dict(sesion, p)
