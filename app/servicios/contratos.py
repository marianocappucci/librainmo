"""Contratos de locación: alta, ciclo de vida, precio con vigencia, garantías y conceptos.

## El ciclo

`borrador` → `vigente` → `rescindido` | `finalizado`. Un borrador se edita entero (también su importe inicial, que es
su único precio). Al **activarlo**:

- la propiedad tiene que tener titulares que sumen 100 (si no, no hay a quién liquidarle);
- no puede tener otro contrato vigente;
- la propiedad pasa a `alquilada`, y vuelve a `disponible` cuando el contrato se rescinde o finaliza.

Un contrato vigente ya no cambia sus condiciones: el alquiler se actualiza **con vigencia** (`actualizar_precio`, que
cierra el precio vigente el día antes y abre el nuevo, como `contratos_precios` de LibraDesk) y los conceptos y las
garantías se agregan o se quitan aparte.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from libracore.indices_ajuste import INDICES
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.errores import Conflicto, Invalido, NoEncontrado
from app.models.contratos import (
    BASES_PUNITORIO,
    DESTINOS_PUNITORIO,
    ESTADOS_CERRADOS,
    METODOS_AJUSTE,
    MONEDAS,
    PAGADORES,
    PERIODICIDADES,
    TIPOS_CONCEPTO,
    TIPOS_GARANTIA,
    ConceptoContrato,
    Contrato,
    ContratoPrecio,
    Garantia,
)
from app.models.propiedades import Propiedad
from app.servicios import clientes, numeracion
from app.servicios.montos import texto

_UN_DIA = timedelta(days=1)

#: Lo que se puede cambiar de un contrato que no es borrador. Todo lo demás es una condición pactada.
EDITABLES_VIGENTE = {"observaciones"}


def _precio_vigente(c: Contrato) -> ContratoPrecio | None:
    return next((p for p in reversed(c.precios) if p.vigencia_hasta is None), None)


def _a_dict(sesion: Session, c: Contrato, *, detalle: bool = False) -> dict:
    p = sesion.get(Propiedad, c.propiedad_id)
    nombres = clientes.nombres(sesion, [c.inquilino_id, *(g.garante_id for g in c.garantias)])
    vigente = _precio_vigente(c)
    d = {
        "id": c.id, "numero": c.numero, "estado": c.estado,
        "propiedad_id": c.propiedad_id, "propiedad_codigo": p.codigo if p else "",
        "propiedad_direccion": " ".join(x for x in (p.direccion, p.unidad or "") if x) if p else "",
        "inquilino_id": c.inquilino_id, "inquilino_nombre": nombres.get(c.inquilino_id, ""),
        "fecha_inicio": c.fecha_inicio, "fecha_fin": c.fecha_fin, "fecha_rescision": c.fecha_rescision,
        "moneda": c.moneda, "dia_vencimiento": c.dia_vencimiento, "dias_gracia": c.dias_gracia,
        "metodo_ajuste": c.metodo_ajuste, "indice_ajuste": c.indice_ajuste,
        "indice_ajuste_nombre": INDICES[c.indice_ajuste].nombre if c.indice_ajuste in INDICES else None,
        "porcentaje_ajuste": texto(c.porcentaje_ajuste, 3), "periodicidad_ajuste": c.periodicidad_ajuste,
        "punitorio_tasa": texto(c.punitorio_tasa, 4), "punitorio_base": c.punitorio_base,
        "punitorio_para": c.punitorio_para,
        "comision_pct": texto(c.comision_pct), "deposito": texto(c.deposito), "observaciones": c.observaciones,
        "importe_vigente": texto(vigente.importe) if vigente else None,
        "precio_vigente_desde": vigente.vigencia_desde if vigente else None,
    }
    if detalle:
        d["precios"] = [{"id": x.id, "vigencia_desde": x.vigencia_desde, "vigencia_hasta": x.vigencia_hasta,
                         "importe": texto(x.importe), "motivo": x.motivo, "usuario": x.usuario}
                        for x in reversed(c.precios)]
        d["garantias"] = [{"id": g.id, "tipo": g.tipo, "garante_id": g.garante_id,
                           "garante_nombre": nombres.get(g.garante_id, "") if g.garante_id else "",
                           "descripcion": g.descripcion, "vence": g.vence} for g in c.garantias]
        d["conceptos"] = [{"id": x.id, "concepto": x.concepto, "descripcion": x.descripcion, "paga": x.paga,
                           "importe": texto(x.importe), "activo": x.activo} for x in c.conceptos]
    return d


def _obtener(sesion: Session, contrato_id: int) -> Contrato:
    c = sesion.get(Contrato, contrato_id)
    if c is None:
        raise NoEncontrado("El contrato no existe.")
    return c


def _validar(d: dict) -> None:
    for campo, validos, etiqueta in (
        ("moneda", MONEDAS, "Moneda"), ("metodo_ajuste", METODOS_AJUSTE, "Método de ajuste"),
        ("periodicidad_ajuste", PERIODICIDADES, "Periodicidad del ajuste"),
        ("punitorio_base", BASES_PUNITORIO, "Base del punitorio"),
        ("punitorio_para", DESTINOS_PUNITORIO, "Destino del punitorio"),
    ):
        if d.get(campo) is not None and d[campo] not in validos:
            raise Invalido(f"{etiqueta} inválida: {d[campo]}")
    if d.get("indice_ajuste") is not None and d["indice_ajuste"] not in INDICES:
        raise Invalido(f"Índice de ajuste inválido: {d['indice_ajuste']}")
    if d["fecha_fin"] < d["fecha_inicio"]:
        raise Invalido("La fecha de fin no puede ser anterior a la de inicio.")
    if not 1 <= d["dia_vencimiento"] <= 31:
        raise Invalido("El día de vencimiento va del 1 al 31.")
    if d["dias_gracia"] < 0:
        raise Invalido("Los días de gracia no pueden ser negativos.")
    if not Decimal(0) <= Decimal(str(d["comision_pct"])) <= Decimal(100):
        raise Invalido("La comisión va de 0 a 100 %.")
    metodo = d["metodo_ajuste"]
    if metodo == "indice" and (not d.get("indice_ajuste") or not d.get("periodicidad_ajuste")):
        raise Invalido("Un contrato que se ajusta por índice tiene que decir cuál y cada cuánto.")
    if metodo == "porcentaje" and (d.get("porcentaje_ajuste") is None or not d.get("periodicidad_ajuste")):
        raise Invalido("Un contrato que se ajusta por porcentaje tiene que decir cuánto y cada cuánto.")
    if metodo == "fijo" and (d.get("indice_ajuste") or d.get("porcentaje_ajuste") is not None):
        raise Invalido("Un contrato sin ajuste no lleva índice ni porcentaje.")
    if metodo != "indice" and d.get("indice_ajuste"):
        raise Invalido("El índice sólo va con el método «índice».")


_CAMPOS = ("propiedad_id", "inquilino_id", "fecha_inicio", "fecha_fin", "moneda", "dia_vencimiento", "dias_gracia",
           "metodo_ajuste", "indice_ajuste", "porcentaje_ajuste", "periodicidad_ajuste", "punitorio_tasa",
           "punitorio_base", "punitorio_para", "comision_pct", "deposito", "observaciones")


def buscar(sesion: Session, *, q: str | None = None, estado: str | None = None, propiedad_id: int | None = None,
           inquilino_id: int | None = None, limit: int = 50, offset: int = 0) -> list[dict]:
    consulta = select(Contrato).order_by(Contrato.numero.desc())
    if estado:
        consulta = consulta.where(Contrato.estado == estado)
    if propiedad_id:
        consulta = consulta.where(Contrato.propiedad_id == propiedad_id)
    if inquilino_id:
        consulta = consulta.where(Contrato.inquilino_id == inquilino_id)
    if q:
        patron = f"%{q.strip()}%"
        consulta = consulta.join(Propiedad, Propiedad.id == Contrato.propiedad_id).where(
            or_(Contrato.numero.ilike(patron), Propiedad.direccion.ilike(patron), Propiedad.codigo.ilike(patron)))
    return [_a_dict(sesion, c) for c in sesion.scalars(consulta.limit(limit).offset(offset))]


def obtener(sesion: Session, contrato_id: int) -> dict:
    return _a_dict(sesion, _obtener(sesion, contrato_id), detalle=True)


def crear(sesion: Session, datos: dict, *, usuario: str) -> dict:
    """Un contrato nace en borrador, con su primer precio desde `fecha_inicio`."""
    importe = datos.pop("importe_inicial")
    _validar(datos)
    if sesion.get(Propiedad, datos["propiedad_id"]) is None:
        raise Invalido("La propiedad elegida no existe.")
    clientes.exigir(sesion, datos["inquilino_id"], "inquilino")
    if Decimal(str(importe)) <= 0:
        raise Invalido("El alquiler tiene que ser mayor que cero.")
    c = Contrato(numero=numeracion.siguiente(sesion, Contrato.numero, "C-"), estado="borrador", **datos)
    c.precios.append(ContratoPrecio(vigencia_desde=datos["fecha_inicio"], importe=Decimal(str(importe)),
                                    motivo="inicial", usuario=usuario))
    sesion.add(c)
    sesion.commit()
    return obtener(sesion, c.id)


def actualizar(sesion: Session, contrato_id: int, datos: dict) -> dict:
    c = _obtener(sesion, contrato_id)
    importe = datos.pop("importe_inicial", None)
    if c.estado != "borrador":
        prohibidos = set(datos) - EDITABLES_VIGENTE
        if prohibidos or importe is not None:
            raise Conflicto("Un contrato que ya no es borrador no cambia sus condiciones: el alquiler se actualiza "
                            "con vigencia y los conceptos y garantías se cargan aparte.")
    fusion = {campo: getattr(c, campo) for campo in _CAMPOS} | datos
    _validar(fusion)
    if "inquilino_id" in datos:
        clientes.exigir(sesion, datos["inquilino_id"], "inquilino")
    if "propiedad_id" in datos and sesion.get(Propiedad, datos["propiedad_id"]) is None:
        raise Invalido("La propiedad elegida no existe.")
    for campo, valor in datos.items():
        setattr(c, campo, valor)
    if c.estado == "borrador":
        # El borrador tiene un solo precio, el inicial: sigue a la fecha de inicio y al importe que se edite.
        inicial = c.precios[0]
        inicial.vigencia_desde = c.fecha_inicio
        if importe is not None:
            if Decimal(str(importe)) <= 0:
                raise Invalido("El alquiler tiene que ser mayor que cero.")
            inicial.importe = Decimal(str(importe))
    sesion.commit()
    return obtener(sesion, c.id)


def activar(sesion: Session, contrato_id: int) -> dict:
    c = _obtener(sesion, contrato_id)
    if c.estado != "borrador":
        raise Conflicto(f"El contrato está {c.estado}: sólo se activa un borrador.")
    p = sesion.get(Propiedad, c.propiedad_id)
    if sum((t.porcentaje for t in p.titulares), Decimal(0)) != Decimal(100):
        raise Conflicto("La propiedad no tiene sus titulares completos (tienen que sumar 100 %): sin ellos no hay a "
                        "quién liquidarle.")
    otro = sesion.scalar(select(Contrato).where(Contrato.propiedad_id == c.propiedad_id, Contrato.estado == "vigente",
                                                Contrato.id != c.id))
    if otro is not None:
        raise Conflicto(f"La propiedad ya tiene el contrato {otro.numero} vigente.")
    if p.estado in ("vendida", "baja"):
        raise Conflicto(f"La propiedad está {p.estado}.")
    c.estado = "vigente"
    p.estado = "alquilada"
    sesion.commit()
    return obtener(sesion, c.id)


def _cerrar(sesion: Session, c: Contrato, estado: str) -> None:
    c.estado = estado
    p = sesion.get(Propiedad, c.propiedad_id)
    if p.estado == "alquilada":
        p.estado = "disponible"


def rescindir(sesion: Session, contrato_id: int, *, fecha: date, observaciones: str | None = None) -> dict:
    c = _obtener(sesion, contrato_id)
    if c.estado != "vigente":
        raise Conflicto(f"El contrato está {c.estado}: sólo se rescinde uno vigente.")
    if not c.fecha_inicio <= fecha <= c.fecha_fin:
        raise Invalido("La fecha de rescisión tiene que estar dentro del contrato.")
    c.fecha_rescision = fecha
    if observaciones:
        c.observaciones = "\n".join(x for x in (c.observaciones, observaciones) if x)
    _cerrar(sesion, c, "rescindido")
    sesion.commit()
    return obtener(sesion, c.id)


def finalizar(sesion: Session, contrato_id: int, *, hoy: date) -> dict:
    c = _obtener(sesion, contrato_id)
    if c.estado != "vigente":
        raise Conflicto(f"El contrato está {c.estado}: sólo se finaliza uno vigente.")
    if hoy < c.fecha_fin:
        raise Conflicto(f"El contrato termina el {c.fecha_fin.strftime('%d-%m-%Y')}: antes de eso, se rescinde.")
    _cerrar(sesion, c, "finalizado")
    sesion.commit()
    return obtener(sesion, c.id)


def borrar(sesion: Session, contrato_id: int) -> None:
    c = _obtener(sesion, contrato_id)
    if c.estado != "borrador":
        raise Conflicto("Sólo se borra un borrador: un contrato que estuvo vigente queda en el historial.")
    sesion.delete(c)
    sesion.commit()


def actualizar_precio(sesion: Session, contrato_id: int, *, importe, vigencia_desde: date, usuario: str,
                      motivo: str = "manual") -> dict:
    """Cierra el precio vigente el día antes y abre el nuevo, en una transacción."""
    c = _obtener(sesion, contrato_id)
    if c.estado != "vigente":
        raise Conflicto("El precio con vigencia es de un contrato vigente; un borrador se edita.")
    if Decimal(str(importe)) <= 0:
        raise Invalido("El alquiler tiene que ser mayor que cero.")
    vigente = _precio_vigente(c)
    if vigente is not None and vigencia_desde <= vigente.vigencia_desde:
        raise Conflicto(f"El precio vigente arranca el {vigente.vigencia_desde.strftime('%d-%m-%Y')}: el nuevo "
                        "tiene que empezar después.")
    if not vigencia_desde <= c.fecha_fin:
        raise Invalido("El precio nuevo tiene que empezar antes de que termine el contrato.")
    if vigente is not None:
        vigente.vigencia_hasta = vigencia_desde - _UN_DIA
    c.precios.append(ContratoPrecio(vigencia_desde=vigencia_desde, importe=Decimal(str(importe)), motivo=motivo,
                                    usuario=usuario))
    sesion.commit()
    return obtener(sesion, c.id)


def precio_en(sesion: Session, contrato_id: int, fecha: date) -> ContratoPrecio | None:
    return sesion.scalar(select(ContratoPrecio).where(
        ContratoPrecio.contrato_id == contrato_id, ContratoPrecio.vigencia_desde <= fecha,
        or_(ContratoPrecio.vigencia_hasta.is_(None), ContratoPrecio.vigencia_hasta >= fecha),
    ).order_by(ContratoPrecio.vigencia_desde.desc()))


def _abierto(c: Contrato) -> None:
    if c.estado in ESTADOS_CERRADOS:
        raise Conflicto(f"El contrato está {c.estado}.")


def agregar_garantia(sesion: Session, contrato_id: int, datos: dict) -> dict:
    c = _obtener(sesion, contrato_id)
    _abierto(c)
    if datos["tipo"] not in TIPOS_GARANTIA:
        raise Invalido(f"Tipo de garantía inválido: {datos['tipo']}")
    if datos.get("garante_id") is not None:
        clientes.exigir(sesion, datos["garante_id"], "garante")
    c.garantias.append(Garantia(**datos))
    sesion.commit()
    return obtener(sesion, c.id)


def quitar_garantia(sesion: Session, contrato_id: int, garantia_id: int) -> dict:
    c = _obtener(sesion, contrato_id)
    _abierto(c)
    g = next((g for g in c.garantias if g.id == garantia_id), None)
    if g is None:
        raise NoEncontrado("La garantía no es de este contrato.")
    c.garantias.remove(g)
    sesion.commit()
    return obtener(sesion, c.id)


def agregar_concepto(sesion: Session, contrato_id: int, datos: dict) -> dict:
    c = _obtener(sesion, contrato_id)
    _abierto(c)
    if datos["concepto"] not in TIPOS_CONCEPTO:
        raise Invalido(f"Concepto inválido: {datos['concepto']}")
    if datos["paga"] not in PAGADORES:
        raise Invalido(f"Quién paga, inválido: {datos['paga']}")
    if datos.get("importe") is not None and Decimal(str(datos["importe"])) <= 0:
        raise Invalido("El importe de un concepto fijo tiene que ser mayor que cero; sin importe, es variable.")
    c.conceptos.append(ConceptoContrato(**datos))
    sesion.commit()
    return obtener(sesion, c.id)


def actualizar_concepto(sesion: Session, contrato_id: int, concepto_id: int, datos: dict) -> dict:
    c = _obtener(sesion, contrato_id)
    _abierto(c)
    x = next((x for x in c.conceptos if x.id == concepto_id), None)
    if x is None:
        raise NoEncontrado("El concepto no es de este contrato.")
    if datos.get("importe") is not None and Decimal(str(datos["importe"])) <= 0:
        raise Invalido("El importe de un concepto fijo tiene que ser mayor que cero; sin importe, es variable.")
    for campo, valor in datos.items():
        setattr(x, campo, valor)
    sesion.commit()
    return obtener(sesion, c.id)
