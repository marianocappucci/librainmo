"""La liquidación al propietario: lo cobrado a su favor, menos los gastos, menos la comisión de administración.

## Las decisiones

1. **Entra todo lo que no estaba en otra liquidación**, hasta una fecha: las imputaciones de cobros y de gastos de
   ese propietario. Un asiento se liquida **una sola vez** (`liquidacion_items.asiento_id` es único).
2. **La comisión es por contrato**: su `comision_pct` sobre la parte de **alquiler** cobrado (no sobre los conceptos
   ni el punitorio), redondeada por ítem. 🔸 Se toma con IVA incluido: si la inmobiliaria es responsable inscripta y
   la comisión lleva IVA aparte, es una decisión a cerrar con su contador antes de facturarla.
3. **La comisión es un cargo en la cuenta del propietario**, y el pago del neto otro: después de pagar, la cuenta
   queda en cero por lo liquidado.
4. **Con neto negativo se emite `deudora`** (ADR-011, decisión del humano del 2026-10-28): lo que el propietario le
   debe a la inmobiliaria **se arrastra a su próxima liquidación** en esa moneda, que lo descuenta como un ítem
   `saldo` (sin asiento: la deuda ya está en el libro) y la deja `saldada`. Una deudora no se paga.
5. **Anular** una liquidación emitida o deudora (no pagada ni saldada) contraasienta la comisión y libera sus
   movimientos para otra; si había absorbido la deuda de otra, esa vuelve a quedar `deudora`.
6. 🔑 **Una liquidación es de una moneda** (ADR-088 del motor): entran los cobros de los contratos en esa moneda y los
   gastos en esa moneda, y la comisión y el pago se asientan en ella. Un propietario con contratos en pesos y en
   dólares recibe dos liquidaciones; la previsualización dice en qué monedas tiene movimientos sin liquidar.
"""

from __future__ import annotations

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from libracore import medios_pago
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errores import Conflicto, Invalido, NoEncontrado
from app.models.cobros import Cobro, CobroImputacion
from app.models.contratos import MONEDAS, Contrato
from app.models.cuotas import Cuota
from app.models.liquidaciones import Gasto, GastoImputacion, Liquidacion, LiquidacionItem
from app.servicios import clientes, cuentas, numeracion
from app.servicios.cuotas import nombre_del_mes
from app.servicios.montos import texto

_CENTAVO = Decimal("0.01")
CERO = Decimal("0.00")
MEDIOS_DE_PAGO = ("transferencia", "efectivo", "cheque")


def _liquidados(sesion: Session) -> select:
    # 🔴 Sin los ítems `saldo` (asiento nulo): un NULL adentro de `NOT IN` deja afuera a todo.
    return select(LiquidacionItem.asiento_id).where(LiquidacionItem.asiento_id.is_not(None))


def _moneda(moneda: str) -> str:
    if moneda not in MONEDAS:
        raise Invalido(f"Moneda inválida: {moneda}")
    return moneda


def _pendientes(sesion: Session, propietario_id: int, hasta: date, moneda: str | None) -> list[dict]:
    """Lo que no está en otra liquidación, de `moneda` (o de todas, para saber qué monedas tienen pendientes)."""
    items = []
    cobros = (
        select(CobroImputacion, Cobro, Cuota, Contrato)
        .join(Cobro, Cobro.id == CobroImputacion.cobro_id)
        .join(Cuota, Cuota.id == Cobro.cuota_id)
        .join(Contrato, Contrato.id == Cuota.contrato_id)
        .where(CobroImputacion.propietario_id == propietario_id, Cobro.anulado.is_(False), Cobro.fecha <= hasta,
               CobroImputacion.asiento_id.not_in(_liquidados(sesion))))
    if moneda:
        cobros = cobros.where(Contrato.moneda == moneda)
    cobros = sesion.execute(cobros
        .order_by(Cobro.fecha, CobroImputacion.id))
    for imp, cobro, cuota, contrato in cobros:
        es_alquiler = imp.tipo == "alquiler"
        items.append({"asiento_id": imp.asiento_id, "tipo": "cobro", "fecha": cobro.fecha,
                      "descripcion": f"{imp.tipo.capitalize()} {nombre_del_mes(cuota.periodo_desde)} "
                                     f"{contrato.numero} (cobrado el {cobro.fecha.strftime('%d-%m-%Y')})",
                      "importe": imp.importe, "base_comision": imp.importe if es_alquiler else CERO,
                      "comision_pct": contrato.comision_pct if es_alquiler else CERO, "moneda": contrato.moneda})
    gastos = (
        select(GastoImputacion, Gasto)
        .join(Gasto, Gasto.id == GastoImputacion.gasto_id)
        .where(GastoImputacion.propietario_id == propietario_id, Gasto.anulado.is_(False), Gasto.fecha <= hasta,
               GastoImputacion.asiento_id.not_in(_liquidados(sesion))))
    if moneda:
        gastos = gastos.where(Gasto.moneda == moneda)
    for imp, gasto in sesion.execute(gastos.order_by(Gasto.fecha, GastoImputacion.id)):
        items.append({"asiento_id": imp.asiento_id, "tipo": "gasto", "fecha": gasto.fecha,
                      "descripcion": f"Gasto: {gasto.descripcion}", "importe": -imp.importe, "base_comision": CERO,
                      "comision_pct": CERO, "moneda": gasto.moneda})
    deudoras = select(Liquidacion).where(Liquidacion.propietario_id == propietario_id,
                                         Liquidacion.estado == "deudora", Liquidacion.fecha <= hasta)
    if moneda:
        deudoras = deudoras.where(Liquidacion.moneda == moneda)
    for liq in sesion.scalars(deudoras.order_by(Liquidacion.numero)):
        items.append({"asiento_id": None, "liquidacion_origen_id": liq.id, "tipo": "saldo", "fecha": liq.fecha,
                      "descripcion": f"Saldo deudor de la liquidación {liq.numero}", "importe": liq.neto,
                      "base_comision": CERO, "comision_pct": CERO, "moneda": liq.moneda})
    return items


def _comision(item: dict) -> Decimal:
    return (item["base_comision"] * item["comision_pct"] / 100).quantize(_CENTAVO, rounding=ROUND_HALF_UP)


def _totales(items: list[dict]) -> dict:
    movimientos = [x for x in items if x["tipo"] != "saldo"]
    cobrado = sum((x["importe"] for x in movimientos if x["importe"] > 0), Decimal(0))
    gastos = -sum((x["importe"] for x in movimientos if x["importe"] < 0), Decimal(0))
    comision = sum((_comision(x) for x in movimientos), Decimal(0))
    saldo_anterior = sum((x["importe"] for x in items if x["tipo"] == "saldo"), Decimal(0))
    return {"cobrado": cobrado, "gastos": gastos, "comision": comision, "saldo_anterior": saldo_anterior,
            "neto": cobrado - gastos - comision + saldo_anterior}


def _item_json(x: dict) -> dict:
    return {**{k: v for k, v in x.items() if k != "moneda"}, "importe": texto(x["importe"]),
            "base_comision": texto(x["base_comision"]), "comision_pct": texto(x["comision_pct"]),
            "comision": texto(_comision(x))}


def _sin_moneda(x: dict) -> dict:
    return {k: v for k, v in x.items() if k != "moneda"}


def previsualizar(sesion: Session, propietario_id: int, *, hasta: date, moneda: str = "ARS") -> dict:
    """Lo que entraría en la liquidación en `moneda`, **sin escribir nada**. `monedas_con_pendientes` dice en qué
    monedas tiene movimientos sin liquidar, para que la pantalla ofrezca la otra."""
    clientes.exigir(sesion, propietario_id, "propietario")
    moneda = _moneda(moneda)
    todas = _pendientes(sesion, propietario_id, hasta, None)
    items = [x for x in todas if x["moneda"] == moneda]
    t = _totales(items)
    return {"propietario_id": propietario_id, "propietario_nombre": clientes.nombres(sesion, [propietario_id])
            .get(propietario_id), "hasta": hasta, "moneda": moneda, "items": [_item_json(x) for x in items],
            "monedas_con_pendientes": [m for m in MONEDAS if any(x["moneda"] == m for x in todas)],
            **{k: texto(v) for k, v in t.items()}}


def _saldada_por(sesion: Session, liq: Liquidacion) -> dict | None:
    """La liquidación que absorbió la deuda de esta, si es una `saldada`."""
    if liq.estado != "saldada":
        return None
    otra = sesion.scalar(select(Liquidacion).join(LiquidacionItem, LiquidacionItem.liquidacion_id == Liquidacion.id)
                         .where(LiquidacionItem.liquidacion_origen_id == liq.id))
    return {"id": otra.id, "numero": otra.numero} if otra else None


def a_dict(sesion: Session, liq: Liquidacion) -> dict:
    return {"id": liq.id, "numero": liq.numero, "propietario_id": liq.propietario_id,
            "propietario_nombre": clientes.nombres(sesion, [liq.propietario_id]).get(liq.propietario_id),
            "fecha": liq.fecha, "hasta": liq.hasta, "moneda": liq.moneda, "cobrado": texto(liq.cobrado),
            "gastos": texto(liq.gastos), "saldo_anterior": texto(liq.saldo_anterior),
            "comision": texto(liq.comision), "neto": texto(liq.neto), "estado": liq.estado,
            "saldada_por": _saldada_por(sesion, liq),
            "fecha_pago": liq.fecha_pago, "medio_pago": liq.medio_pago, "referencia_pago": liq.referencia_pago,
            "observaciones": liq.observaciones, "usuario": liq.usuario,
            "items": [{"asiento_id": x.asiento_id, "liquidacion_origen_id": x.liquidacion_origen_id, "tipo": x.tipo,
                       "fecha": x.fecha, "descripcion": x.descripcion,
                       "importe": texto(x.importe), "base_comision": texto(x.base_comision),
                       "comision_pct": texto(x.comision_pct),
                       "comision": texto((x.base_comision * x.comision_pct / 100).quantize(_CENTAVO,
                                                                                           rounding=ROUND_HALF_UP))}
                      for x in liq.items]}


def emitir(sesion: Session, propietario_id: int, *, fecha: date, hasta: date, moneda: str = "ARS",
           observaciones: str | None = None, usuario: str) -> dict:
    if hasta > fecha:
        raise Invalido("No se liquida lo que todavía no pasó: «hasta» no puede ser posterior a la fecha.")
    clientes.exigir(sesion, propietario_id, "propietario")
    moneda = _moneda(moneda)
    items = _pendientes(sesion, propietario_id, hasta, moneda)
    if not any(x["tipo"] != "saldo" for x in items):
        raise Conflicto(f"No hay movimientos sin liquidar en {moneda} para este propietario.")
    t = _totales(items)
    liq = Liquidacion(numero=numeracion.siguiente(sesion, Liquidacion.numero, "L-"), propietario_id=propietario_id,
                      fecha=fecha, hasta=hasta, moneda=moneda, cobrado=t["cobrado"], gastos=t["gastos"],
                      comision=t["comision"], saldo_anterior=t["saldo_anterior"], neto=t["neto"],
                      estado="deudora" if t["neto"] < 0 else "emitida", observaciones=observaciones,
                      usuario=usuario)
    liq.items = [LiquidacionItem(**_sin_moneda(x)) for x in items]
    for x in items:
        if x["tipo"] == "saldo":
            sesion.get(Liquidacion, x["liquidacion_origen_id"]).estado = "saldada"
    if t["comision"] > 0:
        liq.asiento_comision_id = cuentas.asentar(
            sesion, fecha=fecha, tercero_id=propietario_id, rol=cuentas.PROPIETARIO,
            concepto=f"Comisión de administración {liq.numero}", debe=t["comision"], moneda=moneda)
    sesion.add(liq)
    sesion.commit()
    return a_dict(sesion, liq)


def _obtener(sesion: Session, liquidacion_id: int) -> Liquidacion:
    liq = sesion.get(Liquidacion, liquidacion_id)
    if liq is None:
        raise NoEncontrado("La liquidación no existe.")
    return liq


def obtener(sesion: Session, liquidacion_id: int) -> dict:
    return a_dict(sesion, _obtener(sesion, liquidacion_id))


def buscar(sesion: Session, *, propietario_id: int | None = None, estado: str | None = None,
           moneda: str | None = None, limit: int = 100, offset: int = 0) -> list[dict]:
    consulta = select(Liquidacion).order_by(Liquidacion.numero.desc())
    if propietario_id:
        consulta = consulta.where(Liquidacion.propietario_id == propietario_id)
    if moneda:
        consulta = consulta.where(Liquidacion.moneda == _moneda(moneda))
    if estado:
        consulta = consulta.where(Liquidacion.estado == estado)
    return [a_dict(sesion, x) for x in sesion.scalars(consulta.limit(limit).offset(offset))]


def pagar(sesion: Session, liquidacion_id: int, *, fecha: date, medio_pago: str, referencia: str | None = None) -> dict:
    """La transferencia (o el pago) del neto al propietario: un cargo en su cuenta por el neto."""
    liq = _obtener(sesion, liquidacion_id)
    if liq.estado == "deudora":
        raise Conflicto("La liquidación tiene saldo deudor: no se paga, se descuenta en la próxima del propietario.")
    if liq.estado != "emitida":
        raise Conflicto(f"La liquidación está {liq.estado}.")
    if medio_pago not in MEDIOS_DE_PAGO:
        raise Invalido(f"Medio de pago inválido: {medio_pago} (se paga con {', '.join(MEDIOS_DE_PAGO)}).")
    if fecha < liq.fecha:
        raise Invalido("El pago no puede ser anterior a la liquidación.")
    if liq.neto > 0:
        liq.asiento_pago_id = cuentas.asentar(
            sesion, fecha=fecha, tercero_id=liq.propietario_id, rol=cuentas.PROPIETARIO,
            concepto=f"Pago de la liquidación {liq.numero} ({medios_pago.label(medio_pago)})", debe=liq.neto,
            moneda=liq.moneda)
    liq.estado, liq.fecha_pago, liq.medio_pago = "pagada", fecha, medio_pago
    liq.referencia_pago = (referencia or "").strip() or None
    sesion.commit()
    return a_dict(sesion, liq)


def anular(sesion: Session, liquidacion_id: int, *, motivo: str) -> dict:
    liq = _obtener(sesion, liquidacion_id)
    if liq.estado == "saldada":
        raise Conflicto("La deuda de esta liquidación ya la descontó otra: anulá primero esa.")
    if liq.estado not in ("emitida", "deudora"):
        raise Conflicto(f"La liquidación está {liq.estado}: sólo se anula una emitida sin pagar.")
    if not (motivo or "").strip():
        raise Invalido("Anular una liquidación pide un motivo.")
    if liq.asiento_comision_id:
        cuentas.contraasentar(sesion, liq.asiento_comision_id,
                              concepto=f"Anulación de la liquidación {liq.numero}: {motivo.strip()}")
    for x in liq.items:
        if x.liquidacion_origen_id:
            sesion.get(Liquidacion, x.liquidacion_origen_id).estado = "deudora"
    liq.items.clear()
    liq.estado = "anulada"
    liq.observaciones = "\n".join(x for x in (liq.observaciones, f"Anulada: {motivo.strip()}") if x)
    sesion.commit()
    return a_dict(sesion, liq)


def fondos_de_terceros(sesion: Session) -> dict:
    """🔑 El control del dueño: cuánto se les debe a los propietarios (tiene que estar en la cuenta de la inmobiliaria)
    y cuánto deben los inquilinos. Saldo del libro = debe − haber: a un propietario se le debe cuando es negativo.

    **Por moneda** (ADR-088 del motor): cada fila dice la suya, y los totales van uno por moneda —los dólares de los
    propietarios tienen que estar en dólares, no sumados a los pesos—."""
    from libracore.db import libro_de_terceros as libro

    conn = cuentas._conexion(sesion)
    propietarios = [x for x in libro.saldos(cuentas.PROPIETARIO, conn=conn) if Decimal(str(x["saldo"])) != 0]
    inquilinos = [x for x in libro.saldos(cuentas.INQUILINO, conn=conn) if Decimal(str(x["saldo"])) != 0]
    nombres = clientes.nombres(sesion, [x["tercero_id"] for x in propietarios + inquilinos])

    def fila(x, signo):
        return {"tercero_id": x["tercero_id"], "nombre": nombres.get(x["tercero_id"]), "moneda": x["moneda"],
                "saldo": texto(Decimal(str(x["saldo"])) * signo)}

    def total(filas, moneda):
        return texto(sum((Decimal(x["saldo"]) for x in filas if x["moneda"] == moneda), Decimal(0)))

    a_pagar = [fila(x, -1) for x in propietarios]
    deudores = [fila(x, 1) for x in inquilinos]
    con_movimientos = [m for m in MONEDAS if any(x["moneda"] == m for x in a_pagar + deudores)] or ["ARS"]
    return {"a_pagar_a_propietarios": a_pagar, "inquilinos_deudores": deudores,
            "totales": [{"moneda": m, "a_pagar": total(a_pagar, m), "adeudado": total(deudores, m)}
                        for m in con_movimientos]}
