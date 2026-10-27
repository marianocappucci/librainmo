"""Los huecos que encontró la documentación de la landing (2026-10-27).

Lo que se fija acá:
- un contrato en dólares se devenga, se cobra, se recibe y se liquida en dólares: la cuenta y la liquidación de un
  propietario con contratos en las dos monedas no las suman (ADR-088 del motor);
- un ajuste que cae a mitad de mes bloquea la cuota de ese mes y, aplicado, la prorratea por días entre los dos precios;
- un concepto que paga el propietario con importe fijo es un gasto por su cuenta al generar la cuota; sin importe, se
  lista para cargarlo; el gasto se anula con su cuota y no suelto.
"""

from __future__ import annotations

import io
from decimal import Decimal

import pytest
from libracore import indices_descarga
from libracore.db import libro_de_terceros as libro
from pypdf import PdfReader


@pytest.fixture(autouse=True)
def _sin_red(monkeypatch):
    def caida(url, params):
        raise indices_descarga.FuenteNoDisponible("sin red en los tests")
    monkeypatch.setattr(indices_descarga, "_obtener_http", caida)


def _cliente(c, nombre):
    return c.post("/api/clientes", json={"name": nombre, "cuit_dni": ""}).json()["id"]


def _contrato(c, duena, *, direccion, importe, inicio="2026-11-01", fin="2028-10-31", conceptos=(), **extra):
    p = c.post("/api/propiedades", json={"tipo": "departamento", "direccion": direccion}).json()
    c.put(f"/api/propiedades/{p['id']}/titulares", json=[{"cliente_id": duena, "porcentaje": "100"}])
    inq = _cliente(c, f"Inquilino de {direccion}")
    k = c.post("/api/contratos", json={"propiedad_id": p["id"], "inquilino_id": inq, "fecha_inicio": inicio,
                                       "fecha_fin": fin, "importe_inicial": importe, "dia_vencimiento": 10,
                                       "comision_pct": "5", **extra})
    assert k.status_code == 201, k.text
    k = k.json()
    for x in conceptos:
        assert c.post(f"/api/contratos/{k['id']}/conceptos", json=x).status_code == 201
    assert c.post(f"/api/contratos/{k['id']}/activar").status_code == 200
    return {**c.get(f"/api/contratos/{k['id']}").json(), "propiedad_id": p["id"]}


def _cuota_de(c, ancla, contrato_id):
    generadas = c.post("/api/cuotas/generar", json={"ancla": ancla}).json()["generadas"]
    return next(q for q in generadas if q["contrato_id"] == contrato_id)


# ── la moneda ─────────────────────────────────────────────────────────────────────────────────────────────


def test_un_contrato_en_dolares_no_se_suma_con_los_de_pesos(admin):
    duena = _cliente(admin, "Dueña Ficticia")
    pesos = _contrato(admin, duena, direccion="Calle Inventada 100", importe="300000")
    dolares = _contrato(admin, duena, direccion="Calle Inventada 200", importe="800", moneda="USD")

    generadas = {q["contrato_id"]: q for q in admin.post("/api/cuotas/generar",
                                                          json={"ancla": "2026-11-05"}).json()["generadas"]}
    qd = generadas[dolares["id"]]
    assert (qd["moneda"], qd["total"]) == ("USD", "800.00")
    assert Decimal(str(libro.saldo(dolares["inquilino_id"], "inquilino", moneda="USD"))) == 800
    assert Decimal(str(libro.saldo(dolares["inquilino_id"], "inquilino", moneda="ARS"))) == 0

    cobro = admin.post(f"/api/cuotas/{qd['id']}/cobrar", json={
        "fecha": "2026-11-09", "medios": [{"medio_pago": "transferencia", "monto": "800"}]})
    assert cobro.status_code == 201, cobro.text
    assert cobro.json()["moneda"] == "USD"
    pdf = admin.get(f"/api/cobros/{cobro.json()['id']}/recibo.pdf").content
    assert "US$ 800,00" in "\n".join(x.extract_text() for x in PdfReader(io.BytesIO(pdf)).pages)
    assert admin.post(f"/api/cuotas/{generadas[pesos['id']]['id']}/cobrar", json={
        "fecha": "2026-11-09", "medios": [{"medio_pago": "efectivo", "monto": "300000"}]}).status_code == 201
    gasto = admin.post("/api/gastos", json={"propiedad_id": dolares["propiedad_id"], "fecha": "2026-11-15",
                                            "categoria": "reparacion", "descripcion": "Termotanque",
                                            "importe": "100", "moneda": "USD"})
    assert gasto.status_code == 201 and gasto.json()["moneda"] == "USD"

    p = admin.get("/api/liquidaciones/previsualizar",
                  params={"propietario_id": duena, "hasta": "2026-11-30"}).json()
    assert (p["moneda"], p["cobrado"], p["gastos"], p["monedas_con_pendientes"]) == (
        "ARS", "300000.00", "0.00", ["ARS", "USD"])
    p = admin.get("/api/liquidaciones/previsualizar",
                  params={"propietario_id": duena, "hasta": "2026-11-30", "moneda": "USD"}).json()
    assert (p["cobrado"], p["gastos"], p["comision"], p["neto"]) == ("800.00", "100.00", "40.00", "660.00")

    liq = admin.post("/api/liquidaciones", json={"propietario_id": duena, "fecha": "2026-11-30",
                                                 "hasta": "2026-11-30", "moneda": "USD"})
    assert liq.status_code == 201, liq.text
    assert (liq.json()["moneda"], liq.json()["neto"]) == ("USD", "660.00")
    pdf = admin.get(f"/api/liquidaciones/{liq.json()['id']}/pdf").content
    assert "US$ 660,00" in "\n".join(x.extract_text() for x in PdfReader(io.BytesIO(pdf)).pages)
    assert admin.get("/api/liquidaciones/previsualizar", params={
        "propietario_id": duena, "hasta": "2026-11-30"}).json()["monedas_con_pendientes"] == ["ARS"]

    f = admin.get("/api/reportes/fondos-de-terceros").json()
    assert f["totales"] == [{"moneda": "ARS", "a_pagar": "300000.00", "adeudado": "0.00"},
                            {"moneda": "USD", "a_pagar": "660.00", "adeudado": "0.00"}]   # 800 − 100 − 40
    assert sorted((x["moneda"], x["saldo"]) for x in f["a_pagar_a_propietarios"]) == [
        ("ARS", "300000.00"), ("USD", "660.00")]


@pytest.mark.parametrize("ruta, extra", [("/api/gastos", {"moneda": "EUR"})])
def test_una_moneda_que_no_existe(admin, ruta, extra):
    duena = _cliente(admin, "Dueña Ficticia")
    k = _contrato(admin, duena, direccion="Calle Inventada 100", importe="300000")
    datos = {"propiedad_id": k["propiedad_id"], "fecha": "2026-11-20", "categoria": "otro", "descripcion": "x",
             "importe": "100", **extra}
    assert admin.post(ruta, json=datos).status_code == 422
    assert admin.get("/api/liquidaciones/previsualizar",
                     params={"propietario_id": duena, "moneda": "EUR"}).status_code == 422


# ── el ajuste a mitad de mes ──────────────────────────────────────────────────────────────────────────────


def test_un_ajuste_a_mitad_de_mes_prorratea_por_dias(admin):
    duena = _cliente(admin, "Dueña Ficticia")
    k = _contrato(admin, duena, direccion="Calle Inventada 100", importe="100000", inicio="2026-11-15",
                  fin="2028-11-14", metodo_ajuste="porcentaje", porcentaje_ajuste="10",
                  periodicidad_ajuste="trimestral")
    enero = _cuota_de(admin, "2027-01-05", k["id"])
    assert [x["importe"] for x in enero["lineas"]] == ["100000.00"]

    # El ajuste del 15-02 cae adentro de febrero: la cuota de febrero espera a que se aplique.
    r = admin.post("/api/cuotas/previsualizar", json={"ancla": "2027-02-05"}).json()
    assert [x["motivo"] for x in r["bloqueadas"]] == ["Tiene el ajuste del 15-02-2027 pendiente: aplicalo primero."]
    assert admin.post(f"/api/contratos/{k['id']}/ajuste", json={"fecha_ajuste": "2027-02-15"}).status_code == 201

    febrero = _cuota_de(admin, "2027-02-05", k["id"])
    assert [(x["descripcion"], x["importe"]) for x in febrero["lineas"]] == [
        ("Alquiler febrero 2027, del 01-02 al 14-02 (14/28 días)", "50000.00"),
        ("Alquiler febrero 2027, del 15-02 al 28-02 (14/28 días, con el ajuste)", "55000.00")]
    assert febrero["total"] == "105000.00"
    marzo = _cuota_de(admin, "2027-03-05", k["id"])
    assert [x["importe"] for x in marzo["lineas"]] == ["110000.00"]


# ── lo que paga el propietario ────────────────────────────────────────────────────────────────────────────

ABL_DUENA = {"concepto": "abl", "paga": "propietario", "importe": "18000"}
EXTRAORDINARIAS = {"concepto": "expensas", "paga": "propietario", "descripcion": "Expensas extraordinarias"}


def test_el_concepto_del_propietario_es_un_gasto_por_su_cuenta(admin):
    duena = _cliente(admin, "Dueña Ficticia")
    k = _contrato(admin, duena, direccion="Calle Inventada 100", importe="300000",
                  conceptos=(ABL_DUENA, EXTRAORDINARIAS))
    p = admin.post("/api/cuotas/previsualizar", json={"ancla": "2026-11-05"}).json()["propuestas"][0]
    assert [(x["descripcion"], x["importe"]) for x in p["gastos_del_propietario"]] == [("ABL", "18000.00")]
    assert [x["descripcion"] for x in p["a_cargar_como_gasto"]] == ["Expensas extraordinarias"]

    q = _cuota_de(admin, "2026-11-05", k["id"])
    assert q["total"] == "300000.00"                                         # no está en la cuota del inquilino
    assert [(x["descripcion"], x["importe"]) for x in q["gastos_del_propietario"]] == [
        ("ABL noviembre 2026 (C-000001)", "18000.00")]
    assert Decimal(str(libro.saldo(duena, "propietario", moneda="ARS"))) == 18000
    gasto_id = q["gastos_del_propietario"][0]["id"]
    assert admin.get(f"/api/gastos/{gasto_id}").json()["categoria"] == "impuesto"

    # Se descuenta en la liquidación…
    admin.post(f"/api/cuotas/{q['id']}/cobrar", json={
        "fecha": "2026-11-09", "medios": [{"medio_pago": "transferencia", "monto": "300000"}]})
    liq = admin.get("/api/liquidaciones/previsualizar", params={"propietario_id": duena, "hasta": "2026-11-30"}).json()
    assert (liq["cobrado"], liq["gastos"], liq["neto"]) == ("300000.00", "18000.00", "267000.00")

    # …y no se anula suelto: se anula con su cuota.
    r = admin.post(f"/api/gastos/{gasto_id}/anular", json={"motivo": "x"})
    assert r.status_code == 409 and "con la cuota" in r.text


def test_anular_la_cuota_anula_el_gasto_del_propietario(admin):
    duena = _cliente(admin, "Dueña Ficticia")
    k = _contrato(admin, duena, direccion="Calle Inventada 100", importe="300000", conceptos=(ABL_DUENA,))
    q = _cuota_de(admin, "2026-11-05", k["id"])
    r = admin.post(f"/api/cuotas/{q['id']}/anular", json={"motivo": "Se generó con el precio equivocado"})
    assert r.status_code == 200, r.text
    assert [x["anulado"] for x in r.json()["gastos_del_propietario"]] == [True]
    assert Decimal(str(libro.saldo(duena, "propietario", moneda="ARS"))) == 0
    otra = _cuota_de(admin, "2026-11-05", k["id"])
    assert [x["anulado"] for x in otra["gastos_del_propietario"]] == [False]



# ── la baja de un cliente ─────────────────────────────────────────────────────────────────────────────────


def test_no_se_da_de_baja_a_quien_es_parte_de_algo_vivo(admin):
    duena = _cliente(admin, "Dueña Ficticia")
    k = _contrato(admin, duena, direccion="Calle Inventada 100", importe="300000")
    suelto = _cliente(admin, "Cliente Suelto")

    r = admin.post(f"/api/clientes/{k['inquilino_id']}/desactivar")
    assert r.status_code == 422 and "es el inquilino del contrato C-000001, que sigue abierto." in r.json()["detail"]
    r = admin.post(f"/api/clientes/{duena}/desactivar")
    assert r.status_code == 422 and "es titular de la propiedad" in r.json()["detail"]
    assert admin.post(f"/api/clientes/{suelto}/desactivar").json()["activo"] == 0
