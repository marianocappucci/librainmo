"""Los gastos por cuenta del propietario: lo que la inmobiliaria pagó con su plata (una reparación, un impuesto).

Se reparte entre los titulares de la propiedad por su porcentaje (al centavo, como el cobro) y es un cargo (debe) en
la cuenta de cada uno, en la misma transacción. Se descuenta en la próxima liquidación **de su moneda**. Anular
contraasienta, y no se puede si ya entró en una liquidación.

Un gasto también lo genera la cuota del mes (`servicios/cuotas.py`): el de un concepto del contrato que paga el
propietario con importe fijo. Ese no se anula suelto: se anula con su cuota.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errores import Conflicto, Invalido, NoEncontrado
from app.models.contratos import MONEDAS
from app.models.liquidaciones import CATEGORIAS_GASTO, Gasto, GastoImputacion, LiquidacionItem
from app.models.propiedades import Propiedad
from app.servicios import clientes, cuentas
from app.servicios.cobros import repartir
from app.servicios.montos import texto


def a_dict(sesion: Session, g: Gasto) -> dict:
    p = sesion.get(Propiedad, g.propiedad_id)
    nombres = clientes.nombres(sesion, [x.propietario_id for x in g.imputaciones])
    return {"id": g.id, "propiedad_id": g.propiedad_id, "propiedad_codigo": p.codigo,
            "propiedad_direccion": " ".join(x for x in (p.direccion, p.unidad or "") if x), "fecha": g.fecha,
            "categoria": g.categoria, "descripcion": g.descripcion, "importe": texto(g.importe), "moneda": g.moneda,
            "comprobante": g.comprobante, "anulado": g.anulado, "usuario": g.usuario, "cuota_id": g.cuota_id,
            "concepto_id": g.concepto_id,
            "imputaciones": [{"propietario_id": x.propietario_id, "propietario_nombre": nombres.get(x.propietario_id),
                              "importe": texto(x.importe)} for x in g.imputaciones]}


def registrar(sesion: Session, *, propiedad_id: int, fecha: date, categoria: str, descripcion: str, importe,
              moneda: str = "ARS", comprobante: str | None = None, usuario: str) -> dict:
    g = nuevo(sesion, propiedad_id=propiedad_id, fecha=fecha, categoria=categoria, descripcion=descripcion,
              importe=importe, moneda=moneda, comprobante=comprobante, usuario=usuario)
    sesion.commit()
    return a_dict(sesion, g)


def nuevo(sesion: Session, *, propiedad_id: int, fecha: date, categoria: str, descripcion: str, importe, moneda: str,
          comprobante: str | None = None, usuario: str, cuota_id: int | None = None,
          concepto_id: int | None = None) -> Gasto:
    """El gasto con sus cargos, **sin `commit`**: lo usa la generación de cuotas, que lo escribe junto con la cuota."""
    p = sesion.get(Propiedad, propiedad_id)
    if p is None:
        raise Invalido("La propiedad elegida no existe.")
    if categoria not in CATEGORIAS_GASTO:
        raise Invalido(f"Categoría inválida: {categoria}")
    if moneda not in MONEDAS:
        raise Invalido(f"Moneda inválida: {moneda}")
    if not (descripcion or "").strip():
        raise Invalido("El gasto lleva descripción.")
    importe = Decimal(str(importe))
    if importe <= 0:
        raise Invalido("El importe tiene que ser mayor que cero.")
    titulares = [(t.cliente_id, t.porcentaje) for t in p.titulares]
    if sum((x[1] for x in titulares), Decimal(0)) != Decimal(100):
        raise Conflicto("La propiedad no tiene sus titulares completos: no hay a quién cargarle el gasto.")
    g = Gasto(propiedad_id=p.id, fecha=fecha, categoria=categoria, descripcion=descripcion.strip(), importe=importe,
              moneda=moneda, comprobante=(comprobante or "").strip() or None, usuario=usuario, cuota_id=cuota_id,
              concepto_id=concepto_id)
    for propietario_id, parte in repartir(importe, titulares):
        if parte <= 0:
            continue
        a = cuentas.asentar(sesion, fecha=fecha, tercero_id=propietario_id, rol=cuentas.PROPIETARIO,
                            concepto=f"Gasto {p.codigo}: {g.descripcion}", debe=parte, moneda=moneda)
        g.imputaciones.append(GastoImputacion(propietario_id=propietario_id, importe=parte, asiento_id=a))
    sesion.add(g)
    return g


def _obtener(sesion: Session, gasto_id: int) -> Gasto:
    g = sesion.get(Gasto, gasto_id)
    if g is None:
        raise NoEncontrado("El gasto no existe.")
    return g


def obtener(sesion: Session, gasto_id: int) -> dict:
    return a_dict(sesion, _obtener(sesion, gasto_id))


def buscar(sesion: Session, *, propiedad_id: int | None = None, desde: date | None = None, hasta: date | None = None,
           incluir_anulados: bool = False, limit: int = 100, offset: int = 0) -> list[dict]:
    consulta = select(Gasto).order_by(Gasto.fecha.desc(), Gasto.id.desc())
    if propiedad_id:
        consulta = consulta.where(Gasto.propiedad_id == propiedad_id)
    if desde:
        consulta = consulta.where(Gasto.fecha >= desde)
    if hasta:
        consulta = consulta.where(Gasto.fecha <= hasta)
    if not incluir_anulados:
        consulta = consulta.where(Gasto.anulado.is_(False))
    return [a_dict(sesion, g) for g in sesion.scalars(consulta.limit(limit).offset(offset))]


def anular(sesion: Session, gasto_id: int, *, motivo: str) -> dict:
    g = _obtener(sesion, gasto_id)
    if g.cuota_id is not None:
        raise Conflicto("Este gasto lo generó la cuota del mes por un concepto del contrato: se anula con la cuota.")
    anular_sin_confirmar(sesion, g, motivo=motivo)
    sesion.commit()
    return a_dict(sesion, g)


def anular_sin_confirmar(sesion: Session, g: Gasto, *, motivo: str) -> None:
    """Contraasienta el gasto **sin `commit`**: lo usa también la anulación de la cuota que lo generó."""
    if g.anulado:
        raise Conflicto("El gasto ya está anulado.")
    if not (motivo or "").strip():
        raise Invalido("Anular un gasto pide un motivo.")
    asientos = [x.asiento_id for x in g.imputaciones]
    if sesion.scalar(select(LiquidacionItem.id).where(LiquidacionItem.asiento_id.in_(asientos))):
        raise Conflicto("El gasto ya está en una liquidación: anulá primero la liquidación.")
    for asiento in asientos:
        cuentas.contraasentar(sesion, asiento, concepto=f"Anulación del gasto {g.id}: {motivo.strip()}")
    g.anulado = True
