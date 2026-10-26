"""Quién puede qué (`app/roles.py`): usuarios y roles.

Sin rutas de dominio todavía, la matriz se mide sobre lo que ya existe: la administración de la
instancia (usuarios, actividad, empresa y backup) es del admin; la empresa la lee cualquier rol.
Cada router de la fase 1 suma acá sus filas.
"""

from __future__ import annotations

import pytest

from app.roles import ADMIN, OPERADOR, ROLES


def test_los_roles_son_los_dos_del_personal_de_la_inmobiliaria():
    assert ROLES == (ADMIN, OPERADOR) == ("admin", "operador")


@pytest.mark.parametrize("ruta", ["/api/usuarios", "/api/logs", "/api/config/backups"])
def test_administracion_solo_para_el_admin(como, ruta):
    assert como("operador").get(ruta).status_code == 403
    assert como("admin").get(ruta).status_code == 200


@pytest.mark.parametrize("rol", ROLES)
def test_la_empresa_la_lee_cualquier_rol(como, rol):
    assert como(rol).get("/api/config/empresa").status_code == 200


@pytest.mark.parametrize("ruta", ["/api/usuarios", "/api/logs", "/api/config/empresa", "/api/config/backups"])
def test_sin_sesion_todo_es_401(anonimo, ruta):
    assert anonimo.get(ruta).status_code == 401


def test_el_operador_no_administra_usuarios(como):
    r = como("operador").post(
        "/api/usuarios", json={"username": "otro", "name": "Otro", "password": "una-clave", "role": "operador"}
    )
    assert r.status_code == 403


def test_el_usuario_inactivo_no_entra(app, como):
    como("operador")
    admin = como("admin")
    uid = next(u["id"] for u in admin.get("/api/usuarios").json() if u["username"] == "operador")
    r = admin.put(f"/api/usuarios/{uid}", json={"name": "Usuario operador", "role": "operador", "active": False})
    assert r.status_code == 200
    assert como("operador").get("/api/config/empresa").status_code == 401


def test_el_tema_lo_lee_cualquiera_y_lo_cambia_el_admin(anonimo, como):
    assert anonimo.get("/api/tema").status_code == 200
    assert como("operador").put("/api/tema", json={}).status_code in (401, 403)
