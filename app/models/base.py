"""Base declarativa y utilidades comunes de los modelos."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, MetaData
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app import tiempo

#: Nombres de constraints predecibles: las migraciones escritas a mano y las
#: que genere Alembic usan los mismos, y un `DROP CONSTRAINT` no depende de un
#: nombre que puso PostgreSQL.
CONVENCION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=CONVENCION)


def en_lista(columna: str, valores) -> str:
    """El texto de un `CHECK (columna IN (...))` a partir de un enum de strings."""
    return f"{columna} IN ({', '.join(repr(str(v)) for v in valores)})"


def _ahora() -> datetime:
    return tiempo.ahora()


class ConTiempos:
    """`creado_en` / `actualizado_en`, siempre `timestamptz`, con la hora de
    Argentina del motor (`libracore.fechas`)."""

    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_ahora, nullable=False)
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_ahora, onupdate=_ahora, nullable=False
    )
