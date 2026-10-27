from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field


class GastoEntrada(BaseModel):
    propiedad_id: int
    fecha: date
    categoria: str
    descripcion: str = Field(min_length=1, max_length=200)
    importe: Decimal = Field(gt=0, decimal_places=2)
    moneda: str = "ARS"
    comprobante: str | None = Field(default=None, max_length=80)


class MotivoEntrada(BaseModel):
    motivo: str = Field(min_length=1, max_length=300)


class LiquidacionEntrada(BaseModel):
    propietario_id: int
    fecha: date
    hasta: date
    moneda: str = "ARS"
    observaciones: str | None = None


class PagoEntrada(BaseModel):
    fecha: date
    medio_pago: str
    referencia: str | None = Field(default=None, max_length=120)
