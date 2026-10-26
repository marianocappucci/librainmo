"""Contratos de locación (fase 1, tanda 1).

Lo que se fija acá:
- el alta nace en borrador, numera `C-000001` y abre el precio inicial desde `fecha_inicio`;
- las reglas del ajuste: índice del catálogo del motor, porcentaje con periodicidad, «fijo» sin nada de eso;
- un borrador se edita entero (también su importe); uno vigente sólo sus observaciones;
- activar exige titulares completos y que la propiedad no tenga otro vigente, y la pasa a «alquilada»;
- rescindir y finalizar la devuelven a «disponible»;
- el precio con vigencia cierra el anterior el día antes;
- garantías y conceptos se cargan aparte, y no en un contrato cerrado.
"""

from __future__ import annotations

import pytest


def _cliente(c, nombre):
    r = c.post("/api/clientes", json={"name": nombre, "cuit_dni": ""})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


@pytest.fixture
def escena(admin):
    """Una propiedad con su dueña al 100 % y una inquilina, todas ficticias."""
    p = admin.post("/api/propiedades", json={"tipo": "departamento", "direccion": "Calle Inventada 123"}).json()
    duena = _cliente(admin, "Dueña Ficticia")
    admin.put(f"/api/propiedades/{p['id']}/titulares", json=[{"cliente_id": duena, "porcentaje": "100"}])
    return {"propiedad": p["id"], "duena": duena, "inquilina": _cliente(admin, "Inquilina Ficticia")}


def _contrato(c, escena, **extra):
    datos = {"propiedad_id": escena["propiedad"], "inquilino_id": escena["inquilina"], "fecha_inicio": "2026-11-01",
             "fecha_fin": "2028-10-31", "importe_inicial": "450000", "dia_vencimiento": 10, "dias_gracia": 3,
             "comision_pct": "5", **extra}
    r = c.post("/api/contratos", json=datos)
    assert r.status_code == 201, r.text
    return r.json()


def test_el_alta_nace_en_borrador_con_su_precio(admin, escena):
    c = _contrato(admin, escena)
    assert (c["numero"], c["estado"], c["inquilino_nombre"]) == ("C-000001", "borrador", "Inquilina Ficticia")
    assert c["importe_vigente"] == "450000.00" and c["precio_vigente_desde"] == "2026-11-01"
    assert [(p["vigencia_desde"], p["motivo"]) for p in c["precios"]] == [("2026-11-01", "inicial")]


@pytest.mark.parametrize("extra, mensaje", [
    ({"metodo_ajuste": "indice"}, "cuál y cada cuánto"),
    ({"metodo_ajuste": "indice", "indice_ajuste": "ipc_rosario", "periodicidad_ajuste": "trimestral"}, "inválido"),
    ({"metodo_ajuste": "porcentaje", "porcentaje_ajuste": "10"}, "cuánto y cada cuánto"),
    ({"indice_ajuste": "icl"}, "no lleva índice"),
    ({"fecha_fin": "2026-01-01"}, "anterior a la de inicio"),
    ({"inquilino_id": 99999}, "no existe"),
])
def test_las_reglas_del_alta(admin, escena, extra, mensaje):
    datos = {"propiedad_id": escena["propiedad"], "inquilino_id": escena["inquilina"], "fecha_inicio": "2026-11-01",
             "fecha_fin": "2028-10-31", "importe_inicial": "450000", **extra}
    r = admin.post("/api/contratos", json=datos)
    assert r.status_code == 422 and mensaje in r.text, r.text


def test_un_contrato_por_icl_trimestral(admin, escena):
    c = _contrato(admin, escena, metodo_ajuste="indice", indice_ajuste="icl", periodicidad_ajuste="trimestral")
    assert c["indice_ajuste_nombre"].startswith("Índice para Contratos de Locación")


def test_el_borrador_se_edita_entero_y_el_vigente_no(admin, escena):
    c = _contrato(admin, escena)
    r = admin.put(f"/api/contratos/{c['id']}", json={"importe_inicial": "480000", "fecha_inicio": "2026-12-01"})
    assert r.status_code == 200, r.text
    assert (r.json()["importe_vigente"], r.json()["precio_vigente_desde"]) == ("480000.00", "2026-12-01")
    assert admin.post(f"/api/contratos/{c['id']}/activar").status_code == 200
    assert admin.put(f"/api/contratos/{c['id']}", json={"dias_gracia": 5}).status_code == 409
    assert admin.put(f"/api/contratos/{c['id']}", json={"observaciones": "Paga por transferencia"}).status_code == 200


def test_activar_pide_titulares_completos_y_un_solo_vigente(admin, escena):
    c = _contrato(admin, escena)
    admin.put(f"/api/propiedades/{escena['propiedad']}/titulares",
              json=[{"cliente_id": escena["duena"], "porcentaje": "100"}])
    r = admin.post(f"/api/contratos/{c['id']}/activar")
    assert r.status_code == 200 and r.json()["estado"] == "vigente"
    ficha = admin.get(f"/api/propiedades/{escena['propiedad']}").json()
    assert ficha["estado"] == "alquilada" and ficha["contrato_vigente"]["numero"] == "C-000001"

    otro = _contrato(admin, escena)
    r = admin.post(f"/api/contratos/{otro['id']}/activar")
    assert r.status_code == 409 and "C-000001" in r.text
    assert admin.post(f"/api/contratos/{c['id']}/activar").status_code == 409


def test_sin_titulares_no_se_activa(admin):
    p = admin.post("/api/propiedades", json={"tipo": "casa", "direccion": "Pasaje Ficticio 4"}).json()
    inq = _cliente(admin, "Otro Inquilino")
    c = admin.post("/api/contratos", json={"propiedad_id": p["id"], "inquilino_id": inq, "fecha_inicio": "2026-11-01",
                                           "fecha_fin": "2027-10-31", "importe_inicial": "300000"}).json()
    r = admin.post(f"/api/contratos/{c['id']}/activar")
    assert r.status_code == 409 and "titulares" in r.text


def test_rescindir_y_finalizar_liberan_la_propiedad(admin, escena):
    c = _contrato(admin, escena)
    admin.post(f"/api/contratos/{c['id']}/activar")
    assert admin.post(f"/api/contratos/{c['id']}/finalizar").status_code == 409     # todavía no terminó
    assert admin.post(f"/api/contratos/{c['id']}/rescindir", json={"fecha": "2030-01-01"}).status_code == 422
    r = admin.post(f"/api/contratos/{c['id']}/rescindir", json={"fecha": "2027-03-31", "observaciones": "Mudanza"})
    assert r.status_code == 200 and r.json()["estado"] == "rescindido"
    assert r.json()["fecha_rescision"] == "2027-03-31"
    assert admin.get(f"/api/propiedades/{escena['propiedad']}").json()["estado"] == "disponible"
    assert admin.delete(f"/api/contratos/{c['id']}").status_code == 409            # queda en el historial


def test_el_borrador_se_borra(admin, escena):
    c = _contrato(admin, escena)
    assert admin.delete(f"/api/contratos/{c['id']}").status_code == 204
    assert admin.get(f"/api/contratos/{c['id']}").status_code == 404


def test_el_precio_con_vigencia(admin, escena):
    c = _contrato(admin, escena)
    assert admin.post(f"/api/contratos/{c['id']}/precios",
                      json={"importe": "500000", "vigencia_desde": "2027-02-01"}).status_code == 409   # borrador
    admin.post(f"/api/contratos/{c['id']}/activar")
    r = admin.post(f"/api/contratos/{c['id']}/precios", json={"importe": "500000", "vigencia_desde": "2026-11-01"})
    assert r.status_code == 409
    r = admin.post(f"/api/contratos/{c['id']}/precios", json={"importe": "500000", "vigencia_desde": "2027-02-01"})
    assert r.status_code == 201, r.text
    assert [(p["vigencia_desde"], p["vigencia_hasta"], p["motivo"]) for p in r.json()["precios"]] == [
        ("2027-02-01", None, "manual"), ("2026-11-01", "2027-01-31", "inicial")]
    assert r.json()["importe_vigente"] == "500000.00"


def test_garantias_y_conceptos(admin, escena):
    c = _contrato(admin, escena)
    garante = _cliente(admin, "Garante Ficticio")
    r = admin.post(f"/api/contratos/{c['id']}/garantias",
                   json={"tipo": "propietaria", "garante_id": garante, "descripcion": "Casa en Ciudad Ficticia"})
    assert r.status_code == 201 and r.json()["garantias"][0]["garante_nombre"] == "Garante Ficticio"
    assert admin.post(f"/api/contratos/{c['id']}/garantias", json={"tipo": "promesa"}).status_code == 422
    r = admin.post(f"/api/contratos/{c['id']}/conceptos",
                   json={"concepto": "expensas", "paga": "inquilino", "descripcion": "Expensas ordinarias"})
    assert r.status_code == 201
    expensas = r.json()["conceptos"][0]
    assert expensas["importe"] is None                                    # variable: se carga cada mes
    r = admin.post(f"/api/contratos/{c['id']}/conceptos", json={"concepto": "abl", "paga": "propietario",
                                                                "importe": "18000"})
    assert [x["paga"] for x in r.json()["conceptos"]] == ["inquilino", "propietario"]
    r = admin.put(f"/api/contratos/{c['id']}/conceptos/{expensas['id']}", json={"activo": False})
    assert r.json()["conceptos"][0]["activo"] is False

    admin.post(f"/api/contratos/{c['id']}/activar")
    admin.post(f"/api/contratos/{c['id']}/rescindir", json={"fecha": "2027-01-15"})
    assert admin.post(f"/api/contratos/{c['id']}/conceptos",
                      json={"concepto": "seguro", "paga": "inquilino"}).status_code == 409


def test_el_operador_administra_contratos(como, escena):
    assert _contrato(como("operador"), escena)["estado"] == "borrador"


# ── el servicio, sin la API: lo va a llamar la importación ─────────────────────────────────────────────────


@pytest.mark.parametrize("extra, mensaje", [
    ({"dia_vencimiento": 0}, "del 1 al 31"),
    ({"dias_gracia": -1}, "negativos"),
    ({"comision_pct": "120"}, "de 0 a 100"),
    ({"moneda": "EUR"}, "Moneda"),
    ({"punitorio_base": "anual"}, "Base del punitorio"),
    ({"metodo_ajuste": "porcentaje", "porcentaje_ajuste": "10", "periodicidad_ajuste": "trimestral",
      "indice_ajuste": "icl"}, "sólo va con"),
    ({"importe_inicial": "0"}, "mayor que cero"),
    ({"propiedad_id": 99999}, "no existe"),
])
def test_las_reglas_valen_sin_la_api(admin, escena, sesion, extra, mensaje):
    from datetime import date
    from decimal import Decimal

    from app.errores import Invalido
    from app.servicios import contratos as servicio

    datos = {"propiedad_id": escena["propiedad"], "inquilino_id": escena["inquilina"],
             "fecha_inicio": date(2026, 11, 1), "fecha_fin": date(2027, 10, 31), "importe_inicial": Decimal("1"),
             "moneda": "ARS", "dia_vencimiento": 10, "dias_gracia": 0, "metodo_ajuste": "fijo",
             "indice_ajuste": None, "porcentaje_ajuste": None, "periodicidad_ajuste": None, "punitorio_tasa": None,
             "punitorio_base": "diaria", "punitorio_para": "inmobiliaria", "comision_pct": Decimal("5"),
             "deposito": None, "observaciones": None}
    datos.update({k: (Decimal(v) if k in ("comision_pct", "importe_inicial", "porcentaje_ajuste") else v)
                  for k, v in extra.items()})
    with pytest.raises(Invalido, match=mensaje):
        servicio.crear(sesion, datos, usuario="test")


def test_la_busqueda_filtra(admin, escena):
    a = _contrato(admin, escena)
    otra = admin.post("/api/propiedades", json={"tipo": "local", "direccion": "Avenida Imaginaria 500"}).json()
    b = _contrato(admin, {**escena, "propiedad": otra["id"]})
    admin.put(f"/api/propiedades/{otra['id']}/titulares", json=[{"cliente_id": escena["duena"], "porcentaje": "100"}])
    admin.post(f"/api/contratos/{b['id']}/activar")
    numeros = lambda **f: [c["numero"] for c in admin.get("/api/contratos", params=f).json()]  # noqa: E731
    assert numeros() == [b["numero"], a["numero"]]
    assert numeros(estado="vigente") == [b["numero"]]
    assert numeros(propiedad_id=escena["propiedad"]) == [a["numero"]]
    assert numeros(inquilino_id=escena["inquilina"]) == [b["numero"], a["numero"]]
    assert numeros(q="imaginaria") == [b["numero"]]
    assert numeros(q=a["numero"]) == [a["numero"]]
    assert [p["codigo"] for p in admin.get("/api/propiedades", params={"estado": "alquilada"}).json()] == [
        otra["codigo"]]


def test_finalizar_cuando_termino(admin, escena, monkeypatch):
    from tests.ayudas import fijar_ahora

    c = _contrato(admin, escena, fecha_inicio="2025-01-01", fecha_fin="2026-06-30")
    admin.post(f"/api/contratos/{c['id']}/activar")
    fijar_ahora(monkeypatch, "2026-07-01T15:00:00+00:00")
    r = admin.post(f"/api/contratos/{c['id']}/finalizar")
    assert r.status_code == 200 and r.json()["estado"] == "finalizado"
    assert admin.post(f"/api/contratos/{c['id']}/finalizar").status_code == 409
    assert admin.post(f"/api/contratos/{c['id']}/rescindir", json={"fecha": "2026-01-01"}).status_code == 409
    assert admin.get(f"/api/propiedades/{escena['propiedad']}").json()["estado"] == "disponible"


def test_lo_que_no_existe_es_404(admin, escena):
    c = _contrato(admin, escena)
    assert admin.get("/api/contratos/99999").status_code == 404
    assert admin.get("/api/propiedades/99999").status_code == 404
    assert admin.delete(f"/api/contratos/{c['id']}/garantias/99999").status_code == 404
    assert admin.put(f"/api/contratos/{c['id']}/conceptos/99999", json={"activo": False}).status_code == 404


def test_quitar_una_garantia_y_conceptos_invalidos(admin, escena):
    c = _contrato(admin, escena)
    g = admin.post(f"/api/contratos/{c['id']}/garantias", json={"tipo": "caucion", "descripcion": "Póliza 1"}).json()
    r = admin.delete(f"/api/contratos/{c['id']}/garantias/{g['garantias'][0]['id']}")
    assert r.status_code == 200 and r.json()["garantias"] == []
    assert admin.post(f"/api/contratos/{c['id']}/conceptos", json={"concepto": "luz", "paga": "inquilino"}) \
        .status_code == 422
    assert admin.post(f"/api/contratos/{c['id']}/conceptos", json={"concepto": "abl", "paga": "vecino"}) \
        .status_code == 422
    assert admin.post(f"/api/contratos/{c['id']}/conceptos",
                      json={"concepto": "abl", "paga": "propietario", "importe": "0"}).status_code == 422
    x = admin.post(f"/api/contratos/{c['id']}/conceptos", json={"concepto": "abl", "paga": "propietario"}).json()
    assert admin.put(f"/api/contratos/{c['id']}/conceptos/{x['conceptos'][0]['id']}",
                     json={"importe": "-5"}).status_code == 422


def test_un_borrador_no_cambia_a_un_inquilino_o_propiedad_que_no_existen(admin, escena):
    c = _contrato(admin, escena)
    assert admin.put(f"/api/contratos/{c['id']}", json={"inquilino_id": 99999}).status_code == 422
    assert admin.put(f"/api/contratos/{c['id']}", json={"propiedad_id": 99999}).status_code == 422
    assert admin.put(f"/api/contratos/{c['id']}", json={"importe_inicial": "-1"}).status_code == 422


def test_no_se_activa_sobre_una_propiedad_vendida(admin, escena):
    c = _contrato(admin, escena)
    admin.put(f"/api/propiedades/{escena['propiedad']}", json={"estado": "vendida"})
    r = admin.post(f"/api/contratos/{c['id']}/activar")
    assert r.status_code == 409 and "vendida" in r.text


def test_el_precio_nuevo_no_empieza_despues_del_fin(admin, escena):
    c = _contrato(admin, escena)
    admin.post(f"/api/contratos/{c['id']}/activar")
    r = admin.post(f"/api/contratos/{c['id']}/precios", json={"importe": "1", "vigencia_desde": "2030-01-01"})
    assert r.status_code == 422
