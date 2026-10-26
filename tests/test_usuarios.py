"""El ABM de usuarios del motor, con el vocabulario de roles de LibraInmo."""

from __future__ import annotations

import pytest
from libraauth.testing import verificar_contrato_de_usuarios

from app.roles import ROLES


def test_contrato_de_usuarios_del_motor(admin):
    # El mismo ciclo que hace el backoffice contra cualquier producto de la familia.
    verificar_contrato_de_usuarios(admin, "/api/usuarios", role="operador")


@pytest.mark.parametrize("rol", ROLES)
def test_se_puede_dar_de_alta_un_usuario_de_cada_rol(admin, rol):
    r = admin.post(
        "/api/usuarios", json={"username": f"u_{rol}", "name": rol.title(), "password": "una-clave", "role": rol}
    )
    assert r.status_code == 201, r.text
    assert r.json()["role"] == rol


@pytest.mark.parametrize("rol", ["staff", "inquilino", "ADMIN", ""])
def test_un_rol_fuera_del_vocabulario_es_422(admin, rol):
    r = admin.post("/api/usuarios", json={"username": "x", "name": "X", "password": "una-clave", "role": rol})
    assert r.status_code == 422
    assert "operador" in r.json()["detail"]


def test_los_roles_son_los_dos_del_producto():
    assert ROLES == ("admin", "operador")


def test_usuario_repetido_es_409(admin):
    cuerpo = {"username": "repetido", "name": "R", "password": "una-clave", "role": "operador"}
    assert admin.post("/api/usuarios", json=cuerpo).status_code == 201
    assert admin.post("/api/usuarios", json=cuerpo).status_code == 409


def test_el_unico_admin_no_se_puede_degradar(admin):
    yo = next(u for u in admin.get("/api/usuarios").json() if u["username"] == "admin")
    r = admin.put(f"/api/usuarios/{yo['id']}", json={"name": "Administrador", "role": "operador", "active": True})
    assert r.status_code == 409


def test_un_usuario_nuevo_entra_con_su_rol(app, admin, anonimo):
    admin.post(
        "/api/usuarios", json={"username": "nuevo", "name": "Nuevo", "password": "una-clave", "role": "operador"}
    )
    r = anonimo.post("/auth/login", json={"username": "nuevo", "password": "una-clave"})
    assert r.status_code == 200
    assert r.json()["role"] == "operador"


def test_cambiar_la_propia_clave(como, anonimo):
    operador = como("operador")
    from tests.conftest import CLAVE

    r = operador.post("/auth/change-password", json={"current_password": CLAVE, "new_password": "otra-clave-nueva"})
    assert r.status_code == 200, r.text
    assert anonimo.post("/auth/login", json={"username": "operador", "password": "otra-clave-nueva"}).status_code == 200
