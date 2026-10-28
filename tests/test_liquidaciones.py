"""Gastos, liquidación al propietario y fondos de terceros: el circuito de un mes (fase 1, tanda 2c).

Lo que se fija acá:
- el gasto se reparte entre los titulares y es un cargo en sus cuentas;
- la liquidación toma lo no liquidado hasta una fecha, cobra la comisión sólo sobre el alquiler y deja el neto;
- un movimiento se liquida una sola vez, y lo liquidado no se anula hasta anular la liquidación;
- pagar el neto deja la cuenta en cero; anular libera los movimientos;
- con neto negativo se emite deudora y la próxima liquidación descuenta la deuda (ADR-011);
- fondos de terceros: lo que se les debe a los propietarios y lo que deben los inquilinos.
"""

from __future__ import annotations

import pytest


def _cliente(c, nombre):
    return c.post("/api/clientes", json={"name": nombre, "cuit_dni": ""}).json()["id"]


@pytest.fixture
def mes(admin):
    """Noviembre: la cuota de 305.000 (alquiler 300.000 + seguro 5.000) cobrada el 13 y una reparación de 20.000."""
    p = admin.post("/api/propiedades", json={"tipo": "departamento", "direccion": "Calle Inventada 123"}).json()
    uno, dos = _cliente(admin, "Dueña Uno"), _cliente(admin, "Dueño Dos")
    admin.put(f"/api/propiedades/{p['id']}/titulares",
              json=[{"cliente_id": uno, "porcentaje": "60"}, {"cliente_id": dos, "porcentaje": "40"}])
    inq = _cliente(admin, "Inquilina Ficticia")
    k = admin.post("/api/contratos", json={
        "propiedad_id": p["id"], "inquilino_id": inq, "fecha_inicio": "2026-11-01", "fecha_fin": "2028-10-31",
        "importe_inicial": "300000", "dia_vencimiento": 10, "comision_pct": "5"}).json()
    admin.post(f"/api/contratos/{k['id']}/conceptos", json={"concepto": "seguro", "paga": "inquilino",
                                                             "importe": "5000"})
    admin.post(f"/api/contratos/{k['id']}/activar")
    q = admin.post("/api/cuotas/generar", json={"ancla": "2026-11-05"}).json()["generadas"][0]
    cobro = admin.post(f"/api/cuotas/{q['id']}/cobrar", json={
        "fecha": "2026-11-09", "medios": [{"medio_pago": "transferencia", "monto": "305000"}]}).json()
    gasto = admin.post("/api/gastos", json={"propiedad_id": p["id"], "fecha": "2026-11-15", "categoria": "reparacion",
                                            "descripcion": "Cambio del calefón", "importe": "20000",
                                            "comprobante": "FC B 0001-00000123"})
    assert gasto.status_code == 201, gasto.text
    return {"propiedad": p["id"], "contrato": k["id"], "uno": uno, "dos": dos, "inquilina": inq,
            "cobro": cobro["id"], "gasto": gasto.json()}


def test_el_gasto_se_reparte(mes):
    assert sorted((x["propietario_nombre"], x["importe"]) for x in mes["gasto"]["imputaciones"]) == [
        ("Dueña Uno", "12000.00"), ("Dueño Dos", "8000.00")]


def test_la_liquidacion_cobra_comision_solo_sobre_el_alquiler(admin, mes):
    p = admin.get("/api/liquidaciones/previsualizar", params={"propietario_id": mes["uno"], "hasta": "2026-11-30"})
    assert p.status_code == 200, p.text
    p = p.json()
    assert (p["cobrado"], p["gastos"], p["comision"], p["neto"]) == ("183000.00", "12000.00", "9000.00", "162000.00")
    assert [(x["tipo"], x["importe"], x["comision"]) for x in p["items"]] == [
        ("cobro", "180000.00", "9000.00"), ("cobro", "3000.00", "0.00"), ("gasto", "-12000.00", "0.00")]
    # Antes del gasto, el gasto no entra.
    antes = admin.get("/api/liquidaciones/previsualizar", params={"propietario_id": mes["uno"], "hasta": "2026-11-14"})
    assert antes.json()["gastos"] == "0.00"


def test_emitir_pagar_y_los_fondos_de_terceros(admin, mes):
    f = admin.get("/api/reportes/fondos-de-terceros").json()
    assert f["totales"] == [{"moneda": "ARS", "a_pagar": "285000.00", "adeudado": "0.00"}]  # 305.000 − 20.000
    assert f["inquilinos_deudores"] == []

    r = admin.post("/api/liquidaciones", json={"propietario_id": mes["uno"], "fecha": "2026-11-30",
                                               "hasta": "2026-11-30"})
    assert r.status_code == 201, r.text
    liq = r.json()
    assert (liq["numero"], liq["estado"], liq["neto"]) == ("L-000001", "emitida", "162000.00")
    assert admin.get("/api/liquidaciones/previsualizar",
                     params={"propietario_id": mes["uno"], "hasta": "2026-11-30"}).json()["items"] == []
    assert admin.post("/api/liquidaciones", json={"propietario_id": mes["uno"], "fecha": "2026-11-30",
                                                  "hasta": "2026-11-30"}).status_code == 409

    # Lo liquidado no se anula por debajo.
    assert admin.post(f"/api/cobros/{mes['cobro']}/anular", json={"motivo": "x"}).status_code == 409
    assert admin.post(f"/api/gastos/{mes['gasto']['id']}/anular", json={"motivo": "x"}).status_code == 409

    f = admin.get("/api/reportes/fondos-de-terceros").json()
    assert f["totales"][0]["a_pagar"] == "276000.00"                                 # se descontó la comisión
    assert admin.post(f"/api/liquidaciones/{liq['id']}/pagar",
                      json={"fecha": "2026-11-29", "medio_pago": "transferencia"}).status_code == 422
    assert admin.post(f"/api/liquidaciones/{liq['id']}/pagar",
                      json={"fecha": "2026-12-01", "medio_pago": "bitcoin"}).status_code == 422
    r = admin.post(f"/api/liquidaciones/{liq['id']}/pagar",
                   json={"fecha": "2026-12-01", "medio_pago": "transferencia", "referencia": "CBU …1234"})
    assert r.status_code == 200 and r.json()["estado"] == "pagada"
    f = admin.get("/api/reportes/fondos-de-terceros").json()
    assert [(x["nombre"], x["saldo"]) for x in f["a_pagar_a_propietarios"]] == [("Dueño Dos", "114000.00")]
    assert admin.post(f"/api/liquidaciones/{liq['id']}/anular", json={"motivo": "x"}).status_code == 409


def test_anular_libera_los_movimientos(admin, mes):
    liq = admin.post("/api/liquidaciones", json={"propietario_id": mes["dos"], "fecha": "2026-11-30",
                                                 "hasta": "2026-11-30"}).json()
    assert liq["neto"] == "108000.00"                                                # 122.000 − 8.000 − 6.000
    r = admin.post(f"/api/liquidaciones/{liq['id']}/anular", json={"motivo": "Faltaba un gasto"})
    assert r.status_code == 200 and r.json()["estado"] == "anulada" and r.json()["items"] == []
    p = admin.get("/api/liquidaciones/previsualizar", params={"propietario_id": mes["dos"], "hasta": "2026-11-30"})
    assert p.json()["neto"] == "108000.00"
    assert admin.post(f"/api/gastos/{mes['gasto']['id']}/anular", json={"motivo": "Lo pagó el consorcio"}) \
        .status_code == 200
    assert admin.get("/api/liquidaciones/previsualizar",
                     params={"propietario_id": mes["dos"], "hasta": "2026-11-30"}).json()["neto"] == "116000.00"
    assert [x["numero"] for x in admin.get("/api/liquidaciones", params={"estado": "anulada"}).json()] == ["L-000001"]


def _liquidar(admin, propietario, fecha):
    r = admin.post("/api/liquidaciones", json={"propietario_id": propietario, "fecha": fecha, "hasta": fecha})
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture
def deudora(admin, mes):
    """Noviembre con un ABL de 500.000: a Dueña Uno (60 %) le toca 300.000 de gasto contra 183.000 cobrados."""
    admin.post("/api/gastos", json={"propiedad_id": mes["propiedad"], "fecha": "2026-11-20", "categoria": "impuesto",
                                    "descripcion": "ABL atrasado", "importe": "500000"})
    return _liquidar(admin, mes["uno"], "2026-11-30")


def test_con_neto_negativo_se_emite_deudora_y_no_se_paga(admin, mes, deudora):
    """ADR-011: 183.000 − 12.000 − 300.000 − 9.000 de comisión = −138.000, que el propietario le debe a la
    inmobiliaria."""
    assert (deudora["estado"], deudora["neto"], deudora["saldo_anterior"]) == ("deudora", "-138000.00", "0.00")
    r = admin.post(f"/api/liquidaciones/{deudora['id']}/pagar", json={"fecha": "2026-12-01",
                                                                       "medio_pago": "transferencia"})
    assert r.status_code == 409 and "saldo deudor" in r.text


def test_la_proxima_liquidacion_descuenta_la_deuda(admin, mes, deudora):
    """🔴 Diciembre: la cuota de 305.000 cobrada entra con la deuda de noviembre como ítem «saldo», y la deudora queda
    saldada. Después de pagar el neto, la cuenta del propietario queda en cero."""
    from decimal import Decimal

    from libracore.db import libro_de_terceros as libro

    q = admin.post("/api/cuotas/generar", json={"ancla": "2026-12-05"}).json()["generadas"][0]
    admin.post(f"/api/cuotas/{q['id']}/cobrar", json={"fecha": "2026-12-09",
                                                     "medios": [{"medio_pago": "efectivo", "monto": "305000"}]})
    p = admin.get("/api/liquidaciones/previsualizar", params={"propietario_id": mes["uno"], "hasta": "2026-12-31"})
    p = p.json()
    assert (p["cobrado"], p["comision"], p["saldo_anterior"], p["neto"]) == (
        "183000.00", "9000.00", "-138000.00", "36000.00")
    assert [(x["tipo"], x["importe"]) for x in p["items"] if x["tipo"] == "saldo"] == [("saldo", "-138000.00")]

    liq = _liquidar(admin, mes["uno"], "2026-12-31")
    assert (liq["estado"], liq["neto"]) == ("emitida", "36000.00")
    vieja = admin.get(f"/api/liquidaciones/{deudora['id']}").json()
    assert vieja["estado"] == "saldada" and vieja["saldada_por"] == {"id": liq["id"], "numero": liq["numero"]}
    assert admin.post(f"/api/liquidaciones/{liq['id']}/pagar", json={
        "fecha": "2027-01-02", "medio_pago": "transferencia"}).status_code == 200
    assert Decimal(str(libro.saldo(mes["uno"], "propietario"))) == 0


def test_una_deuda_mayor_se_sigue_arrastrando(admin, mes, deudora):
    """Si lo de diciembre no alcanza, la nueva también es deudora y arrastra todo: la deuda no se pierde ni se
    duplica."""
    admin.post("/api/gastos", json={"propiedad_id": mes["propiedad"], "fecha": "2026-12-02", "categoria": "otro",
                                    "descripcion": "Pintura", "importe": "100000"})
    liq = _liquidar(admin, mes["uno"], "2026-12-31")
    assert (liq["estado"], liq["saldo_anterior"], liq["neto"]) == ("deudora", "-138000.00", "-198000.00")
    assert admin.get(f"/api/liquidaciones/{deudora['id']}").json()["estado"] == "saldada"
    p = admin.get("/api/liquidaciones/previsualizar", params={"propietario_id": mes["uno"], "hasta": "2027-01-31"})
    assert [x["descripcion"] for x in p.json()["items"]] == [f"Saldo deudor de la liquidación {liq['numero']}"]
    # Sólo la deuda, sin movimientos nuevos, no es una liquidación.
    assert admin.post("/api/liquidaciones", json={"propietario_id": mes["uno"], "fecha": "2027-01-31",
                                                  "hasta": "2027-01-31"}).status_code == 409


def test_anular_la_que_absorbio_devuelve_la_deuda(admin, mes, deudora):
    q = admin.post("/api/cuotas/generar", json={"ancla": "2026-12-05"}).json()["generadas"][0]
    admin.post(f"/api/cuotas/{q['id']}/cobrar", json={"fecha": "2026-12-09",
                                                     "medios": [{"medio_pago": "efectivo", "monto": "305000"}]})
    liq = _liquidar(admin, mes["uno"], "2026-12-31")
    r = admin.post(f"/api/liquidaciones/{deudora['id']}/anular", json={"motivo": "x"})
    assert r.status_code == 409 and "anulá primero" in r.text
    assert admin.post(f"/api/liquidaciones/{liq['id']}/anular", json={"motivo": "Mal la fecha"}).status_code == 200
    assert admin.get(f"/api/liquidaciones/{deudora['id']}").json()["estado"] == "deudora"
    # Y la deudora, sin nadie que la haya absorbido, se puede anular.
    assert admin.post(f"/api/liquidaciones/{deudora['id']}/anular", json={"motivo": "Faltaba"}).json()["estado"] == \
        "anulada"


def test_el_pdf_de_una_deudora(admin, mes, deudora):
    import io

    from pypdf import PdfReader

    r = admin.get(f"/api/liquidaciones/{deudora['id']}/pdf")
    texto = " ".join(p.extract_text() for p in PdfReader(io.BytesIO(r.content)).pages)
    assert "Saldo deudor (se descuenta en la próxima liquidación)" in texto and "Neto a cobrar" not in texto


def test_reglas_de_fecha_y_vacios(admin, mes):
    assert admin.post("/api/liquidaciones", json={"propietario_id": mes["uno"], "fecha": "2026-11-30",
                                                  "hasta": "2026-12-31"}).status_code == 422
    assert admin.post("/api/liquidaciones", json={"propietario_id": mes["uno"], "fecha": "2026-11-05",
                                                  "hasta": "2026-11-05"}).status_code == 409   # nada todavía
    assert admin.get("/api/liquidaciones/99999").status_code == 404
    assert admin.get("/api/liquidaciones/previsualizar", params={"propietario_id": 99999}).status_code == 422


def test_un_inquilino_que_debe_aparece_en_los_fondos(admin, mes):
    admin.post("/api/cuotas/generar", json={"ancla": "2026-12-05"})
    f = admin.get("/api/reportes/fondos-de-terceros").json()
    assert [(x["nombre"], x["saldo"]) for x in f["inquilinos_deudores"]] == [("Inquilina Ficticia", "305000.00")]
    assert f["totales"] == [{"moneda": "ARS", "a_pagar": "285000.00", "adeudado": "305000.00"}]


@pytest.mark.parametrize("extra", [{"categoria": "viaje"}, {"importe": "0"}, {"propiedad_id": 99999}])
def test_gastos_invalidos(admin, mes, extra):
    datos = {"propiedad_id": mes["propiedad"], "fecha": "2026-11-20", "categoria": "otro", "descripcion": "x",
             "importe": "100", **extra}
    assert admin.post("/api/gastos", json=datos).status_code == 422


def test_la_busqueda_de_gastos(admin, mes):
    assert [g["id"] for g in admin.get("/api/gastos", params={"propiedad_id": mes["propiedad"]}).json()] == [
        mes["gasto"]["id"]]
    assert admin.get("/api/gastos", params={"desde": "2026-12-01"}).json() == []
    assert admin.get(f"/api/gastos/{mes['gasto']['id']}").json()["comprobante"] == "FC B 0001-00000123"


def test_el_pdf_de_la_liquidacion(admin, mes):
    import io

    from pypdf import PdfReader

    liq = admin.post("/api/liquidaciones", json={"propietario_id": mes["uno"], "fecha": "2026-11-30",
                                                 "hasta": "2026-11-30"}).json()
    admin.post(f"/api/liquidaciones/{liq['id']}/pagar", json={"fecha": "2026-12-01", "medio_pago": "transferencia"})
    r = admin.get(f"/api/liquidaciones/{liq['id']}/pdf")
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    texto = " ".join(p.extract_text() for p in PdfReader(io.BytesIO(r.content)).pages)
    for esperado in ("Liquidación L-000001", "Dueña Uno", "Cambio del calefón", "$ 162.000,00", "Pagada el 01-12-2026"):
        assert esperado in texto, esperado
