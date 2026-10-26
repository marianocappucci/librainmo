from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field


class ContratoEntrada(BaseModel):
    propiedad_id: int
    inquilino_id: int
    fecha_inicio: date
    fecha_fin: date
    importe_inicial: Decimal = Field(gt=0, decimal_places=2)
    moneda: str = "ARS"
    dia_vencimiento: int = Field(default=10, ge=1, le=31)
    dias_gracia: int = Field(default=0, ge=0)
    metodo_ajuste: str = "fijo"
    indice_ajuste: str | None = None
    porcentaje_ajuste: Decimal | None = Field(default=None, decimal_places=3)
    periodicidad_ajuste: str | None = None
    punitorio_tasa: Decimal | None = Field(default=None, ge=0, decimal_places=4)
    punitorio_base: str = "diaria"
    punitorio_para: str = "inmobiliaria"
    comision_pct: Decimal = Field(default=Decimal("0"), ge=0, le=100, decimal_places=2)
    deposito: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    observaciones: str | None = None


class ContratoCambio(BaseModel):
    propiedad_id: int | None = None
    inquilino_id: int | None = None
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    importe_inicial: Decimal | None = Field(default=None, gt=0, decimal_places=2)
    moneda: str | None = None
    dia_vencimiento: int | None = Field(default=None, ge=1, le=31)
    dias_gracia: int | None = Field(default=None, ge=0)
    metodo_ajuste: str | None = None
    indice_ajuste: str | None = None
    porcentaje_ajuste: Decimal | None = Field(default=None, decimal_places=3)
    periodicidad_ajuste: str | None = None
    punitorio_tasa: Decimal | None = Field(default=None, ge=0, decimal_places=4)
    punitorio_base: str | None = None
    punitorio_para: str | None = None
    comision_pct: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=2)
    deposito: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    observaciones: str | None = None


class RescisionEntrada(BaseModel):
    fecha: date
    observaciones: str | None = None


class PrecioEntrada(BaseModel):
    importe: Decimal = Field(gt=0, decimal_places=2)
    vigencia_desde: date


class GarantiaEntrada(BaseModel):
    tipo: str
    garante_id: int | None = None
    descripcion: str | None = None
    vence: date | None = None


class ConceptoEntrada(BaseModel):
    concepto: str
    descripcion: str = Field(default="", max_length=120)
    paga: str
    importe: Decimal | None = Field(default=None, decimal_places=2)
    activo: bool = True


class ConceptoCambio(BaseModel):
    descripcion: str | None = Field(default=None, max_length=120)
    paga: str | None = None
    importe: Decimal | None = Field(default=None, decimal_places=2)
    activo: bool | None = None
