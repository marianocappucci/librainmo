"""El contrato de locación: quién alquila qué, cuánto, cómo se ajusta y qué más se cobra."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, ConTiempos, _ahora, en_lista
from app.models.motor import clients

#: `borrador` se edita entero; `vigente` es el que devenga y se cobra; los otros dos son finales.
ESTADOS_CONTRATO = ("borrador", "vigente", "rescindido", "finalizado")
ESTADOS_CERRADOS = ("rescindido", "finalizado")
MONEDAS = ("ARS", "USD")
#: Desde el DNU 70/2023 cada contrato pacta su ajuste: sin ajuste, un porcentaje fijo cada tanto, o un índice
#: oficial del motor (`libracore.indices_ajuste`).
METODOS_AJUSTE = ("fijo", "porcentaje", "indice")
PERIODICIDADES = ("mensual", "bimestral", "trimestral", "semestral", "anual")
BASES_PUNITORIO = ("diaria", "mensual")
#: A quién va el punitorio que paga el inquilino atrasado. Es una cláusula del contrato.
DESTINOS_PUNITORIO = ("inmobiliaria", "propietario")

TIPOS_GARANTIA = ("propietaria", "caucion", "recibo_sueldo", "otra")
TIPOS_CONCEPTO = ("expensas", "abl", "seguro", "servicio", "otro")
#: Quién paga el concepto: el inquilino (se suma a su cuota) o el propietario (se le descuenta en la liquidación).
PAGADORES = ("inquilino", "propietario")


class Contrato(ConTiempos, Base):
    __tablename__ = "contratos"
    __table_args__ = (
        CheckConstraint(en_lista("estado", ESTADOS_CONTRATO), name="estado"),
        CheckConstraint(en_lista("moneda", MONEDAS), name="moneda"),
        CheckConstraint(en_lista("metodo_ajuste", METODOS_AJUSTE), name="metodo_ajuste"),
        CheckConstraint(en_lista("punitorio_base", BASES_PUNITORIO), name="punitorio_base"),
        CheckConstraint(en_lista("punitorio_para", DESTINOS_PUNITORIO), name="punitorio_para"),
        CheckConstraint("fecha_fin >= fecha_inicio", name="fechas"),
        CheckConstraint("dia_vencimiento BETWEEN 1 AND 31", name="dia_vencimiento"),
        CheckConstraint("dias_gracia >= 0", name="dias_gracia"),
        CheckConstraint("comision_pct >= 0 AND comision_pct <= 100", name="comision"),
        CheckConstraint("metodo_ajuste <> 'indice' OR (indice_ajuste IS NOT NULL AND periodicidad_ajuste IS NOT NULL)",
                        name="ajuste_por_indice"),
        CheckConstraint(
            "metodo_ajuste <> 'porcentaje' OR (porcentaje_ajuste IS NOT NULL AND periodicidad_ajuste IS NOT NULL)",
            name="ajuste_por_porcentaje"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    #: `C-000001`, correlativo y único.
    numero: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    propiedad_id: Mapped[int] = mapped_column(ForeignKey("propiedades.id", ondelete="RESTRICT"), nullable=False,
                                              index=True)
    inquilino_id: Mapped[int] = mapped_column(ForeignKey(clients.c.id, ondelete="RESTRICT"), nullable=False,
                                              index=True)
    fecha_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_fin: Mapped[date] = mapped_column(Date, nullable=False)
    moneda: Mapped[str] = mapped_column(String(3), nullable=False, default="ARS")
    dia_vencimiento: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    dias_gracia: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    metodo_ajuste: Mapped[str] = mapped_column(String(20), nullable=False, default="fijo")
    #: Una clave de `libracore.indices_ajuste.INDICES`. La valida el servicio, no un CHECK: el catálogo es del motor.
    indice_ajuste: Mapped[str | None] = mapped_column(String(30))
    porcentaje_ajuste: Mapped[Decimal | None] = mapped_column(Numeric(7, 3))
    #: Cada cuánto se ajusta, contado desde `fecha_inicio` (`libracore.periodos.periodo_anclado`).
    periodicidad_ajuste: Mapped[str | None] = mapped_column(String(20))

    #: En porcentaje: `0.5` es 0,5 %. `None` = sin punitorio pactado.
    punitorio_tasa: Mapped[Decimal | None] = mapped_column(Numeric(7, 4))
    punitorio_base: Mapped[str] = mapped_column(String(10), nullable=False, default="diaria")
    punitorio_para: Mapped[str] = mapped_column(String(20), nullable=False, default="inmobiliaria")

    #: La comisión de administración de la inmobiliaria, en porcentaje de lo cobrado del alquiler.
    comision_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal("0"))
    deposito: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="borrador", index=True)
    fecha_rescision: Mapped[date | None] = mapped_column(Date)
    observaciones: Mapped[str | None] = mapped_column(Text)

    precios: Mapped[list[ContratoPrecio]] = relationship(
        back_populates="contrato", cascade="all, delete-orphan", order_by="ContratoPrecio.vigencia_desde"
    )
    garantias: Mapped[list[Garantia]] = relationship(cascade="all, delete-orphan", order_by="Garantia.id")
    conceptos: Mapped[list[ConceptoContrato]] = relationship(cascade="all, delete-orphan",
                                                             order_by="ConceptoContrato.id")


class ContratoPrecio(Base):
    """El alquiler con vigencia, la forma de `contratos_precios` de LibraDesk.

    Un precio nuevo cierra el vigente el día antes y abre el suyo: rehacer una cuota vieja da el precio que regía
    entonces. **El importe no se edita**: se actualiza con vigencia.
    """

    __tablename__ = "contrato_precios"
    __table_args__ = (
        UniqueConstraint("contrato_id", "vigencia_desde"),
        CheckConstraint("importe > 0", name="importe"),
        CheckConstraint("vigencia_hasta IS NULL OR vigencia_hasta >= vigencia_desde", name="vigencia"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    contrato_id: Mapped[int] = mapped_column(ForeignKey("contratos.id", ondelete="CASCADE"), nullable=False,
                                             index=True)
    vigencia_desde: Mapped[date] = mapped_column(Date, nullable=False)
    vigencia_hasta: Mapped[date | None] = mapped_column(Date)
    importe: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    #: `inicial`, `manual`, `ajuste_porcentaje` o `ajuste_indice:<clave>`.
    motivo: Mapped[str] = mapped_column(String(50), nullable=False, default="inicial")
    usuario: Mapped[str] = mapped_column(String(150), nullable=False, default="Sistema")
    creado_en: Mapped[object] = mapped_column(DateTime(timezone=True), default=_ahora, nullable=False)

    contrato: Mapped[Contrato] = relationship(back_populates="precios")


class Garantia(Base):
    __tablename__ = "contrato_garantias"
    __table_args__ = (CheckConstraint(en_lista("tipo", TIPOS_GARANTIA), name="tipo"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    contrato_id: Mapped[int] = mapped_column(ForeignKey("contratos.id", ondelete="CASCADE"), nullable=False,
                                             index=True)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    #: El garante, si es una persona (propietaria, recibo de sueldo). Una caución no tiene garante del padrón.
    garante_id: Mapped[int | None] = mapped_column(ForeignKey(clients.c.id, ondelete="RESTRICT"), index=True)
    descripcion: Mapped[str | None] = mapped_column(Text)
    vence: Mapped[date | None] = mapped_column(Date)


class ConceptoContrato(Base):
    """Lo que se cobra o se descuenta además del alquiler: expensas, ABL, seguro, servicios."""

    __tablename__ = "contrato_conceptos"
    __table_args__ = (
        CheckConstraint(en_lista("concepto", TIPOS_CONCEPTO), name="concepto"),
        CheckConstraint(en_lista("paga", PAGADORES), name="paga"),
        CheckConstraint("importe IS NULL OR importe > 0", name="importe"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    contrato_id: Mapped[int] = mapped_column(ForeignKey("contratos.id", ondelete="CASCADE"), nullable=False,
                                             index=True)
    concepto: Mapped[str] = mapped_column(String(20), nullable=False)
    descripcion: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    paga: Mapped[str] = mapped_column(String(20), nullable=False)
    #: Fijo por mes. `None` = variable: se carga el importe de cada mes al generar la cuota (las expensas).
    importe: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
