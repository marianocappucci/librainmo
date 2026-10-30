"""Con marca propia la instancia exige los Términos del revendedor y nunca cae a los de la familia (libraauth ADR-030).

🔴 Se marca `sin_aceptar_terminos` para que el gate corte de verdad. Es lo que se pondría rojo si alguien sacara
`contrato_propio` o `exigir_propio` de `TerminosRepository(...)` en `app/main.py`: el producto seguiría andando y una
instancia de revendedor aceptaría los términos de Libra en silencio.
"""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient
from libracore import config_manager

from tests.conftest import CLAVE

pytestmark = pytest.mark.sin_aceptar_terminos

TEXTO = "Términos del revendedor, versión de prueba.\n"


def _marca_propia() -> None:
    cfg = config_manager.load()
    cfg["marca"] = {"nombre": "Inmobiliaria Modelo"}
    config_manager.save(cfg)


def _terminos_propios() -> None:
    cfg = config_manager.load()
    cfg["terminos_propios"] = {"version": "rev-1.0", "vigente_desde": "01-01-2026"}
    config_manager.save(cfg)
    os.makedirs(config_manager.MARCA_DIR, exist_ok=True)
    with open(os.path.join(config_manager.MARCA_DIR, "terminos.md"), "w", encoding="utf-8", newline="") as f:
        f.write(TEXTO)


def _admin(app) -> TestClient:
    c = TestClient(app, base_url="https://testserver")
    assert c.post("/auth/login", json={"username": "admin", "password": CLAVE}).status_code == 200
    return c


def test_sin_marca_propia_rigen_los_terminos_de_la_familia(app):
    estado = _admin(app).get("/terminos").json()
    assert estado["pendiente"] is True
    assert estado["version"] != "rev-1.0"


def test_con_marca_propia_y_sin_terminos_propios_la_instancia_queda_frenada(app):
    _marca_propia()
    admin = _admin(app)
    r = admin.get("/api/usuarios")
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "terminos_pendientes"
    # Nadie puede aceptar nada: no hay contrato, ni siquiera el de la familia.
    estado = admin.get("/terminos").json()
    assert estado["sin_contrato"] is True
    aceptar = admin.post("/terminos/aceptar", json={"version": "1.0", "hash_texto": "0" * 64})
    assert aceptar.status_code >= 400
    assert admin.get("/api/usuarios").status_code == 403


def test_con_terminos_propios_se_acepta_el_contrato_del_revendedor(app):
    _marca_propia()
    _terminos_propios()
    admin = _admin(app)
    estado = admin.get("/terminos").json()
    assert estado["version"] == "rev-1.0"
    assert estado["pendiente"] is True
    r = admin.post("/terminos/aceptar", json={"version": estado["version"], "hash_texto": estado["hash_texto"]})
    assert r.status_code == 200, r.text
    assert admin.get("/api/usuarios").status_code == 200
