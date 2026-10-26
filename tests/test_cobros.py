"""El cobro de una cuota (fase 1, tanda 2b).

Lo que se fija acá:
- dentro de la gracia no hay punitorio; después corre desde el vencimiento (cuenta del motor), y se puede condonar;
- los medios de pago tienen que sumar el total;
- el haber del inquilino salda su cuenta y cada titular recibe su parte (al centavo), con el punitorio si es suyo;
- el recibo es del motor, «por cuenta y orden de» los titulares, y se imprime;
- anular el cobro revierte todo y deja la cuota pendiente para volver a cobrarla.
"""

from __future__ import annotations

import io
from decimal import Decimal

import pytest
from libracore.db import libro_de_terceros as libro
from pypdf import PdfReader

from app.servicios.cobros import repartir


def _cliente(c, nombre):
    return c.post("/api/clientes", json={"name": nombre, "cuit_dni": ""}).json()["id"]


@pytest.fixture
def escena(admin):
    p = admin.post("/api/propiedades", json={"tipo": "departamento", "direccion": "Calle Inventada 123",
                                              "unidad": "3° B"}).json()
    uno, dos = _cliente(admin, "Dueña Uno"), _cliente(admin, "Dueño Dos")
    admin.put(f"/api/propiedades/{p['id']}/titulares",
              json=[{"cliente_id": uno, "porcentaje": "60"}, {"cliente_id": dos, "porcentaje": "40"}])
    inq = _cliente(admin, "Inquilina Ficticia")
    k = admin.post("/api/contratos", json={
        "propiedad_id": p["id"], "inquilino_id": inq, "fecha_inicio": "2026-11-01", "fecha_fin": "2028-10-31",
        "importe_inicial": "300000", "dia_vencimiento": 10, "dias_gracia": 3, "punitorio_tasa": "0.1",
        "punitorio_base": "diaria", "punitorio_para": "propietario"}).json()
    admin.post(f"/api/contratos/{k['id']}/conceptos", json={"concepto": "seguro", "paga": "inquilino",
                                                             "importe": "5000"})
    admin.post(f"/api/contratos/{k['id']}/activar")
    return {"contrato": k["id"], "inquilina": inq, "uno": uno, "dos": dos}


def _cuota(c, ancla):
    return c.post("/api/cuotas/generar", json={"ancla": ancla}).json()["generadas"][0]


def _saldo(tercero, rol):
    return Decimal(str(libro.saldo(tercero, rol)))


EFECTIVO = lambda monto: [{"medio_pago": "efectivo", "monto": monto}]  # noqa: E731


def test_dentro_de_la_gracia_no_hay_punitorio_y_se_reparte(admin, escena):
    q = _cuota(admin, "2026-11-05")
    assert q["total"] == "305000.00"
    p = admin.get(f"/api/cuotas/{q['id']}/cobro", params={"fecha": "2026-11-13"}).json()
    assert (p["punitorio"], p["total"]) == ("0.00", "305000.00")
    r = admin.post(f"/api/cuotas/{q['id']}/cobrar", json={"fecha": "2026-11-13", "medios": EFECTIVO("305000")})
    assert r.status_code == 201, r.text
    cobro = r.json()
    assert cobro["recibo"]["numero"] == 1
    assert cobro["recibo"]["concepto"] == ("Alquiler noviembre 2026, Calle Inventada 123 3° B (C-000001), por cuenta "
                                           "y orden de Dueña Uno y Dueño Dos")
    assert sorted((x["propietario_nombre"], x["tipo"], x["importe"]) for x in cobro["imputaciones"]) == [
        ("Dueña Uno", "alquiler", "180000.00"), ("Dueña Uno", "concepto", "3000.00"),
        ("Dueño Dos", "alquiler", "120000.00"), ("Dueño Dos", "concepto", "2000.00")]
    assert _saldo(escena["inquilina"], "inquilino") == 0
    assert _saldo(escena["uno"], "propietario") == Decimal("-183000")      # haber: se le debe
    assert _saldo(escena["dos"], "propietario") == Decimal("-122000")
    assert admin.get(f"/api/cuotas/{q['id']}").json()["estado"] == "cobrada"
    assert admin.post(f"/api/cuotas/{q['id']}/cobrar", json={"fecha": "2026-11-13",
                                                             "medios": EFECTIVO("305000")}).status_code == 409


def test_con_atraso_corre_el_punitorio_desde_el_vencimiento(admin, escena):
    q = _cuota(admin, "2026-12-05")
    p = admin.get(f"/api/cuotas/{q['id']}/cobro", params={"fecha": "2026-12-20"}).json()
    assert (p["dias_de_atraso"], p["punitorio"], p["total"]) == (10, "3050.00", "308050.00")
    r = admin.post(f"/api/cuotas/{q['id']}/cobrar", json={"fecha": "2026-12-20", "medios": EFECTIVO("305000")})
    assert r.status_code == 422 and "suman 305000" in r.text
    medios = [{"medio_pago": "transferencia", "referencia": "op 123", "monto": "300000"},
              {"medio_pago": "efectivo", "monto": "8050"}]
    cobro = admin.post(f"/api/cuotas/{q['id']}/cobrar", json={"fecha": "2026-12-20", "medios": medios}).json()
    assert (cobro["punitorio"], cobro["total"]) == ("3050.00", "308050.00")
    assert "con punitorio por 10 días" in cobro["recibo"]["concepto"]
    punitorios = sorted((x["propietario_nombre"], x["importe"]) for x in cobro["imputaciones"]
                        if x["tipo"] == "punitorio")
    assert punitorios == [("Dueña Uno", "1830.00"), ("Dueño Dos", "1220.00")]
    assert _saldo(escena["inquilina"], "inquilino") == 0


def test_el_punitorio_se_puede_condonar(admin, escena):
    q = _cuota(admin, "2026-12-05")
    cobro = admin.post(f"/api/cuotas/{q['id']}/cobrar", json={"fecha": "2026-12-20", "medios": EFECTIVO("305000"),
                                                              "condonar_punitorio": True}).json()
    assert (cobro["punitorio"], cobro["punitorio_condonado"], cobro["dias_de_atraso"]) == ("0.00", "3050.00", 10)
    assert not [x for x in cobro["imputaciones"] if x["tipo"] == "punitorio"]


def test_anular_revierte_todo_y_se_vuelve_a_cobrar(admin, escena):
    q = _cuota(admin, "2026-11-05")
    cobro = admin.post(f"/api/cuotas/{q['id']}/cobrar", json={"fecha": "2026-11-13",
                                                              "medios": EFECTIVO("305000")}).json()
    assert admin.post(f"/api/cobros/{cobro['id']}/anular", json={"motivo": " "}).status_code == 422
    r = admin.post(f"/api/cobros/{cobro['id']}/anular", json={"motivo": "Rebotó la transferencia"})
    assert r.status_code == 200 and r.json()["anulado"] is True and r.json()["recibo"]["anulado"] is True
    assert admin.post(f"/api/cobros/{cobro['id']}/anular", json={"motivo": "otra"}).status_code == 409
    assert _saldo(escena["inquilina"], "inquilino") == Decimal("305000")
    assert _saldo(escena["uno"], "propietario") == 0 and _saldo(escena["dos"], "propietario") == 0
    assert admin.get(f"/api/cuotas/{q['id']}").json()["estado"] == "pendiente"
    r = admin.post(f"/api/cuotas/{q['id']}/cobrar", json={"fecha": "2026-11-13", "medios": EFECTIVO("305000")})
    assert r.status_code == 201, r.text
    otro = r.json()
    assert otro["recibo"]["numero"] == 2
    assert [x["id"] for x in admin.get("/api/cobros").json()] == [otro["id"]]
    assert len(admin.get("/api/cobros", params={"incluir_anulados": True}).json()) == 2


def test_el_recibo_se_imprime(admin, escena):
    q = _cuota(admin, "2026-11-05")
    cobro = admin.post(f"/api/cuotas/{q['id']}/cobrar", json={"fecha": "2026-11-13",
                                                              "medios": EFECTIVO("305000")}).json()
    r = admin.get(f"/api/cobros/{cobro['id']}/recibo.pdf")
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    texto = " ".join(p.extract_text() for p in PdfReader(io.BytesIO(r.content)).pages).replace("\n", " ")
    assert "Inquilina Ficticia" in texto and "por cuenta y orden de Dueña Uno y Dueño Dos" in texto


@pytest.mark.parametrize("medios, mensaje", [
    ([{"medio_pago": "cuenta_corriente", "monto": "305000"}], "inválido"),
    ([], "List should have at least 1 item"),
])
def test_medios_invalidos(admin, escena, medios, mensaje):
    q = _cuota(admin, "2026-11-05")
    r = admin.post(f"/api/cuotas/{q['id']}/cobrar", json={"fecha": "2026-11-13", "medios": medios})
    assert r.status_code == 422 and mensaje in r.text


def test_no_se_cobra_antes_de_emitir_ni_una_cuota_anulada(admin, escena):
    q = _cuota(admin, "2026-11-05")
    assert admin.post(f"/api/cuotas/{q['id']}/cobrar", json={"fecha": "2026-10-31",
                                                             "medios": EFECTIVO("305000")}).status_code == 422
    admin.post(f"/api/cuotas/{q['id']}/anular", json={"motivo": "mal cargada"})
    assert admin.get(f"/api/cuotas/{q['id']}/cobro").status_code == 409
    assert admin.get("/api/cobros/99999").status_code == 404


@pytest.mark.parametrize("importe, partes, esperado", [
    ("100.00", [("a", "33.33"), ("b", "33.33"), ("c", "33.34")], ["33.33", "33.33", "33.34"]),
    ("305000", [("a", "60"), ("b", "40")], ["183000.00", "122000.00"]),
    ("0.01", [("a", "50"), ("b", "50")], ["0.01", "0.00"]),
    ("1000.00", [("a", "66.67"), ("b", "33.33")], ["666.70", "333.30"]),
])
def test_el_reparto_cierra_al_centavo(importe, partes, esperado):
    r = repartir(Decimal(importe), [(k, Decimal(v)) for k, v in partes])
    assert [str(x[1].quantize(Decimal("0.01"))) for x in r] == esperado
    assert sum(x[1] for x in r) == Decimal(importe)
