from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, Field


class PropiedadEntrada(BaseModel):
    tipo: str
    direccion: str = Field(min_length=1, max_length=255)
    unidad: str | None = Field(default=None, max_length=50)
    localidad: str = Field(default="", max_length=120)
    partida_abl: str | None = Field(default=None, max_length=50)
    partida_arba: str | None = Field(default=None, max_length=50)
    estado: str = "disponible"
    observaciones: str | None = None


class PropiedadCambio(BaseModel):
    tipo: str | None = None
    direccion: str | None = Field(default=None, min_length=1, max_length=255)
    unidad: str | None = Field(default=None, max_length=50)
    localidad: str | None = Field(default=None, max_length=120)
    partida_abl: str | None = Field(default=None, max_length=50)
    partida_arba: str | None = Field(default=None, max_length=50)
    estado: str | None = None
    observaciones: str | None = None


class TitularEntrada(BaseModel):
    cliente_id: int
    porcentaje: Decimal = Field(gt=0, le=100, decimal_places=2)
