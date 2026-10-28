from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field


class MedioEntrada(BaseModel):
    medio_pago: str
    referencia: str | None = Field(default=None, max_length=120)
    monto: Decimal = Field(gt=0, decimal_places=2)


class CobroEntrada(BaseModel):
    fecha: date
    medios: list[MedioEntrada] = Field(min_length=1)
    condonar_punitorio: bool = False
    #: Un pago a cuenta (ADR-010). Sin él se cobra todo lo que se debe de la cuota.
    importe: Decimal | None = Field(default=None, gt=0, decimal_places=2)


class AnularCobroEntrada(BaseModel):
    motivo: str = Field(min_length=1, max_length=300)
