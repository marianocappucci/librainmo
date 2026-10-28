"""Los gastos por cuenta del propietario y la liquidación al propietario."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, CheckConstraint, Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, ConTiempos, en_lista
from app.models.contratos import MONEDAS
from app.models.motor import cc_asientos, clients

CATEGORIAS_GASTO = ("reparacion", "expensas_extraordinarias", "impuesto", "servicio", "honorarios", "otro")
#: `deudora`: el neto dio negativo y la deuda pasa a la próxima liquidación del propietario, que la absorbe como un
#: ítem `saldo` y la deja `saldada` (ADR-011).
ESTADOS_LIQUIDACION = ("emitida", "pagada", "deudora", "saldada", "anulada")
TIPOS_ITEM = ("cobro", "gasto", "saldo")


class Gasto(ConTiempos, Base):
    """Lo que la inmobiliaria pagó con la plata del propietario: una reparación, un impuesto. Se reparte entre los
    titulares de la propiedad por su porcentaje y es un cargo (debe) en la cuenta de cada uno.

    Lo carga alguien a mano, o lo genera la cuota del mes: un concepto del contrato que paga el propietario y tiene
    importe fijo (`cuota_id` y `concepto_id` dicen de cuál salió, y anular la cuota lo anula)."""

    __tablename__ = "gastos"
    __table_args__ = (
        CheckConstraint(en_lista("categoria", CATEGORIAS_GASTO), name="categoria"),
        CheckConstraint("importe > 0", name="importe"),
        CheckConstraint(en_lista("moneda", MONEDAS), name="moneda"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    propiedad_id: Mapped[int] = mapped_column(ForeignKey("propiedades.id", ondelete="RESTRICT"), nullable=False,
                                              index=True)
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    categoria: Mapped[str] = mapped_column(String(30), nullable=False)
    descripcion: Mapped[str] = mapped_column(String(200), nullable=False)
    importe: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    #: La del importe y la de los cargos en la cuenta de los titulares (ADR-088 del motor): un gasto en dólares se
    #: descuenta de la liquidación en dólares.
    moneda: Mapped[str] = mapped_column(String(3), nullable=False, default="ARS")
    #: Si lo generó la cuota del mes, de qué cuota y de qué concepto del contrato.
    cuota_id: Mapped[int | None] = mapped_column(ForeignKey("cuotas.id", ondelete="RESTRICT"), index=True)
    concepto_id: Mapped[int | None] = mapped_column(ForeignKey("contrato_conceptos.id", ondelete="RESTRICT"))
    #: El comprobante del proveedor (número de factura, recibo), como texto.
    comprobante: Mapped[str | None] = mapped_column(String(80))
    anulado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    usuario: Mapped[str] = mapped_column(String(150), nullable=False, default="Sistema")

    imputaciones: Mapped[list[GastoImputacion]] = relationship(cascade="all, delete-orphan",
                                                               order_by="GastoImputacion.id")


class GastoImputacion(Base):
    __tablename__ = "gasto_imputaciones"
    __table_args__ = (CheckConstraint("importe > 0", name="importe"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    gasto_id: Mapped[int] = mapped_column(ForeignKey("gastos.id", ondelete="CASCADE"), nullable=False, index=True)
    propietario_id: Mapped[int] = mapped_column(BigInteger, ForeignKey(clients.c.id, ondelete="RESTRICT"),
                                                nullable=False, index=True)
    importe: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    asiento_id: Mapped[int] = mapped_column(BigInteger, ForeignKey(cc_asientos.c.id, ondelete="RESTRICT"),
                                            nullable=False)


class Liquidacion(ConTiempos, Base):
    """Lo que se le rinde a un propietario: lo cobrado a su favor, menos los gastos, menos la comisión."""

    __tablename__ = "liquidaciones"
    __table_args__ = (
        CheckConstraint(en_lista("estado", ESTADOS_LIQUIDACION), name="estado"),
        # Neto negativo sólo en una `deudora` (o en la `saldada` que fue deudora); una para pagar no baja de cero.
        CheckConstraint("neto >= 0 OR estado IN ('deudora', 'saldada', 'anulada')", name="neto"),
        CheckConstraint("saldo_anterior <= 0", name="saldo_anterior"),
        CheckConstraint(en_lista("moneda", MONEDAS), name="moneda"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    #: `L-000001`, correlativo y único.
    numero: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    propietario_id: Mapped[int] = mapped_column(BigInteger, ForeignKey(clients.c.id, ondelete="RESTRICT"),
                                                nullable=False, index=True)
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    #: Entran los movimientos hasta esta fecha que no estaban en otra liquidación.
    hasta: Mapped[date] = mapped_column(Date, nullable=False)
    #: 🔑 Una liquidación es de **una** moneda: lo cobrado de los contratos en esa moneda y los gastos en esa moneda.
    #: Un propietario con contratos en pesos y en dólares recibe dos.
    moneda: Mapped[str] = mapped_column(String(3), nullable=False, default="ARS")
    cobrado: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    gastos: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    comision: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    #: La deuda de liquidaciones anteriores que absorbe esta (cero o negativa). `neto` ya la descuenta.
    saldo_anterior: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    neto: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="emitida", index=True)
    asiento_comision_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey(cc_asientos.c.id,
                                                                                 ondelete="RESTRICT"))
    asiento_pago_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey(cc_asientos.c.id, ondelete="RESTRICT"))
    fecha_pago: Mapped[date | None] = mapped_column(Date)
    medio_pago: Mapped[str | None] = mapped_column(String(30))
    referencia_pago: Mapped[str | None] = mapped_column(String(120))
    observaciones: Mapped[str | None] = mapped_column(Text)
    usuario: Mapped[str] = mapped_column(String(150), nullable=False, default="Sistema")

    items: Mapped[list[LiquidacionItem]] = relationship(cascade="all, delete-orphan", order_by="LiquidacionItem.id",
                                                        foreign_keys="LiquidacionItem.liquidacion_id")


class LiquidacionItem(Base):
    """Un movimiento de la cuenta del propietario que entró en la liquidación. Un asiento se liquida una sola vez.

    El ítem `saldo` no tiene asiento: es la deuda de una liquidación `deudora` anterior (`liquidacion_origen_id`), que
    ya está en el libro como la diferencia entre sus haberes y sus cargos (ADR-011)."""

    __tablename__ = "liquidacion_items"
    __table_args__ = (
        CheckConstraint(en_lista("tipo", TIPOS_ITEM), name="tipo"),
        CheckConstraint("(tipo = 'saldo') = (asiento_id IS NULL) AND (tipo = 'saldo') = "
                        "(liquidacion_origen_id IS NOT NULL)", name="saldo"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    liquidacion_id: Mapped[int] = mapped_column(ForeignKey("liquidaciones.id", ondelete="CASCADE"), nullable=False,
                                                index=True)
    #: 🔑 Único: es lo que impide liquidar dos veces el mismo cobro o el mismo gasto.
    asiento_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey(cc_asientos.c.id, ondelete="RESTRICT"),
                                                   unique=True)
    #: 🔑 Único: una deuda se arrastra una sola vez.
    liquidacion_origen_id: Mapped[int | None] = mapped_column(ForeignKey("liquidaciones.id", ondelete="RESTRICT"),
                                                              unique=True)
    tipo: Mapped[str] = mapped_column(String(10), nullable=False)
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    descripcion: Mapped[str] = mapped_column(String(200), nullable=False)
    #: Positivo lo cobrado a favor del propietario, negativo lo que se le descuenta.
    importe: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    #: La parte del alquiler cobrado sobre la que se calcula la comisión, y con qué porcentaje.
    base_comision: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    comision_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal("0"))
