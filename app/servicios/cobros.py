"""El cobro de una cuota: punitorio, reparto entre titulares, recibo y anulación.

## Las decisiones

1. **Se cobra la cuota entera** (más el punitorio). El pago parcial queda para después: repartir un pago a cuenta
   entre alquiler, conceptos y titulares pide reglas de imputación que la inmobiliaria todavía no dijo.
2. **El punitorio es la cuenta del motor** (`libracore.mora.calcular_punitorio`): interés simple sobre la cuota, desde
   el vencimiento, con los días de gracia del contrato y el vencimiento corrido al día hábil siguiente. Se puede
   **condonar**, y queda la constancia de cuánto era.
3. **La inmobiliaria cobra como mandataria**: el haber del inquilino es por el total, y a la cuenta de cada titular va
   su parte del alquiler y de los conceptos, según su porcentaje. El punitorio va al propietario sólo si el contrato
   lo dice (`punitorio_para`); si no, es de la inmobiliaria y no pasa por la cuenta de nadie.
4. **El reparto cierra al centavo**: cada parte se redondea HALF_UP y el último titular se lleva la diferencia.
5. **El recibo es del motor** (`libracore.recibos.emitir_recibo_de_asiento`, ADR-087), «por cuenta y orden de» los
   titulares, en la misma transacción que los asientos.
6. **Anular un cobro** contraasienta todo, anula el recibo y deja la cuota otra vez pendiente, en una sola transacción
   (`anular_recibo(conn=)`, libracore v1.197.1).
"""

from __future__ import annotations

import json
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from libracore import medios_pago, mora, recibos
from libracore.db import recibos as db_recibos
from libracore.db.migraciones import conexion_libracore
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errores import Conflicto, Invalido, NoEncontrado
from app.models.cobros import Cobro, CobroImputacion
from app.models.contratos import Contrato
from app.models.cuotas import Cuota
from app.models.propiedades import Propiedad
from app.servicios import clientes, cuentas
from app.servicios.cuotas import nombre_del_mes
from app.servicios.montos import texto

_CENTAVO = Decimal("0.01")
CERO = Decimal("0.00")

#: Con qué se puede pagar un alquiler. «Cuenta corriente» no: el cobro es justamente lo que salda la cuenta.
MEDIOS = tuple(m for m in medios_pago.ELEGIBLES if m != "cuenta_corriente")


def repartir(importe: Decimal, partes: list[tuple[int, Decimal]]) -> list[tuple[int, Decimal]]:
    """`importe` entre `partes` (`[(id, porcentaje)]`, que suman 100). Cierra al centavo: el último se lleva la
    diferencia del redondeo."""
    resultado, asignado = [], Decimal(0)
    for i, (clave, porcentaje) in enumerate(partes):
        if i == len(partes) - 1:
            monto = importe - asignado
        else:
            monto = (importe * porcentaje / 100).quantize(_CENTAVO, rounding=ROUND_HALF_UP)
            asignado += monto
        resultado.append((clave, monto))
    return resultado


def _cuota_pendiente(sesion: Session, cuota_id: int) -> tuple[Cuota, Contrato, Propiedad]:
    q = sesion.get(Cuota, cuota_id)
    if q is None:
        raise NoEncontrado("La cuota no existe.")
    if q.estado != "pendiente":
        raise Conflicto(f"La cuota está {q.estado}.")
    c = sesion.get(Contrato, q.contrato_id)
    return q, c, sesion.get(Propiedad, c.propiedad_id)


def punitorio(c: Contrato, q: Cuota, fecha: date) -> dict:
    """El punitorio de pagar `q` el día `fecha`, con su detalle. Sin tasa pactada, cero."""
    if not c.punitorio_tasa:
        return {"punitorio": CERO, "dias_de_atraso": max(0, (fecha - q.fecha_vencimiento).days), "detalle": None}
    d = mora.calcular_punitorio(q.total, q.fecha_vencimiento, fecha, c.punitorio_tasa, base=c.punitorio_base,
                                dias_gracia=c.dias_gracia)
    return {"punitorio": Decimal(d["punitorio"]), "dias_de_atraso": d["dias_de_atraso"], "detalle": d}


def proponer(sesion: Session, cuota_id: int, *, fecha: date) -> dict:
    """Cuánto hay que cobrar si paga el día `fecha`. **No escribe nada.**"""
    q, c, _ = _cuota_pendiente(sesion, cuota_id)
    p = punitorio(c, q, fecha)
    return {"cuota_id": q.id, "fecha": fecha, "importe_cuota": texto(q.total), "punitorio": texto(p["punitorio"]),
            "dias_de_atraso": p["dias_de_atraso"], "vencimiento": q.fecha_vencimiento,
            "vencimiento_efectivo": p["detalle"]["vencimiento_efectivo"] if p["detalle"] else q.fecha_vencimiento,
            "total": texto(q.total + p["punitorio"]), "punitorio_para": c.punitorio_para}


def _validar_medios(medios: list[dict], total: Decimal) -> list[dict]:
    if not medios:
        raise Invalido("Falta con qué pagó.")
    limpios = []
    for m in medios:
        if m["medio_pago"] not in MEDIOS:
            raise Invalido(f"Medio de pago inválido: {m['medio_pago']}")
        monto = Decimal(str(m["monto"])).quantize(_CENTAVO)
        if monto <= 0:
            raise Invalido("Cada medio de pago lleva un monto mayor que cero.")
        limpios.append({"medio_pago": m["medio_pago"], "referencia": (m.get("referencia") or "").strip(),
                        "monto": monto})
    suma = sum((m["monto"] for m in limpios), Decimal(0))
    if suma != total:
        raise Invalido(f"Los medios de pago suman {suma} y el cobro es de {total}.")
    return limpios


def cobrar(sesion: Session, cuota_id: int, *, fecha: date, medios: list[dict], condonar_punitorio: bool = False,
           usuario: str) -> dict:
    q, c, p = _cuota_pendiente(sesion, cuota_id)
    if fecha < q.fecha_emision:
        raise Invalido("No se cobra una cuota antes de emitirla.")
    titulares = [(t.cliente_id, t.porcentaje) for t in p.titulares]
    if sum((x[1] for x in titulares), Decimal(0)) != Decimal(100):
        raise Conflicto("La propiedad no tiene sus titulares completos: no hay a quién imputarle el cobro.")

    calculado = punitorio(c, q, fecha)
    cobrado = CERO if condonar_punitorio else calculado["punitorio"]
    total = q.total + cobrado
    limpios = _validar_medios(medios, total)

    mes = nombre_del_mes(q.periodo_desde)
    direccion = " ".join(x for x in (p.direccion, p.unidad or "") if x)
    asiento_punitorio = None
    if cobrado > 0:
        asiento_punitorio = cuentas.asentar(sesion, fecha=fecha, tercero_id=c.inquilino_id, rol=cuentas.INQUILINO,
                                            concepto=f"Punitorio cuota {mes} {c.numero}", debe=cobrado)
    asiento = cuentas.asentar(sesion, fecha=fecha, tercero_id=c.inquilino_id, rol=cuentas.INQUILINO,
                              concepto=f"Cobro cuota {mes} {c.numero}", haber=total)

    cobro = Cobro(cuota_id=q.id, fecha=fecha, importe_cuota=q.total, punitorio=cobrado,
                  punitorio_condonado=calculado["punitorio"] - cobrado, dias_de_atraso=calculado["dias_de_atraso"],
                  total=total, asiento_id=asiento, asiento_punitorio_id=asiento_punitorio,
                  medios=json.dumps([{**m, "monto": str(m["monto"])} for m in limpios], ensure_ascii=False),
                  recibo_id=0, usuario=usuario)
    por_tipo = {"alquiler": sum((x.importe for x in q.lineas if x.tipo == "alquiler"), Decimal(0)),
                "concepto": sum((x.importe for x in q.lineas if x.tipo == "concepto"), Decimal(0)),
                "punitorio": cobrado if c.punitorio_para == "propietario" else Decimal(0)}
    nombres = clientes.nombres(sesion, [x[0] for x in titulares])
    for tipo, importe in por_tipo.items():
        if importe <= 0:
            continue
        for propietario_id, parte in repartir(importe, titulares):
            if parte <= 0:
                continue
            a = cuentas.asentar(sesion, fecha=fecha, tercero_id=propietario_id, rol=cuentas.PROPIETARIO,
                                concepto=f"{tipo.capitalize()} cobrado {mes} {c.numero}", haber=parte)
            cobro.imputaciones.append(CobroImputacion(propietario_id=propietario_id, tipo=tipo, importe=parte,
                                                      asiento_id=a))

    recibo = recibos.emitir_recibo_de_asiento(
        asiento, pagos=[{"fecha": fecha.isoformat(), "medio_pago": m["medio_pago"], "referencia": m["referencia"],
                         "monto": float(m["monto"])} for m in limpios],
        concepto=f"Alquiler {mes}, {direccion} ({c.numero})"
                 + (f", con punitorio por {calculado['dias_de_atraso']} días" if cobrado > 0 else ""),
        por_cuenta_de=" y ".join(nombres.get(x[0], "") for x in titulares),
        conn=conexion_libracore(sesion.connection()))
    cobro.recibo_id = recibo["id"]
    q.estado = "cobrada"
    sesion.add(cobro)
    sesion.commit()
    return a_dict(sesion, cobro)


def a_dict(sesion: Session, cobro: Cobro) -> dict:
    q = sesion.get(Cuota, cobro.cuota_id)
    c = sesion.get(Contrato, q.contrato_id)
    recibo = db_recibos.get_recibo(cobro.recibo_id, conn=conexion_libracore(sesion.connection()))
    nombres = clientes.nombres(sesion, [c.inquilino_id, *(x.propietario_id for x in cobro.imputaciones)])
    return {
        "id": cobro.id, "cuota_id": q.id, "periodo_desde": q.periodo_desde, "contrato_id": c.id,
        "numero_contrato": c.numero, "inquilino_id": c.inquilino_id, "inquilino_nombre": nombres.get(c.inquilino_id),
        "fecha": cobro.fecha, "importe_cuota": texto(cobro.importe_cuota), "punitorio": texto(cobro.punitorio),
        "punitorio_condonado": texto(cobro.punitorio_condonado), "dias_de_atraso": cobro.dias_de_atraso,
        "total": texto(cobro.total), "medios": json.loads(cobro.medios), "anulado": cobro.anulado,
        "motivo_anulacion": cobro.motivo_anulacion, "usuario": cobro.usuario,
        "recibo": {"id": recibo["id"], "numero": recibo["numero"], "punto_venta": recibo["punto_venta"],
                   "concepto": recibo["concepto"], "anulado": recibo["anulado"]} if recibo else None,
        "imputaciones": [{"propietario_id": x.propietario_id, "propietario_nombre": nombres.get(x.propietario_id),
                          "tipo": x.tipo, "importe": texto(x.importe)} for x in cobro.imputaciones],
    }


def _obtener(sesion: Session, cobro_id: int) -> Cobro:
    cobro = sesion.get(Cobro, cobro_id)
    if cobro is None:
        raise NoEncontrado("El cobro no existe.")
    return cobro


def obtener(sesion: Session, cobro_id: int) -> dict:
    return a_dict(sesion, _obtener(sesion, cobro_id))


def buscar(sesion: Session, *, contrato_id: int | None = None, desde: date | None = None, hasta: date | None = None,
           incluir_anulados: bool = False, limit: int = 100, offset: int = 0) -> list[dict]:
    consulta = select(Cobro).join(Cuota, Cuota.id == Cobro.cuota_id).order_by(Cobro.fecha.desc(), Cobro.id.desc())
    if contrato_id:
        consulta = consulta.where(Cuota.contrato_id == contrato_id)
    if desde:
        consulta = consulta.where(Cobro.fecha >= desde)
    if hasta:
        consulta = consulta.where(Cobro.fecha <= hasta)
    if not incluir_anulados:
        consulta = consulta.where(Cobro.anulado.is_(False))
    return [a_dict(sesion, x) for x in sesion.scalars(consulta.limit(limit).offset(offset))]


def anular(sesion: Session, cobro_id: int, *, motivo: str, usuario: str) -> dict:
    cobro = _obtener(sesion, cobro_id)
    if cobro.anulado:
        raise Conflicto("El cobro ya está anulado.")
    if not (motivo or "").strip():
        raise Invalido("Anular un cobro pide un motivo.")
    from app.models.liquidaciones import LiquidacionItem

    asientos = [x.asiento_id for x in cobro.imputaciones]
    if asientos and sesion.scalar(select(LiquidacionItem.id).where(LiquidacionItem.asiento_id.in_(asientos))):
        raise Conflicto("El cobro ya está en una liquidación al propietario: anulá primero la liquidación.")
    q = sesion.get(Cuota, cobro.cuota_id)
    concepto = f"Anulación del cobro {cobro.id}: {motivo.strip()}"
    for asiento in [cobro.asiento_id, cobro.asiento_punitorio_id, *(x.asiento_id for x in cobro.imputaciones)]:
        if asiento:
            cuentas.contraasentar(sesion, asiento, concepto=concepto)
    cobro.anulado = True
    cobro.motivo_anulacion = f"{motivo.strip()} ({usuario})"
    q.estado = "pendiente"
    db_recibos.anular_recibo(cobro.recibo_id, motivo=motivo.strip(), conn=conexion_libracore(sesion.connection()))
    sesion.commit()
    return a_dict(sesion, cobro)


def recibo_pdf(sesion: Session, cobro_id: int) -> bytes:
    from libracore.pdf_generator import generate_pdf_recibo_doc

    cobro = _obtener(sesion, cobro_id)
    recibo = db_recibos.get_recibo(cobro.recibo_id, conn=conexion_libracore(sesion.connection()))
    return generate_pdf_recibo_doc(recibo)
