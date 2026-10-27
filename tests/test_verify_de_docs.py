"""`POST /auth/verify`: lo que usa el login de `/docs/` de `librainmo_web`.

Valida credenciales sin crear sesión, y sólo si quien pregunta trae el secreto
compartido `DOCS_AUTH_SECRET`. Los tests miden lo que contesta y no que el flag
esté escrito en `routers/auth.py`.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import crear_app
from app.roles import ADMIN
from tests.conftest import CLAVE

SECRETO_DOCS = "no-es-el-secreto-real-de-ninguna-instancia"


@pytest.fixture
def con_secreto(base, config, monkeypatch) -> TestClient:
    monkeypatch.setenv("LIBRAINMO_ADMIN_USERNAME", ADMIN)
    monkeypatch.setenv("LIBRAINMO_ADMIN_PASSWORD", CLAVE)
    monkeypatch.setenv("DOCS_AUTH_SECRET", SECRETO_DOCS)
    return TestClient(crear_app(config), base_url="https://testserver")


def _verify(cliente: TestClient, password: str, headers: dict | None = None):
    return cliente.post(
        "/auth/verify",
        json={"username": ADMIN, "password": password},
        headers={"X-Internal-Auth": SECRETO_DOCS} if headers is None else headers,
    )


def test_acepta_las_credenciales_buenas(con_secreto):
    r = _verify(con_secreto, CLAVE)
    assert r.status_code == 200, r.text
    assert r.json() == {"valid": True}


def test_rechaza_las_credenciales_malas(con_secreto):
    """El control del de arriba: un verify que dijera `true` a cualquier cosa
    dejaría el login de `/docs/` como una puerta abierta con formulario."""
    r = _verify(con_secreto, "otra")
    assert r.status_code == 200, r.text
    assert r.json() == {"valid": False}


def test_no_crea_sesion(con_secreto):
    assert _verify(con_secreto, CLAVE).json() == {"valid": True}
    assert list(con_secreto.cookies.keys()) == []


@pytest.mark.parametrize(
    "headers",
    [
        pytest.param({}, id="sin-header"),
        pytest.param({"X-Internal-Auth": ""}, id="header-vacio"),
        pytest.param({"X-Internal-Auth": "otro-secreto"}, id="secreto-equivocado"),
    ],
)
def test_exige_el_secreto_compartido(con_secreto, headers):
    assert _verify(con_secreto, CLAVE, headers).status_code == 401


def test_falla_cerrado_sin_secreto_configurado(app, monkeypatch):
    """🔴 La instancia **sin** `DOCS_AUTH_SECRET`: si un header vacío coincidiera
    con un secreto vacío, cualquiera podría usarla de oráculo de contraseñas."""
    monkeypatch.delenv("DOCS_AUTH_SECRET", raising=False)
    cliente = TestClient(app, base_url="https://testserver")
    for headers in ({}, {"X-Internal-Auth": ""}):
        assert _verify(cliente, CLAVE, headers).status_code == 401, headers
