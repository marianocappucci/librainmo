"""El devengado mensual: qué cuota le toca a cada contrato vigente, generarla y anularla.

## Las decisiones

1. **La aritmética es la del motor** (`libracore.periodos`, ADR-086 del motor): mes adelantado (la cuota de noviembre
   se emite el primer día que el contrato cubre de noviembre) y prorrateo por días sobre el mes entero en las dos
   puntas (un contrato que arranca el 20 cobra 11/30 de su primer mes). El fin efectivo es la rescisión, si la hay.
2. 🔑 **La cuota no vence antes de emitirse** (decisión del 2026-10-26). La cuenta de LibraDesk vence el día pactado
   del mes, y una cuota prorrateada que arranca el 20 con vencimiento el 10 vencería diez días antes de existir: un
   contrato nuevo nacería en mora. Acá vence `max(vencimiento pactado, emisión)`.
3. **Con confirmación humana**: `previsualizar` muestra lo que se generaría sin escribir nada; `generar` lo escribe.
4. **Un contrato con un ajuste pendiente no genera su cuota** (`servicios/ajustes.py`): primero se aplica el ajuste.
   Se mira todo el mes: **un ajuste que cae a mitad de mes prorratea por días** entre el precio viejo y el nuevo
   (decisión del 2026-10-27), con una línea de alquiler por tramo.
5. **Los conceptos que paga el inquilino van en la cuota**: los fijos con su importe, los variables (expensas) con el
   que se cargue al generar o después, con `agregar_linea`, mientras la cuota esté pendiente. Los conceptos no se
   prorratean.
6. **Cada cuota es un cargo (debe) en la cuenta del inquilino**, en el libro del motor y en la misma transacción, en la
   moneda del contrato (ADR-088 del motor). Agregarle una línea corrige ese asiento; anularla lo contraasienta.
7. **Los conceptos que paga el propietario con importe fijo son un gasto por su cuenta** (decisión del 2026-10-27): al
   generar la cuota se carga el gasto, repartido entre los titulares, y se le descuenta en la liquidación. Los que no
   tienen importe se listan para cargarlos como gasto cuando llegue el monto. Anular la cuota anula esos gastos.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from libracore.periodos import periodo_de, proponer_cuota, vencimiento_de
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.errores import Conflicto, Invalido, NoEncontrado
from app.models.cobros import Cobro
from app.models.contratos import Contrato
from app.models.cuotas import Cuota, CuotaLinea
from app.models.liquidaciones import Gasto
from app.models.propiedades import Propiedad
from app.servicios import ajustes, clientes, cuentas
from app.servicios.montos import texto

_MESES = ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre",
          "noviembre", "diciembre")
_ETIQUETAS_CONCEPTO = {"expensas": "Expensas", "abl": "ABL", "seguro": "Seguro", "servicio": "Servicios",
                       "otro": "Otro"}
#: La categoría del gasto que genera un concepto que paga el propietario. Las expensas a cargo del dueño son las
#: extraordinarias (las ordinarias las paga el inquilino).
_CATEGORIA_DEL_GASTO = {"expensas": "expensas_extraordinarias", "abl": "impuesto", "seguro": "otro",
                        "servicio": "servicio", "otro": "otro"}


def nombre_del_mes(d: date) -> str:
    return f"{_MESES[d.month - 1]} {d.year}"


def _fin(c: Contrato) -> date:
    return c.fecha_rescision or c.fecha_fin


def _concepto_de_linea(x) -> str:
    return x.descripcion.strip() or _ETIQUETAS_CONCEPTO[x.concepto]


def _tramos(c: Contrato, mes, ancla: date) -> list[dict] | None:
    """El alquiler del mes por tramo de precio (decisión del 2026-10-27): un ajuste que cae a mitad de mes parte el mes
    en los días a precio viejo y los días a precio nuevo. Cada tramo es la cuenta del motor (`proponer_cuota`, días
    sobre el mes entero), así un mes de un solo precio da lo mismo que antes. `None` si algún día no tiene precio."""
    precios = [x for x in c.precios if x.vigencia_desde <= mes.hasta
               and (x.vigencia_hasta is None or x.vigencia_hasta >= mes.desde)]
    tramos, cubierto_hasta = [], mes.desde - timedelta(days=1)
    for x in precios:
        desde, hasta = max(mes.desde, x.vigencia_desde), min(mes.hasta, x.vigencia_hasta or mes.hasta)
        if desde != cubierto_hasta + timedelta(days=1):
            return None
        parte = proponer_cuota(fecha_inicio=desde, fecha_fin=hasta, periodicidad="mensual", importe=x.importe,
                               ancla=ancla)
        tramos.append({"precio_id": x.id, "desde": desde, "hasta": hasta, "dias": parte.dias_cubiertos,
                       "importe": parte.importe, "ajuste": x.motivo.startswith("ajuste")})
        cubierto_hasta = hasta
    return tramos if tramos and cubierto_hasta == mes.hasta else None


def _proponer(sesion: Session, c: Contrato, ancla: date) -> dict | None:
    """La cuota del mes de `ancla`, o `None` si el contrato no toca ese mes. Puede venir `bloqueada`."""
    mes = periodo_de("mensual", ancla).recortado(c.fecha_inicio, _fin(c))
    if mes is None:
        return None
    # 🔑 El ajuste se busca en TODO el mes, no sólo en su primer día: uno que cae el 15 también bloquea la cuota hasta
    # aplicarlo, y después la cuota sale con los dos tramos (`_tramos`).
    pendiente = ajustes.toca(c, mes.hasta)
    if pendiente is not None:
        return {"contrato_id": c.id, "numero": c.numero,
                "bloqueada": f"Tiene el ajuste del {pendiente.strftime('%d-%m-%Y')} pendiente: aplicalo primero."}
    tramos = _tramos(c, mes, ancla)
    if tramos is None:
        return {"contrato_id": c.id, "numero": c.numero, "bloqueada": "No tiene precio para todo ese mes."}
    del_propietario = [x for x in c.conceptos if x.activo and x.paga == "propietario"]
    if any(x.importe is not None for x in del_propietario):
        titulares = sesion.get(Propiedad, c.propiedad_id).titulares
        if sum((x.porcentaje for x in titulares), Decimal(0)) != Decimal(100):
            return {"contrato_id": c.id, "numero": c.numero,
                    "bloqueada": "Tiene conceptos que paga el propietario y la propiedad no tiene sus titulares "
                                 "completos: no hay a quién cargárselos."}
    p = proponer_cuota(fecha_inicio=c.fecha_inicio, fecha_fin=_fin(c), periodicidad="mensual",
                       importe=tramos[0]["importe"], ancla=ancla, dia_vencimiento=c.dia_vencimiento)
    vencimiento = max(vencimiento_de(c.dia_vencimiento, p.periodo), p.fecha_emision)
    fijos = [x for x in c.conceptos if x.activo and x.paga == "inquilino" and x.importe is not None]
    variables = [x for x in c.conceptos if x.activo and x.paga == "inquilino" and x.importe is None]
    return {
        "contrato_id": c.id, "numero": c.numero, "bloqueada": None, "moneda": c.moneda,
        "precio_id": tramos[-1]["precio_id"], "periodo_desde": p.periodo.desde, "periodo_hasta": p.periodo.hasta,
        "fecha_emision": p.fecha_emision, "fecha_vencimiento": vencimiento, "prorrateada": p.prorrateada,
        "dias_cubiertos": p.dias_cubiertos, "dias_del_periodo": p.dias_del_periodo,
        "alquiler": sum((x["importe"] for x in tramos), Decimal(0)), "tramos": tramos,
        "conceptos": [{"concepto_id": x.id, "descripcion": _concepto_de_linea(x), "importe": x.importe}
                      for x in fijos],
        "variables": [{"concepto_id": x.id, "descripcion": _concepto_de_linea(x)} for x in variables],
        # Lo que paga el propietario: con importe fijo se le carga como gasto al generar; sin importe (las expensas
        # extraordinarias de ese mes) queda para cargarlo como gasto cuando llegue.
        "gastos_del_propietario": [{"concepto_id": x.id, "descripcion": _concepto_de_linea(x), "importe": x.importe}
                                   for x in del_propietario if x.importe is not None],
        "a_cargar_como_gasto": [{"concepto_id": x.id, "descripcion": _concepto_de_linea(x)}
                                for x in del_propietario if x.importe is None],
    }


def _descripcion_del_tramo(p: dict, x: dict) -> str:
    mes = nombre_del_mes(p["periodo_desde"])
    if len(p["tramos"]) == 1:
        dias = f" ({p['dias_cubiertos']}/{p['dias_del_periodo']} días)" if p["prorrateada"] else ""
        return f"Alquiler {mes}{dias}"
    return (f"Alquiler {mes}, del {x['desde'].strftime('%d-%m')} al {x['hasta'].strftime('%d-%m')} "
            f"({x['dias']}/{p['dias_del_periodo']} días{', con el ajuste' if x['ajuste'] else ''})")


def _ya_generada(sesion: Session, contrato_id: int, desde: date) -> Cuota | None:
    return sesion.scalar(select(Cuota).where(Cuota.contrato_id == contrato_id, Cuota.periodo_desde == desde,
                                             Cuota.estado != "anulada"))


def _vigentes(sesion: Session, contrato_ids: list[int] | None) -> list[Contrato]:
    consulta = select(Contrato).where(Contrato.estado.in_(("vigente", "rescindido", "finalizado")))
    if contrato_ids:
        consulta = consulta.where(Contrato.id.in_(contrato_ids))
    return list(sesion.scalars(consulta.order_by(Contrato.numero)))


def _serializar_propuesta(p: dict) -> dict:
    if p["bloqueada"]:
        return p
    return {**p, "alquiler": texto(p["alquiler"]),
            "tramos": [{**x, "importe": texto(x["importe"])} for x in p["tramos"]],
            "conceptos": [{**x, "importe": texto(x["importe"])} for x in p["conceptos"]],
            "gastos_del_propietario": [{**x, "importe": texto(x["importe"])} for x in p["gastos_del_propietario"]]}


def previsualizar(sesion: Session, ancla: date, *, contrato_ids: list[int] | None = None) -> dict:
    """Lo que generaría `generar` para el mes de `ancla`, **sin escribir nada**: lo que se emitiría, lo que ya estaba y
    lo que está bloqueado (un ajuste pendiente)."""
    mes = periodo_de("mensual", ancla)
    propuestas, ya, bloqueadas = [], [], []
    for c in _vigentes(sesion, contrato_ids):
        p = _proponer(sesion, c, ancla)
        if p is None:
            continue
        existente = _ya_generada(sesion, c.id, p.get("periodo_desde") or mes.desde) if not p["bloqueada"] else None
        if existente is not None:
            ya.append({"contrato_id": c.id, "numero": c.numero, "cuota_id": existente.id})
        elif p["bloqueada"]:
            bloqueadas.append({"contrato_id": c.id, "numero": c.numero, "motivo": p["bloqueada"]})
        else:
            propuestas.append(_serializar_propuesta(p))
    return {"periodo_desde": mes.desde, "periodo_hasta": mes.hasta, "propuestas": propuestas, "ya_generadas": ya,
            "bloqueadas": bloqueadas}


def generar(sesion: Session, ancla: date, *, contrato_ids: list[int] | None = None,
            variables: dict[int, Decimal] | None = None) -> dict:
    """Escribe las cuotas del mes de `ancla` que correspondan, cada una con su cargo en la cuenta del inquilino.

    `variables` es `{concepto_id: importe}` para los conceptos sin importe fijo (las expensas de ese mes); los que no
    vengan quedan sin cargar y se agregan después con `agregar_linea`. Idempotente: lo ya generado no se repite."""
    variables = variables or {}
    generadas = []
    for c in _vigentes(sesion, contrato_ids):
        p = _proponer(sesion, c, ancla)
        if p is None or p["bloqueada"] or _ya_generada(sesion, c.id, p["periodo_desde"]):
            continue
        lineas = [CuotaLinea(tipo="alquiler", descripcion=_descripcion_del_tramo(p, x), importe=x["importe"])
                  for x in p["tramos"]]
        lineas += [CuotaLinea(tipo="concepto", concepto_id=x["concepto_id"], descripcion=x["descripcion"],
                              importe=x["importe"]) for x in p["conceptos"]]
        for x in p["variables"]:
            importe = variables.get(x["concepto_id"])
            if importe is not None:
                if Decimal(str(importe)) <= 0:
                    raise Invalido(f"El importe de «{x['descripcion']}» tiene que ser mayor que cero.")
                lineas.append(CuotaLinea(tipo="concepto", concepto_id=x["concepto_id"], descripcion=x["descripcion"],
                                         importe=Decimal(str(importe))))
        total = sum((x.importe for x in lineas), Decimal(0))
        asiento = cuentas.asentar(sesion, fecha=p["fecha_emision"], tercero_id=c.inquilino_id, rol=cuentas.INQUILINO,
                                  concepto=f"Cuota {nombre_del_mes(p['periodo_desde'])} {c.numero}", debe=total,
                                  moneda=c.moneda)
        cuota = Cuota(contrato_id=c.id, periodo_desde=p["periodo_desde"], periodo_hasta=p["periodo_hasta"],
                      fecha_emision=p["fecha_emision"], fecha_vencimiento=p["fecha_vencimiento"],
                      prorrateada=p["prorrateada"], dias_cubiertos=p["dias_cubiertos"],
                      dias_del_periodo=p["dias_del_periodo"], precio_id=p["precio_id"], total=total,
                      asiento_id=asiento, lineas=lineas)
        sesion.add(cuota)
        if p["gastos_del_propietario"]:
            from app.servicios import gastos as servicio_gastos  # gastos → cobros → cuotas: acá adentro, sin ciclo

            sesion.flush()
            for x in p["gastos_del_propietario"]:
                concepto = next(k for k in c.conceptos if k.id == x["concepto_id"])
                servicio_gastos.nuevo(
                    sesion, propiedad_id=c.propiedad_id, fecha=p["fecha_emision"],
                    categoria=_CATEGORIA_DEL_GASTO[concepto.concepto],
                    descripcion=f"{x['descripcion']} {nombre_del_mes(p['periodo_desde'])} ({c.numero})",
                    importe=x["importe"], moneda=c.moneda, usuario="Sistema", cuota_id=cuota.id,
                    concepto_id=concepto.id)
        generadas.append(cuota)
    try:
        sesion.commit()
    except IntegrityError as e:
        sesion.rollback()
        raise Conflicto("Otra generación del mismo mes terminó primero: volvé a previsualizar.") from e
    return {"generadas": [a_dict(sesion, x) for x in generadas]}


def a_dict(sesion: Session, q: Cuota) -> dict:
    c = sesion.get(Contrato, q.contrato_id)
    return {
        "id": q.id, "contrato_id": q.contrato_id, "numero_contrato": c.numero,
        "inquilino_id": c.inquilino_id, "inquilino_nombre": clientes.nombres(sesion, [c.inquilino_id]).get(
            c.inquilino_id, ""),
        "periodo_desde": q.periodo_desde, "periodo_hasta": q.periodo_hasta, "fecha_emision": q.fecha_emision,
        "fecha_vencimiento": q.fecha_vencimiento, "prorrateada": q.prorrateada, "dias_cubiertos": q.dias_cubiertos,
        "dias_del_periodo": q.dias_del_periodo, "total": texto(q.total), "estado": q.estado, "moneda": c.moneda,
        "gastos_del_propietario": [{"id": g.id, "descripcion": g.descripcion, "importe": texto(g.importe),
                                    "anulado": g.anulado}
                                   for g in sesion.scalars(select(Gasto).where(Gasto.cuota_id == q.id)
                                                           .order_by(Gasto.id))],
        "cobro_id": sesion.scalar(select(Cobro.id).where(Cobro.cuota_id == q.id, Cobro.anulado.is_(False))),
        "lineas": [{"id": x.id, "tipo": x.tipo, "concepto_id": x.concepto_id, "descripcion": x.descripcion,
                    "importe": texto(x.importe)} for x in q.lineas],
    }


def _obtener(sesion: Session, cuota_id: int) -> Cuota:
    q = sesion.get(Cuota, cuota_id)
    if q is None:
        raise NoEncontrado("La cuota no existe.")
    return q


def obtener(sesion: Session, cuota_id: int) -> dict:
    return a_dict(sesion, _obtener(sesion, cuota_id))


def buscar(sesion: Session, *, contrato_id: int | None = None, estado: str | None = None, desde: date | None = None,
           hasta: date | None = None, limit: int = 100, offset: int = 0) -> list[dict]:
    consulta = select(Cuota).order_by(Cuota.periodo_desde.desc(), Cuota.id.desc())
    if contrato_id:
        consulta = consulta.where(Cuota.contrato_id == contrato_id)
    if estado:
        consulta = consulta.where(Cuota.estado == estado)
    if desde:
        consulta = consulta.where(Cuota.periodo_desde >= desde)
    if hasta:
        consulta = consulta.where(Cuota.periodo_desde <= hasta)
    return [a_dict(sesion, q) for q in sesion.scalars(consulta.limit(limit).offset(offset))]


def agregar_linea(sesion: Session, cuota_id: int, *, importe, concepto_id: int | None = None,
                  descripcion: str | None = None) -> dict:
    """Un cargo más en una cuota pendiente: las expensas del mes que llegaron después, o un cargo suelto."""
    q = _obtener(sesion, cuota_id)
    if q.estado != "pendiente":
        raise Conflicto(f"La cuota está {q.estado}: ya no se le agregan cargos.")
    importe = Decimal(str(importe))
    if importe <= 0:
        raise Invalido("El importe tiene que ser mayor que cero.")
    c = sesion.get(Contrato, q.contrato_id)
    if concepto_id is not None:
        concepto = next((x for x in c.conceptos if x.id == concepto_id), None)
        if concepto is None or concepto.paga != "inquilino":
            raise Invalido("El concepto no es de este contrato o no lo paga el inquilino.")
        if any(x.concepto_id == concepto_id for x in q.lineas):
            raise Conflicto(f"«{_concepto_de_linea(concepto)}» ya está en esta cuota.")
        descripcion = descripcion or _concepto_de_linea(concepto)
    if not (descripcion or "").strip():
        raise Invalido("Un cargo suelto lleva descripción.")
    q.lineas.append(CuotaLinea(tipo="concepto", concepto_id=concepto_id, descripcion=descripcion.strip(),
                               importe=importe))
    q.total += importe
    cuentas.corregir(sesion, q.asiento_id, debe=q.total)
    sesion.commit()
    return a_dict(sesion, q)


def anular(sesion: Session, cuota_id: int, *, motivo: str) -> dict:
    """Una cuota pendiente se anula con su contraasiento: el cargo deja de contar y el mes se puede volver a generar."""
    q = _obtener(sesion, cuota_id)
    if q.estado != "pendiente":
        raise Conflicto(f"La cuota está {q.estado}: sólo se anula una pendiente.")
    if not (motivo or "").strip():
        raise Invalido("Anular una cuota pide un motivo.")
    c = sesion.get(Contrato, q.contrato_id)
    from app.servicios import gastos as servicio_gastos

    for g in sesion.scalars(select(Gasto).where(Gasto.cuota_id == q.id, Gasto.anulado.is_(False))):
        servicio_gastos.anular_sin_confirmar(sesion, g, motivo=f"anulación de la cuota: {motivo.strip()}")
    cuentas.contraasentar(sesion, q.asiento_id, concepto=f"Anulación cuota {nombre_del_mes(q.periodo_desde)} "
                                                         f"{c.numero}: {motivo.strip()}")
    q.estado = "anulada"
    sesion.commit()
    return a_dict(sesion, q)
