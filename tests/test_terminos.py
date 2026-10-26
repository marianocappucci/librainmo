"""El gate de Términos y Condiciones: está cableado y corta de verdad.

`libraauth` lo deja apagado en silencio si el producto no pone
`app.state.terminos`, y el resto de la suite lo saltea a propósito (ver el
autouse de `conftest.py`). Este archivo es el único que lo prueba encendido.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from tests.conftest import CLAVE

pytestmark = pytest.mark.sin_aceptar_terminos


def test_sin_aceptar_los_terminos_la_administracion_corta_con_403(app):
    admin = TestClient(app, base_url="https://testserver")
    assert admin.post("/auth/login", json={"username": "admin", "password": CLAVE}).status_code == 200

    r = admin.get("/api/usuarios")
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "terminos_pendientes"
    assert admin.get("/api/config/empresa").status_code == 403


def test_el_estado_dice_que_hay_algo_pendiente(app):
    admin = TestClient(app, base_url="https://testserver")
    admin.post("/auth/login", json={"username": "admin", "password": CLAVE})
    estado = admin.get("/terminos").json()
    assert estado["pendiente"] is True


def test_aceptados_los_terminos_se_destraba(app):
    admin = TestClient(app, base_url="https://testserver")
    admin.post("/auth/login", json={"username": "admin", "password": CLAVE})
    estado = admin.get("/terminos").json()
    r = admin.post("/terminos/aceptar", json={"version": estado["version"], "hash_texto": estado["hash_texto"]})
    assert r.status_code == 200, r.text
    assert admin.get("/api/usuarios").status_code == 200
