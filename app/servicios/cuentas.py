"""Las cuentas corrientes del inquilino y del propietario, en el libro de terceros del motor (ADR-026 del motor).

Se escribe **sólo** por acá, y siempre con la conexión de la sesión (`conn=`): el asiento entra y sale junto con su
documento (la cuota, el cobro, el gasto, la liquidación). Mismo patrón que `app/servicios/cuentas.py` de LibraCargo.
El tercero de cada asiento es un `clients.id` del motor; el rol dice de qué cuenta es.

🔑 **Cada asiento lleva la moneda de su documento** (ADR-088 del motor): la del contrato para la cuota y el cobro, la
del gasto, la de la liquidación. Un inquilino con un contrato en dólares tiene su cuenta en dólares aparte.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from libracore.db import libro_de_terceros as libro
from libracore.db.migraciones import conexion_libracore
from sqlalchemy.orm import Session

INQUILINO = "inquilino"
PROPIETARIO = "propietario"
CERO = Decimal("0.00")


def _conexion(sesion: Session):
    sesion.flush()
    return conexion_libracore(sesion.connection())


def asentar(sesion: Session, *, fecha: date, tercero_id: int, rol: str, concepto: str, moneda: str,
            debe: Decimal = CERO, haber: Decimal = CERO, descripcion: str | None = None) -> int:
    """Escribe un asiento y devuelve su id. No hace `commit`: lo hace el servicio que lo llama, con su documento.
    `moneda` es obligatoria a propósito: un asiento sin moneda sería en pesos sin que nadie lo haya decidido."""
    return libro.asentar(tercero_id, rol, fecha.isoformat(), concepto, debe=debe, haber=haber,
                         descripcion=descripcion, moneda=moneda, conn=_conexion(sesion))


def corregir(sesion: Session, asiento_id: int, **campos) -> None:
    """Cambia el asiento en el lugar: lo que se hace al editar el documento que lo originó (agregar un cargo a una
    cuota pendiente cambia su total)."""
    libro.corregir(asiento_id, conn=_conexion(sesion), **campos)


def contraasentar(sesion: Session, asiento_id: int, *, concepto: str, fecha: date | None = None) -> int:
    """Revierte un asiento con otro de columnas invertidas: el original queda, y la cuenta impresa antes se puede
    reconstruir."""
    return libro.contraasentar(asiento_id, fecha=fecha.isoformat() if fecha else None, concepto=concepto,
                               conn=_conexion(sesion))


def saldo(sesion: Session, tercero_id: int, rol: str, *, moneda: str, hasta: date | None = None) -> Decimal:
    valor = libro.saldo(tercero_id, rol, hasta=hasta.isoformat() if hasta else None, moneda=moneda,
                        conn=_conexion(sesion))
    return Decimal(str(valor)).quantize(CERO)


def extracto(sesion: Session, tercero_id: int, rol: str, *, moneda: str, desde: date | None = None,
             hasta: date | None = None) -> dict:
    return libro.extracto(tercero_id, rol, desde=desde.isoformat() if desde else None,
                          hasta=hasta.isoformat() if hasta else None, moneda=moneda, conn=_conexion(sesion))
