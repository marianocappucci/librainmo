"""Gastos, liquidación al propietario y fondos de terceros: el circuito de un mes (fase 1, tanda 2c).

Lo que se fija acá:
- el gasto se reparte entre los titulares y es un cargo en sus cuentas;
- la liquidación toma lo no liquidado hasta una fecha, cobra la comisión sólo sobre el alquiler y deja el neto;
- un movimiento se liquida una sola vez, y lo liquidado no se anula hasta anular la liquidación;
- pagar el neto deja la cuenta en cero; anular libera los movimientos;
- no se emite con neto negativo;
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
    assert f["total_a_pagar"] == "285000.00" and f["inquilinos_deudores"] == []      # 305.000 − 20.000

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
    assert f["total_a_pagar"] == "276000.00"                                         # se descontó la comisión
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


def test_no_se_emite_con_neto_negativo(admin, mes):
    admin.post("/api/gastos", json={"propiedad_id": mes["propiedad"], "fecha": "2026-11-20", "categoria": "impuesto",
                                    "descripcion": "ABL atrasado", "importe": "500000"})
    r = admin.post("/api/liquidaciones", json={"propietario_id": mes["uno"], "fecha": "2026-11-30",
                                               "hasta": "2026-11-30"})
    assert r.status_code == 409 and "neto negativo" in r.text


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
    assert f["total_adeudado"] == "305000.00"


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
