from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field


class GenerarEntrada(BaseModel):
    ancla: date
    contrato_ids: list[int] | None = None
    #: `{concepto_id: importe}` para los conceptos variables (las expensas de ese mes).
    variables: dict[int, Decimal] = Field(default_factory=dict)


class LineaEntrada(BaseModel):
    importe: Decimal = Field(gt=0, decimal_places=2)
    concepto_id: int | None = None
    descripcion: str | None = Field(default=None, max_length=160)


class AnulacionEntrada(BaseModel):
    motivo: str = Field(min_length=1, max_length=300)


class AjusteEntrada(BaseModel):
    fecha_ajuste: date
