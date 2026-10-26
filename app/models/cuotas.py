"""El devengado mensual de un contrato: la cuota y sus líneas."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, CheckConstraint, Date, ForeignKey, Index, Integer, Numeric, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, ConTiempos, en_lista
from app.models.motor import cc_asientos

#: `pendiente` se puede cobrar o anular; `cobrada` y `anulada` son finales.
ESTADOS_CUOTA = ("pendiente", "cobrada", "anulada")
TIPOS_LINEA = ("alquiler", "concepto")


class Cuota(ConTiempos, Base):
    """Este contrato, este mes, este importe. **No es un comprobante**: es el cargo en la cuenta del inquilino.

    El importe del alquiler se **congela** al generarla (`precio_id` dice con qué precio salió): si después se
    actualiza el precio con retroactivo, la cuota emitida no se mueve. Mismo criterio que las cuotas de LibraDesk.
    """

    __tablename__ = "cuotas"
    __table_args__ = (
        CheckConstraint(en_lista("estado", ESTADOS_CUOTA), name="estado"),
        CheckConstraint("periodo_hasta >= periodo_desde", name="periodo"),
        CheckConstraint("total > 0", name="total"),
        # 🔑 La idempotencia: un contrato tiene una sola cuota viva por mes. Las anuladas no cuentan, así anular
        # deja volver a generar el mes.
        Index("uq_cuotas_contrato_periodo_viva", "contrato_id", "periodo_desde", unique=True,
              postgresql_where=text("estado <> 'anulada'")),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    contrato_id: Mapped[int] = mapped_column(ForeignKey("contratos.id", ondelete="RESTRICT"), nullable=False,
                                             index=True)
    periodo_desde: Mapped[date] = mapped_column(Date, nullable=False)
    periodo_hasta: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_emision: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_vencimiento: Mapped[date] = mapped_column(Date, nullable=False)
    prorrateada: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    dias_cubiertos: Mapped[int] = mapped_column(Integer, nullable=False)
    dias_del_periodo: Mapped[int] = mapped_column(Integer, nullable=False)
    precio_id: Mapped[int] = mapped_column(ForeignKey("contrato_precios.id", ondelete="RESTRICT"), nullable=False)
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="pendiente", index=True)
    #: El cargo en la cuenta del inquilino (debe), en el libro del motor.
    asiento_id: Mapped[int] = mapped_column(BigInteger, ForeignKey(cc_asientos.c.id, ondelete="RESTRICT"),
                                            nullable=False)

    lineas: Mapped[list[CuotaLinea]] = relationship(cascade="all, delete-orphan", order_by="CuotaLinea.id")


class CuotaLinea(Base):
    __tablename__ = "cuota_lineas"
    __table_args__ = (
        CheckConstraint(en_lista("tipo", TIPOS_LINEA), name="tipo"),
        CheckConstraint("importe > 0", name="importe"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cuota_id: Mapped[int] = mapped_column(ForeignKey("cuotas.id", ondelete="CASCADE"), nullable=False, index=True)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    concepto_id: Mapped[int | None] = mapped_column(ForeignKey("contrato_conceptos.id", ondelete="RESTRICT"))
    descripcion: Mapped[str] = mapped_column(String(160), nullable=False)
    importe: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
