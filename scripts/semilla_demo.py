"""Los datos ficticios de la demo: un mes de trabajo de una inmobiliaria inventada.

    python -m scripts.semilla_demo        # adentro del contenedor de la demo, con su entorno

🔴 **Todo es ficticio** (nombres, direcciones, importes): nada de personas ni empresas reales, ni el humano ni sus
clientes. Las fechas son **relativas a hoy**, para que la demo no envejezca: los contratos arrancaron hace unos meses,
las cuotas son las de los últimos meses y hay una atrasada para que se vea el punitorio.

Es **idempotente por vacío**: si ya hay propiedades, no hace nada. Pasa por los servicios del dominio y no por SQL,
así los datos cumplen las mismas reglas que la pantalla (titulares que suman 100, asientos en el libro del motor,
recibos del motor).
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from libracore.db import clients as clientes_del_motor
from libracore.periodos import sumar_meses
from sqlalchemy import func, select

from app import db, tiempo
from app.models.propiedades import Propiedad
from app.servicios import cobros, contratos, cuotas, gastos, liquidaciones, propiedades

USUARIO = "demo"

DUENOS = ("Marta Ficticia", "Ernesto Inventado", "Lucía Imaginaria")
INQUILINOS = ("Pablo Supuesto", "Carla Hipotética", "Diego Simulado")


def _cliente(nombre: str) -> int:
    return clientes_del_motor.create_client(nombre, address="Ciudad Ficticia")


def _primero_del_mes(d: date, meses: int) -> date:
    return sumar_meses(d.replace(day=1), meses)


def sembrar(sesion) -> dict:
    if sesion.scalar(select(func.count()).select_from(Propiedad)):
        return {"sembrado": False, "motivo": "ya hay propiedades"}
    hoy = tiempo.hoy()
    duenos = [_cliente(n) for n in DUENOS]
    inquilinos = [_cliente(n) for n in INQUILINOS]

    props = []
    for tipo, direccion, unidad, titulares in (
        ("departamento", "Calle Inventada 123", "3° B", [(duenos[0], "60"), (duenos[1], "40")]),
        ("casa", "Pasaje Imaginario 45", None, [(duenos[1], "100")]),
        ("local", "Avenida Supuesta 900", "Local 2", [(duenos[2], "100")]),
        ("departamento", "Calle Inventada 125", "1° A", [(duenos[2], "100")]),
    ):
        p = propiedades.crear(sesion, {"tipo": tipo, "direccion": direccion, "unidad": unidad,
                                       "localidad": "Ciudad Ficticia"})
        propiedades.fijar_titulares(sesion, p["id"], [{"cliente_id": c, "porcentaje": Decimal(x)}
                                                      for c, x in titulares])
        props.append(p["id"])

    inicio = _primero_del_mes(hoy, -3)
    base = {"moneda": "ARS", "dia_vencimiento": 10, "dias_gracia": 3, "punitorio_tasa": Decimal("0.1"),
            "punitorio_base": "diaria", "punitorio_para": "inmobiliaria", "comision_pct": Decimal("5"),
            "deposito": None, "observaciones": None, "indice_ajuste": None, "porcentaje_ajuste": None,
            "periodicidad_ajuste": None}
    planes = (
        # Por ICL cada seis meses: con tres meses de contrato todavía no le toca ajustar.
        (props[0], inquilinos[0], Decimal("450000"), {"metodo_ajuste": "indice", "indice_ajuste": "icl",
                                                     "periodicidad_ajuste": "semestral"}),
        (props[1], inquilinos[1], Decimal("380000"), {"metodo_ajuste": "porcentaje",
                                                     "porcentaje_ajuste": Decimal("12"),
                                                     "periodicidad_ajuste": "semestral"}),
        (props[2], inquilinos[2], Decimal("620000"), {"metodo_ajuste": "fijo"}),
    )
    ids = []
    for propiedad_id, inquilino_id, importe, ajuste in planes:
        k = contratos.crear(sesion, {**base, **ajuste, "propiedad_id": propiedad_id, "inquilino_id": inquilino_id,
                                     "fecha_inicio": inicio, "fecha_fin": sumar_meses(inicio, 24) - timedelta(days=1),
                                     "importe_inicial": importe}, usuario=USUARIO)
        contratos.agregar_concepto(sesion, k["id"], {"concepto": "expensas", "paga": "inquilino",
                                                     "descripcion": "Expensas ordinarias", "importe": None,
                                                     "activo": True})
        contratos.activar(sesion, k["id"])
        ids.append(k["id"])

    expensas = {}
    for k_id in ids:
        k = contratos.obtener(sesion, k_id)
        expensas[next(x["id"] for x in k["conceptos"] if x["concepto"] == "expensas")] = Decimal("85000")
    for meses in (-3, -2, -1, 0):
        cuotas.generar(sesion, _primero_del_mes(hoy, meses), variables=expensas)

    # Cobradas en término las tres primeras de cada contrato; la del mes pasado del último, atrasada y sin cobrar.
    for q in sorted(cuotas.buscar(sesion, estado="pendiente", limit=500), key=lambda x: x["periodo_desde"]):
        desde = q["periodo_desde"]
        if desde >= _primero_del_mes(hoy, -1) and (q["contrato_id"] == ids[2] or desde == _primero_del_mes(hoy, 0)):
            continue
        dia = min(q["fecha_vencimiento"], hoy)
        cobros.cobrar(sesion, q["id"], fecha=dia, medios=[{"medio_pago": "transferencia", "referencia": "",
                                                           "monto": Decimal(q["total"])}], usuario=USUARIO)

    gastos.registrar(sesion, propiedad_id=props[0], fecha=_primero_del_mes(hoy, -1), categoria="reparacion",
                     descripcion="Cambio del calefón", importe=Decimal("95000"), comprobante="FC B 0001-00001234",
                     usuario=USUARIO)
    fin_mes_pasado = _primero_del_mes(hoy, 0) - timedelta(days=1)
    liquidaciones.emitir(sesion, duenos[1], fecha=fin_mes_pasado, hasta=fin_mes_pasado, usuario=USUARIO)
    return {"sembrado": True, "propiedades": len(props), "contratos": len(ids)}


def main() -> int:
    db.inicializar()
    from libracore.db import core

    from app.config import Config

    core.configure(Config.desde_entorno().database_url)
    with db.fabrica_de_sesiones()() as sesion:
        print(sembrar(sesion))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
