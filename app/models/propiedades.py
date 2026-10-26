"""Las propiedades que administra la inmobiliaria y sus titulares."""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, ConTiempos, en_lista
from app.models.motor import clients

TIPOS_PROPIEDAD = ("departamento", "casa", "ph", "local", "oficina", "cochera", "terreno", "galpon", "otro")

#: `alquilada` la pone el contrato al pasar a vigente, y la saca al terminar: no se elige a mano mientras haya uno
#: vigente (`servicios/contratos.py`).
ESTADOS_PROPIEDAD = ("disponible", "alquilada", "en_venta", "reservada", "vendida", "baja")


class Propiedad(ConTiempos, Base):
    __tablename__ = "propiedades"
    __table_args__ = (
        CheckConstraint(en_lista("tipo", TIPOS_PROPIEDAD), name="tipo"),
        CheckConstraint(en_lista("estado", ESTADOS_PROPIEDAD), name="estado"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    #: `P-000001`, correlativo y único. Es lo que se busca y lo que va en la liquidación.
    codigo: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    direccion: Mapped[str] = mapped_column(String(255), nullable=False)
    #: Piso y departamento, o lo que identifique la unidad dentro de la dirección.
    unidad: Mapped[str | None] = mapped_column(String(50))
    localidad: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    partida_abl: Mapped[str | None] = mapped_column(String(50))
    partida_arba: Mapped[str | None] = mapped_column(String(50))
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="disponible")
    observaciones: Mapped[str | None] = mapped_column(Text)

    titulares: Mapped[list[Titular]] = relationship(
        back_populates="propiedad", cascade="all, delete-orphan", order_by="Titular.id"
    )


class Titular(Base):
    """Un dueño de la propiedad y su parte. Un condominio liquida a cada titular su porcentaje."""

    __tablename__ = "propiedad_titulares"
    __table_args__ = (
        UniqueConstraint("propiedad_id", "cliente_id"),
        CheckConstraint("porcentaje > 0 AND porcentaje <= 100", name="porcentaje"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    propiedad_id: Mapped[int] = mapped_column(ForeignKey("propiedades.id", ondelete="CASCADE"), nullable=False,
                                              index=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey(clients.c.id, ondelete="RESTRICT"), nullable=False,
                                            index=True)
    porcentaje: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)

    propiedad: Mapped[Propiedad] = relationship(back_populates="titulares")
