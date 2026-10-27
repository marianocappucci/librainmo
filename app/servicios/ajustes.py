"""El ajuste del alquiler: cuándo le toca a un contrato y cuánto da.

## Las decisiones

1. **Se cuenta desde `fecha_inicio`**, cada `periodicidad_ajuste` (`libracore.periodos.periodo_anclado`): un
   trimestral que arrancó el 15-02 se ajusta el 15-05, el 15-08 y así. No se alinea al calendario.
2. **La base es el precio vigente**, de su `vigencia_desde` a la fecha del ajuste. Un ajuste a mano en el medio no se
   pisa ni se cuenta dos veces.
3. **Por índice**, la cuenta es la del motor (`libracore.indices_ajuste.ajustar`, ADR-085): si falta un valor, se baja
   de la fuente en el momento y se reintenta una vez. **Por porcentaje**, se compone una vez por cada período que pasó
   desde el precio vigente (si se salteó un ajuste, el siguiente no se queda corto).
4. **Con confirmación humana**: `proponer` muestra la cuenta; `aplicar` la rehace (no confía en la pantalla) y la
   escribe con `contratos.actualizar_precio`. El importe queda congelado en `contrato_precios`.
5. **Mientras un ajuste está pendiente, no se genera la cuota de ese contrato** (`servicios/cuotas.py`): cobrar con el
   precio viejo y corregir después es justo lo que una inmobiliaria no puede hacer con un inquilino.
6. 🔑 **Sin fecha, se propone el ajuste del mes en curso**, aunque caiga más adelante en el mes: la cuota de un mes con
   ajuste el 15 está bloqueada desde el día 1, y si la propuesta esperara al 15 esa cuota no se podría emitir hasta
   entonces. Por índice puede faltar todavía el valor de esa fecha (409 con lo que falta, como siempre).
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from libracore import indices_ajuste as ia
from libracore import indices_descarga
from libracore.periodos import periodo_anclado, periodo_de
from sqlalchemy.orm import Session

from app import tiempo
from app.errores import Conflicto, Invalido
from app.models.contratos import Contrato
from app.servicios import contratos as servicio_contratos
from app.servicios.montos import texto

_MARGEN_DE_DESCARGA = timedelta(days=40)


def _vigente(c: Contrato):
    vigente = next((p for p in reversed(c.precios) if p.vigencia_hasta is None), None)
    if vigente is None:
        raise Conflicto("El contrato no tiene un precio vigente.")
    return vigente


def toca(c: Contrato, fecha: date) -> date | None:
    """La fecha del ajuste pendiente en `fecha`, o `None` si no hay. Sólo fechas: no lee índices ni sale a la red."""
    if c.metodo_ajuste == "fijo" or not c.periodicidad_ajuste or c.estado != "vigente":
        return None
    periodo = periodo_anclado(c.periodicidad_ajuste, ancla=fecha, arranque=c.fecha_inicio)
    if periodo.desde <= c.fecha_inicio or periodo.desde <= _vigente(c).vigencia_desde:
        return None
    return periodo.desde


def _periodos_desde(c: Contrato, desde: date, hasta: date) -> int:
    """Cuántos comienzos de período de ajuste hay en `(desde, hasta]`."""
    n, inicio = 0, hasta
    while inicio > desde:
        n += 1
        inicio = periodo_anclado(c.periodicidad_ajuste, ancla=inicio - timedelta(days=1), arranque=c.fecha_inicio).desde
    return n


def _por_indice(clave: str, importe: Decimal, base: date, fecha: date) -> dict:
    try:
        return ia.ajustar(clave, importe, base, fecha)
    except ia.IndiceFaltante as faltan:
        if clave not in indices_descarga.DESCARGABLES:
            raise
        desde = date.fromisoformat(min(faltan.fechas)) - _MARGEN_DE_DESCARGA
        try:
            indices_descarga.sincronizar(clave, desde=desde, hasta=max(fecha, tiempo.hoy()))
        except indices_descarga.FuenteNoDisponible:
            raise faltan from None
    return ia.ajustar(clave, importe, base, fecha)


def _serializar(a: dict) -> dict:
    return {
        "metodo": a["metodo"], "importe_anterior": texto(a["importe_anterior"]),
        "importe_nuevo": texto(a["importe_nuevo"]),
        "coeficiente": format(a["coeficiente"], "f"), "variacion_pct": texto(a["variacion_pct"]),
        **({"indice": a["indice"], "indice_nombre": a["indice_nombre"],
            "valores": [{"fecha": v["fecha"], "valor": format(v["valor"], "f"), "fuente": v["fuente"],
                         **({"fecha_pedida": v["fecha_pedida"]} if "fecha_pedida" in v else {})}
                        for v in a["valores"]]} if a["metodo"] == "indice" else {}),
        **({"porcentaje": texto(a["porcentaje"], 3), "periodos": a["periodos"]} if a["metodo"] == "porcentaje" else {}),
    }


def proponer(sesion: Session, contrato_id: int, *, fecha: date | None = None) -> dict:
    """El ajuste que le toca al contrato en `fecha` (hoy, si no se dice). **No escribe nada.**"""
    c = servicio_contratos._obtener(sesion, contrato_id)
    if c.metodo_ajuste == "fijo":
        raise Invalido("Este contrato no se ajusta.")
    if fecha is None:
        hoy = tiempo.hoy()
        fin_de_mes = periodo_de("mensual", hoy).hasta
        fecha = fin_de_mes if toca(c, hoy) is None and toca(c, fin_de_mes) is not None else hoy
    vigente = _vigente(c)
    periodo = periodo_anclado(c.periodicidad_ajuste, ancla=fecha, arranque=c.fecha_inicio)
    respuesta = {"fecha_ajuste": periodo.desde, "proximo_ajuste": periodo.hasta + timedelta(days=1),
                 "precio_vigente": texto(vigente.importe), "precio_vigente_desde": vigente.vigencia_desde}
    fecha_ajuste = toca(c, fecha)
    if fecha_ajuste is None:
        motivo = "primer_periodo" if periodo.desde <= c.fecha_inicio else "ya_ajustado"
        return {**respuesta, "corresponde": False, "motivo": motivo, "ajuste": None}
    if c.metodo_ajuste == "indice":
        ajuste = _por_indice(c.indice_ajuste, vigente.importe, vigente.vigencia_desde, fecha_ajuste)
    else:
        n = _periodos_desde(c, vigente.vigencia_desde, fecha_ajuste)
        ajuste = {**ia.aplicar(vigente.importe, (1 + c.porcentaje_ajuste / 100) ** n), "metodo": "porcentaje",
                  "porcentaje": c.porcentaje_ajuste, "periodos": n}
    return {**respuesta, "corresponde": True, "motivo": None, "ajuste": _serializar(ajuste)}


def aplicar(sesion: Session, contrato_id: int, *, fecha_ajuste: date, usuario: str) -> dict:
    propuesta = proponer(sesion, contrato_id, fecha=fecha_ajuste)
    if not propuesta["corresponde"]:
        raise Conflicto("El período de ajuste en curso ya tiene su precio." if propuesta["motivo"] == "ya_ajustado"
                        else "El contrato todavía no cumplió su primer período de ajuste.")
    if propuesta["fecha_ajuste"] != fecha_ajuste:
        raise Conflicto(f"El ajuste de este período es el del {propuesta['fecha_ajuste'].strftime('%d-%m-%Y')}.")
    c = servicio_contratos._obtener(sesion, contrato_id)
    motivo = f"ajuste_indice:{c.indice_ajuste}" if c.metodo_ajuste == "indice" else "ajuste_porcentaje"
    contrato = servicio_contratos.actualizar_precio(
        sesion, contrato_id, importe=Decimal(propuesta["ajuste"]["importe_nuevo"]), vigencia_desde=fecha_ajuste,
        usuario=usuario, motivo=motivo)
    return {"contrato": contrato, "ajuste": propuesta["ajuste"]}
