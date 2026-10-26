"""Propiedades y titulares (fase 1, tanda 1).

Lo que se fija acá:
- el alta numera `P-000001` y valida tipo, estado y dirección;
- los titulares se reemplazan juntos, suman 100 y no se repiten;
- «alquilada» no se elige a mano: la pone y la saca el contrato;
- el operador también administra propiedades, y sin el módulo no hay nada.
"""

from __future__ import annotations

import pytest


def _cliente(c, nombre="Titular Ficticio"):
    r = c.post("/api/clientes", json={"name": nombre, "cuit_dni": ""})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _propiedad(c, **extra):
    r = c.post("/api/propiedades", json={"tipo": "departamento", "direccion": "Calle Inventada 123",
                                         "unidad": "3° B", "localidad": "Ciudad Ficticia", **extra})
    assert r.status_code == 201, r.text
    return r.json()


def test_el_alta_numera_y_devuelve_la_ficha(admin):
    p = _propiedad(admin)
    assert p["codigo"] == "P-000001" and p["estado"] == "disponible"
    assert p["titulares"] == [] and p["titulares_completos"] is False and p["contrato_vigente"] is None
    assert _propiedad(admin)["codigo"] == "P-000002"
    assert [x["codigo"] for x in admin.get("/api/propiedades", params={"q": "inventada"}).json()] == [
        "P-000001", "P-000002"]


@pytest.mark.parametrize("extra", [{"tipo": "castillo"}, {"estado": "alquilada"}, {"direccion": ""}])
def test_el_alta_rechaza_lo_que_no_corresponde(admin, extra):
    r = admin.post("/api/propiedades", json={"tipo": "casa", "direccion": "X 1", **extra})
    assert r.status_code == 422, r.text


def test_los_titulares_suman_cien(admin):
    p = _propiedad(admin)
    a, b = _cliente(admin, "Dueña Uno"), _cliente(admin, "Dueño Dos")
    r = admin.put(f"/api/propiedades/{p['id']}/titulares",
                  json=[{"cliente_id": a, "porcentaje": "60"}, {"cliente_id": b, "porcentaje": "30"}])
    assert r.status_code == 422 and "suman 90" in r.text
    r = admin.put(f"/api/propiedades/{p['id']}/titulares",
                  json=[{"cliente_id": a, "porcentaje": "50"}, {"cliente_id": a, "porcentaje": "50"}])
    assert r.status_code == 422 and "dos veces" in r.text
    r = admin.put(f"/api/propiedades/{p['id']}/titulares", json=[{"cliente_id": 99999, "porcentaje": "100"}])
    assert r.status_code == 422
    r = admin.put(f"/api/propiedades/{p['id']}/titulares",
                  json=[{"cliente_id": a, "porcentaje": "66.67"}, {"cliente_id": b, "porcentaje": "33.33"}])
    assert r.status_code == 200, r.text
    ficha = r.json()
    assert ficha["titulares_completos"] is True
    assert [(t["nombre"], t["porcentaje"]) for t in ficha["titulares"]] == [("Dueña Uno", "66.67"),
                                                                             ("Dueño Dos", "33.33")]
    # Se reemplazan: la lista nueva pisa la anterior.
    r = admin.put(f"/api/propiedades/{p['id']}/titulares", json=[{"cliente_id": b, "porcentaje": "100"}])
    assert [t["cliente_id"] for t in r.json()["titulares"]] == [b]


def test_alquilada_no_se_elige_a_mano(admin):
    p = _propiedad(admin)
    assert admin.put(f"/api/propiedades/{p['id']}", json={"estado": "alquilada"}).status_code == 409
    r = admin.put(f"/api/propiedades/{p['id']}", json={"estado": "en_venta", "observaciones": "Con cochera"})
    assert r.status_code == 200 and r.json()["estado"] == "en_venta"


def test_el_operador_administra_propiedades(como):
    assert como("operador").post("/api/propiedades", json={"tipo": "local", "direccion": "Av. Ficticia 9"}) \
        .status_code == 201


def test_sin_sesion_es_401(anonimo):
    assert anonimo.get("/api/propiedades").status_code == 401
    assert anonimo.get("/api/clientes").status_code == 401


def test_titulares_vacios_y_propiedad_inexistente(admin):
    p = _propiedad(admin)
    assert admin.put(f"/api/propiedades/{p['id']}/titulares", json=[]).status_code == 422
    assert admin.put("/api/propiedades/99999", json={"observaciones": "x"}).status_code == 404
    assert admin.put(f"/api/propiedades/{p['id']}", json={"tipo": "castillo"}).status_code == 422
