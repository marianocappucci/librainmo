"""La barra de estado del pie (libracore ADR-075): `GET /api/estado-del-sistema`, la misma ruta que los otros ocho.

Lo que ve cada rol lo decide el motor; acá se mide que la ruta esté montada con el gate de LibraInmo y que el
producto no prometa bloques que no tiene (ARCA y LibraEdge).
"""

from __future__ import annotations

import pytest

from app.roles import ROLES

RUTA = "/api/estado-del-sistema"


@pytest.mark.parametrize("rol", ROLES)
def test_la_abre_cualquier_rol(como, rol):
    r = como(rol).get(RUTA)
    assert r.status_code == 200, r.text
    datos = r.json()
    assert datos["usuario"]["rol"] == rol
    assert datos["libraedge"] is None and datos["arca"] is None


def test_el_respaldo_es_del_admin(como):
    assert como("admin").get(RUTA).json()["respaldo"]["motivo"] == "sin_respaldos"
    assert como("operador").get(RUTA).json()["respaldo"] is None


def test_sin_sesion_es_401(anonimo):
    assert anonimo.get(RUTA).status_code == 401
