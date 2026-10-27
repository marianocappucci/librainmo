"""`POST /auth/demo`: el auto-login del visitante de `demo.librainmo.com.ar`, con código de acceso.

🔴 **Se prende en dos lugares distintos**, y ninguno delata que falta el otro: el flag en `routers/auth.py` registra la
ruta, y `main.py` cablea el usuario de la demo y el repositorio de códigos. Por eso los tests miden qué contesta y no
que las líneas estén escritas.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.auth import COOKIE
from app.main import crear_app
from app.roles import ADMIN, OPERADOR
from tests.conftest import CLAVE

USUARIO_DEMO = "visitante"


@pytest.fixture
def demo(base, config, monkeypatch):
    """Una instancia demo de verdad: las dos variables, el usuario sembrado y el repositorio de códigos cableado."""
    monkeypatch.setenv("LIBRAINMO_ADMIN_USERNAME", ADMIN)
    monkeypatch.setenv("LIBRAINMO_ADMIN_PASSWORD", CLAVE)
    monkeypatch.setenv("DEMO_MODE", "1")
    monkeypatch.setenv("DEMO_USERNAME", USUARIO_DEMO)
    monkeypatch.delenv("DEMO_PASSWORD", raising=False)
    app = crear_app(config)
    return TestClient(app, base_url="https://testserver"), app


def _entrar(cliente: TestClient, app):
    emitido = app.state.demo_codigos.crear(etiqueta="suite")
    return cliente.post("/auth/demo", json={"codigo": emitido["codigo"]})


def test_la_demo_se_anuncia_como_tal(demo):
    cliente, _ = demo
    r = cliente.get("/auth/demo")
    assert r.status_code == 200, r.text
    assert r.json() == {"enabled": True, "username": USUARIO_DEMO, "requiere_codigo": True}


def test_sin_codigo_no_se_entra(demo):
    """Es el test que justifica que la demo pueda estar en internet."""
    cliente, _ = demo
    r = cliente.post("/auth/demo", json={"codigo": ""})
    assert r.status_code == 401, r.text
    assert COOKIE not in cliente.cookies


def test_con_un_codigo_inventado_tampoco(demo):
    cliente, _ = demo
    r = cliente.post("/auth/demo", json={"codigo": "ABCD-EFGH-JKMN"})
    assert r.status_code == 401, r.text
    assert COOKIE not in cliente.cookies


def test_con_un_codigo_emitido_se_entra_como_operador(demo):
    """El control positivo de los dos de arriba (sin él, un endpoint que rechazara SIEMPRE los haría pasar) y la
    garantía del rol: LibraInmo no tiene `staff`, y un visitante admin llegaría a Usuarios, Configuración y el
    backup."""
    cliente, app = demo
    r = _entrar(cliente, app)
    assert r.status_code == 200, r.text
    assert COOKIE in cliente.cookies
    assert r.json()["role"] == OPERADOR
    assert cliente.get("/auth/me").json()["role"] == OPERADOR


def test_un_codigo_revocado_deja_de_servir(demo):
    cliente, app = demo
    emitido = app.state.demo_codigos.crear(etiqueta="suite")
    app.state.demo_codigos.revocar(emitido["id"])
    r = cliente.post("/auth/demo", json={"codigo": emitido["codigo"]})
    assert r.status_code == 401, r.text
    assert COOKIE not in cliente.cookies


def test_demo_demo_por_el_login_normal_no_entra(base, config, monkeypatch):
    """El usuario de la demo existe, pero su clave es aleatoria: al que escribe `demo`/`demo` en el formulario no lo
    deja pasar. Sin `DEMO_PASSWORD` no hay nada que tipear."""
    monkeypatch.setenv("LIBRAINMO_ADMIN_USERNAME", ADMIN)
    monkeypatch.setenv("LIBRAINMO_ADMIN_PASSWORD", CLAVE)
    monkeypatch.setenv("DEMO_MODE", "1")
    monkeypatch.setenv("DEMO_USERNAME", "demo")
    monkeypatch.delenv("DEMO_PASSWORD", raising=False)
    cliente = TestClient(crear_app(config), base_url="https://testserver")
    r = cliente.post("/auth/login", json={"username": "demo", "password": "demo"})
    assert r.status_code == 401, r.text
    assert COOKIE not in cliente.cookies


def test_el_visitante_ve_pero_no_escribe_lo_del_administrador(demo):
    """Lo de `libraauth` que hay que conservar: el visitante lee Usuarios (la pantalla se ve completa) y no puede
    crear nada ahí. Es lo que hace segura a una demo con rol `operador`."""
    cliente, app = demo
    assert _entrar(cliente, app).status_code == 200
    assert cliente.get("/api/usuarios").status_code == 200
    r = cliente.post("/api/usuarios", json={"username": "otro", "name": "Otro", "password": CLAVE, "role": ADMIN})
    assert r.status_code == 403, r.text


@pytest.mark.sin_aceptar_terminos
def test_el_gate_de_terminos_deja_pasar_al_visitante(demo):
    """Una demo no tiene contrato que aceptar: con el gate puesto de verdad (`sin_aceptar_terminos` saca la excepción
    del conftest) el visitante opera igual. Si no, la demo entera daría 403 al entrar."""
    cliente, app = demo
    assert _entrar(cliente, app).status_code == 200
    r = cliente.get("/api/propiedades")
    assert r.status_code == 200, r.text


def test_sin_demo_mode_la_ruta_no_atiende(app, monkeypatch):
    """En una instancia de cliente el auto-login **no existe**. Se afirma «no es 200» y no un código exacto: la SPA se
    sirve con un catch-all y un POST a una ruta inexistente puede dar 404 o 405. Lo que no puede pasar es que deje
    entrar."""
    cliente = TestClient(app, base_url="https://testserver")
    r = cliente.post("/auth/demo", json={"codigo": "lo-que-sea"})
    assert r.status_code in (404, 405), r.text
    assert COOKIE not in cliente.cookies
    assert not hasattr(app.state, "demo_codigos")
    assert cliente.get("/admin/demo-codigos").status_code in (401, 404, 405)
