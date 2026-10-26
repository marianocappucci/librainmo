"""El devengado mensual y el ajuste (fase 1, tanda 2a).

Lo que se fija acá:
- previsualizar no escribe; generar escribe una vez (idempotente) y deja el cargo en la cuenta del inquilino;
- el primer mes se prorratea por días y **no vence antes de emitirse**;
- los conceptos del inquilino van en la cuota: los fijos solos, los variables con el importe que se cargue;
- a una cuota pendiente se le agrega un cargo (y su asiento se corrige); anularla la contraasienta y libera el mes;
- un ajuste pendiente bloquea la cuota hasta aplicarlo; por índice toma los valores del motor y por porcentaje
  compone los períodos que pasaron;
- sin el valor del índice y sin fuente, 409 con las fechas que faltan.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from libracore import indices_descarga
from libracore.db import indices_ajuste as valores
from libracore.db import libro_de_terceros as libro


@pytest.fixture(autouse=True)
def _sin_red(monkeypatch):
    def caida(url, params):
        raise indices_descarga.FuenteNoDisponible("sin red en los tests")
    monkeypatch.setattr(indices_descarga, "_obtener_http", caida)


def _cliente(c, nombre):
    return c.post("/api/clientes", json={"name": nombre, "cuit_dni": ""}).json()["id"]


def _vigente(c, *, inicio="2026-11-20", fin="2028-11-19", importe="300000", conceptos=(), **extra):
    p = c.post("/api/propiedades", json={"tipo": "departamento", "direccion": "Calle Inventada 123"}).json()
    duena = _cliente(c, "Dueña Ficticia")
    c.put(f"/api/propiedades/{p['id']}/titulares", json=[{"cliente_id": duena, "porcentaje": "100"}])
    inq = _cliente(c, "Inquilina Ficticia")
    k = c.post("/api/contratos", json={"propiedad_id": p["id"], "inquilino_id": inq, "fecha_inicio": inicio,
                                       "fecha_fin": fin, "importe_inicial": importe, "dia_vencimiento": 10,
                                       **extra}).json()
    for x in conceptos:
        c.post(f"/api/contratos/{k['id']}/conceptos", json=x)
    assert c.post(f"/api/contratos/{k['id']}/activar").status_code == 200
    return c.get(f"/api/contratos/{k['id']}").json()


def _saldo_inquilino(contrato):
    return Decimal(str(libro.saldo(contrato["inquilino_id"], "inquilino")))


EXPENSAS = {"concepto": "expensas", "paga": "inquilino", "descripcion": "Expensas ordinarias"}
SEGURO = {"concepto": "seguro", "paga": "inquilino", "importe": "5000"}
ABL_DUENA = {"concepto": "abl", "paga": "propietario", "importe": "18000"}


def test_el_primer_mes_se_prorratea_y_no_vence_antes_de_emitirse(admin):
    k = _vigente(admin, conceptos=(EXPENSAS, SEGURO, ABL_DUENA))
    r = admin.post("/api/cuotas/previsualizar", json={"ancla": "2026-11-25"}).json()
    assert r["ya_generadas"] == [] and r["bloqueadas"] == []
    p = r["propuestas"][0]
    assert (p["periodo_desde"], p["periodo_hasta"], p["dias_cubiertos"], p["dias_del_periodo"]) == (
        "2026-11-20", "2026-11-30", 11, 30)
    assert p["alquiler"] == "110000.00" and p["prorrateada"] is True
    assert (p["fecha_emision"], p["fecha_vencimiento"]) == ("2026-11-20", "2026-11-20")
    assert [x["descripcion"] for x in p["conceptos"]] == ["Seguro"]                  # el ABL lo paga la dueña
    assert [x["descripcion"] for x in p["variables"]] == ["Expensas ordinarias"]
    assert admin.get("/api/cuotas").json() == []                                       # previsualizar no escribe


def test_generar_escribe_una_vez_con_su_cargo(admin):
    k = _vigente(admin, conceptos=(EXPENSAS, SEGURO))
    expensas = next(x for x in k["conceptos"] if x["concepto"] == "expensas")
    r = admin.post("/api/cuotas/generar", json={"ancla": "2026-11-25", "variables": {str(expensas["id"]): "42000"}})
    assert r.status_code == 200, r.text
    q = r.json()["generadas"][0]
    assert q["total"] == "157000.00" and q["estado"] == "pendiente"
    assert [x["descripcion"] for x in q["lineas"]] == ["Alquiler noviembre 2026 (11/30 días)", "Seguro",
                                                       "Expensas ordinarias"]
    assert _saldo_inquilino(k) == Decimal("157000")
    assert admin.post("/api/cuotas/generar", json={"ancla": "2026-11-02"}).json()["generadas"] == []
    prev = admin.post("/api/cuotas/previsualizar", json={"ancla": "2026-11-25"}).json()
    assert prev["propuestas"] == [] and prev["ya_generadas"][0]["cuota_id"] == q["id"]


def test_un_cargo_mas_y_anular(admin):
    k = _vigente(admin, inicio="2026-11-01", conceptos=(EXPENSAS,))
    expensas = next(x for x in k["conceptos"] if x["concepto"] == "expensas")
    q = admin.post("/api/cuotas/generar", json={"ancla": "2026-12-05"}).json()["generadas"][0]
    assert (q["total"], q["fecha_vencimiento"]) == ("300000.00", "2026-12-10")
    r = admin.post(f"/api/cuotas/{q['id']}/lineas", json={"concepto_id": expensas["id"], "importe": "45000"})
    assert r.status_code == 201 and r.json()["total"] == "345000.00"
    assert _saldo_inquilino(k) == Decimal("345000")
    assert admin.post(f"/api/cuotas/{q['id']}/lineas",
                      json={"concepto_id": expensas["id"], "importe": "1"}).status_code == 409
    assert admin.post(f"/api/cuotas/{q['id']}/lineas", json={"importe": "1"}).status_code == 422   # sin descripción
    assert admin.post(f"/api/cuotas/{q['id']}/anular", json={"motivo": " "}).status_code == 422
    r = admin.post(f"/api/cuotas/{q['id']}/anular", json={"motivo": "Se cargó mal el mes"})
    assert r.status_code == 200 and r.json()["estado"] == "anulada"
    assert _saldo_inquilino(k) == 0
    assert admin.post(f"/api/cuotas/{q['id']}/anular", json={"motivo": "otra vez"}).status_code == 409
    nueva = admin.post("/api/cuotas/generar", json={"ancla": "2026-12-05"}).json()["generadas"]
    assert len(nueva) == 1 and nueva[0]["id"] != q["id"]                             # el mes se libera


def test_la_rescision_corta_el_ultimo_mes(admin):
    k = _vigente(admin, inicio="2026-11-01")
    admin.post(f"/api/contratos/{k['id']}/rescindir", json={"fecha": "2027-01-15"})
    q = admin.post("/api/cuotas/generar", json={"ancla": "2027-01-20"}).json()["generadas"][0]
    assert (q["periodo_hasta"], q["dias_cubiertos"], q["total"]) == ("2027-01-15", 15, "145161.29")
    assert admin.post("/api/cuotas/generar", json={"ancla": "2027-02-10"}).json()["generadas"] == []


def test_un_ajuste_por_icl_pendiente_bloquea_la_cuota(admin):
    k = _vigente(admin, inicio="2026-11-01", metodo_ajuste="indice", indice_ajuste="icl",
                 periodicidad_ajuste="trimestral")
    admin.post("/api/cuotas/generar", json={"ancla": "2027-01-05"})
    r = admin.post("/api/cuotas/previsualizar", json={"ancla": "2027-02-05"}).json()
    assert r["propuestas"] == [] and "01-02-2027" in r["bloqueadas"][0]["motivo"]
    assert admin.post("/api/cuotas/generar", json={"ancla": "2027-02-05"}).json()["generadas"] == []

    falta = admin.get(f"/api/contratos/{k['id']}/ajuste", params={"fecha": "2027-02-05"})
    assert falta.status_code == 409 and falta.json()["detail"]["fechas_faltantes"] == ["2026-11-01", "2027-02-01"]

    valores.guardar("icl", "2026-11-01", "37.20", "bcra")
    valores.guardar("icl", "2027-02-01", "39.06", "bcra")
    p = admin.get(f"/api/contratos/{k['id']}/ajuste", params={"fecha": "2027-02-05"}).json()
    assert p["corresponde"] is True and p["ajuste"]["importe_nuevo"] == "315000.00"
    assert [v["fecha"] for v in p["ajuste"]["valores"]] == ["2026-11-01", "2027-02-01"]
    r = admin.post(f"/api/contratos/{k['id']}/ajuste", json={"fecha_ajuste": "2027-02-01"})
    assert r.status_code == 201, r.text
    assert r.json()["contrato"]["precios"][0]["motivo"] == "ajuste_indice:icl"
    q = admin.post("/api/cuotas/generar", json={"ancla": "2027-02-05"}).json()["generadas"][0]
    assert q["total"] == "315000.00"
    otra = admin.get(f"/api/contratos/{k['id']}/ajuste", params={"fecha": "2027-03-01"}).json()
    assert (otra["corresponde"], otra["motivo"], otra["proximo_ajuste"]) == (False, "ya_ajustado", "2027-05-01")


def test_por_porcentaje_compone_los_periodos_que_pasaron(admin):
    k = _vigente(admin, inicio="2026-11-01", importe="100000", metodo_ajuste="porcentaje",
                 porcentaje_ajuste="10", periodicidad_ajuste="trimestral")
    assert admin.get(f"/api/contratos/{k['id']}/ajuste", params={"fecha": "2026-12-01"}).json()["motivo"] == \
        "primer_periodo"
    p = admin.get(f"/api/contratos/{k['id']}/ajuste", params={"fecha": "2027-05-10"}).json()
    assert p["fecha_ajuste"] == "2027-05-01"
    assert (p["ajuste"]["periodos"], p["ajuste"]["importe_nuevo"]) == (2, "121000.00")   # se salteó febrero
    assert admin.post(f"/api/contratos/{k['id']}/ajuste", json={"fecha_ajuste": "2027-02-01"}).status_code == 201
    p = admin.get(f"/api/contratos/{k['id']}/ajuste", params={"fecha": "2027-05-10"}).json()
    assert (p["ajuste"]["periodos"], p["ajuste"]["importe_nuevo"]) == (1, "121000.00")


def test_un_contrato_fijo_no_tiene_ajuste(admin):
    k = _vigente(admin)
    assert admin.get(f"/api/contratos/{k['id']}/ajuste").status_code == 422
    assert admin.get("/api/cuotas/99999").status_code == 404


def test_la_busqueda_de_cuotas(admin):
    k = _vigente(admin, inicio="2026-11-01")
    for ancla in ("2026-11-05", "2026-12-05", "2027-01-05"):
        admin.post("/api/cuotas/generar", json={"ancla": ancla})
    desde = [q["periodo_desde"] for q in admin.get("/api/cuotas", params={"contrato_id": k["id"]}).json()]
    assert desde == ["2027-01-01", "2026-12-01", "2026-11-01"]
    assert len(admin.get("/api/cuotas", params={"desde": "2026-12-01", "hasta": "2026-12-31"}).json()) == 1
    assert len(admin.get("/api/cuotas", params={"estado": "pendiente"}).json()) == 3
