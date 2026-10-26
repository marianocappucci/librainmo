"""El cobro de una cuota y a qué cuenta de propietario fue cada parte."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, CheckConstraint, Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, ConTiempos, en_lista
from app.models.motor import cc_asientos, clients, recibos

TIPOS_IMPUTACION = ("alquiler", "concepto", "punitorio")


class Cobro(ConTiempos, Base):
    """Lo que pagó el inquilino por una cuota: la cuota entera más el punitorio, si pagó tarde.

    Deja tres huellas en el libro del motor, en la misma transacción: el haber del inquilino (con su recibo), el debe
    del punitorio (si lo hubo) y un haber en la cuenta de cada propietario por su parte (`CobroImputacion`).
    """

    __tablename__ = "cobros"
    __table_args__ = (
        CheckConstraint("importe_cuota > 0", name="importe_cuota"),
        CheckConstraint("punitorio >= 0", name="punitorio"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cuota_id: Mapped[int] = mapped_column(ForeignKey("cuotas.id", ondelete="RESTRICT"), nullable=False, index=True)
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    importe_cuota: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    punitorio: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    #: El punitorio que correspondía y se perdonó (queda la constancia de cuánto era).
    punitorio_condonado: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    dias_de_atraso: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    #: Los medios con que pagó: `[{medio_pago, referencia, monto}]`, como texto JSON.
    medios: Mapped[str] = mapped_column(Text, nullable=False)
    asiento_id: Mapped[int] = mapped_column(BigInteger, ForeignKey(cc_asientos.c.id, ondelete="RESTRICT"),
                                            nullable=False)
    asiento_punitorio_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey(cc_asientos.c.id, ondelete="RESTRICT"))
    recibo_id: Mapped[int] = mapped_column(BigInteger, ForeignKey(recibos.c.id, ondelete="RESTRICT"), nullable=False)
    anulado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    motivo_anulacion: Mapped[str | None] = mapped_column(Text)
    usuario: Mapped[str] = mapped_column(String(150), nullable=False, default="Sistema")

    imputaciones: Mapped[list[CobroImputacion]] = relationship(cascade="all, delete-orphan",
                                                               order_by="CobroImputacion.id")


class CobroImputacion(Base):
    """La parte de un propietario en un cobro, por tipo: el alquiler es la base de la comisión de administración."""

    __tablename__ = "cobro_imputaciones"
    __table_args__ = (
        CheckConstraint(en_lista("tipo", TIPOS_IMPUTACION), name="tipo"),
        CheckConstraint("importe > 0", name="importe"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cobro_id: Mapped[int] = mapped_column(ForeignKey("cobros.id", ondelete="CASCADE"), nullable=False, index=True)
    propietario_id: Mapped[int] = mapped_column(BigInteger, ForeignKey(clients.c.id, ondelete="RESTRICT"),
                                                nullable=False, index=True)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    importe: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    #: El haber en la cuenta del propietario (y, al anular el cobro, su contraasiento lo revierte).
    asiento_id: Mapped[int] = mapped_column(BigInteger, ForeignKey(cc_asientos.c.id, ondelete="RESTRICT"),
                                            nullable=False)
