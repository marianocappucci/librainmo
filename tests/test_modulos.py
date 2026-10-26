"""Planes y módulos: `plans.py` + el gate de los routers del producto.

La tabla `modulos` es la del motor (`libracore`), no una del dominio: ver `app/modulos.py`.
Como todavía no hay routers de dominio, los tests arman uno mínimo que pide
`exigir_modulo("alquileres")`, que es lo que va a pedir cada router de la fase 1.
"""

from __future__ import annotations

import pytest
from fastapi import APIRouter

import plans
from app.modulos import ModuleRepository, exigir_modulo
from app.roles import ROLES
from tests.conftest import url_de_tests

RUTA = "/api/_prueba/alquileres"


@pytest.fixture
def app_con_ruta_gateada(app):
    router = APIRouter(dependencies=exigir_modulo("alquileres"))

    @router.get(RUTA)
    def _ruta() -> dict[str, bool]:
        return {"ok": True}

    app.include_router(router)
    return app


def test_los_planes_y_sus_modulos():
    assert plans.PLANES == ["alquileres"]
    assert plans.modulos_de_plan("alquileres") == {"alquileres"}
    assert plans.modulos_de_plan("inexistente") == set()
    assert plans.MODULOS == ["alquileres"]
    assert set(plans.PLAN_LABELS) == set(plans.PLANES)
    assert plans.ADDONS == set()


def test_los_precios_son_una_decision_comercial_y_van_vacios():
    assert plans.PLAN_PRECIOS == {}


def test_cada_modulo_declarado_tiene_etiqueta():
    assert set(plans.MODULO_LABELS) == plans.TODOS_LOS_MODULOS


def test_una_instancia_nueva_arranca_con_todo_habilitado(app):
    assert app.state.modules.get_all() == {"alquileres": True}


def test_el_modulo_vive_en_la_tabla_del_motor(app):
    """Lo que lee el backoffice (`app.database.get_modulos` por `docker exec`) es esta misma tabla."""
    from libracore.db import modulos as modulos_del_motor

    assert modulos_del_motor.get_modulos() == {"alquileres": True}


def test_con_el_plan_andan_las_rutas_del_modulo(app_con_ruta_gateada, admin):
    app_con_ruta_gateada.state.modules.aplicar_plan("alquileres")
    assert admin.get(RUTA).status_code == 200


def test_con_el_modulo_apagado_la_ruta_responde_403(app_con_ruta_gateada, admin):
    app_con_ruta_gateada.state.modules.set_enabled("alquileres", False)
    r = admin.get(RUTA)
    assert r.status_code == 403
    assert "alquileres" in r.json()["detail"]


def test_el_cambio_se_ve_sin_reiniciar(app_con_ruta_gateada, admin):
    modulos = app_con_ruta_gateada.state.modules
    assert admin.get(RUTA).status_code == 200
    modulos.set_enabled("alquileres", False)
    assert admin.get(RUTA).status_code == 403
    modulos.set_enabled("alquileres", True)
    assert admin.get(RUTA).status_code == 200


def test_sin_sesion_el_pedido_es_401_y_no_cuenta_que_modulos_hay(app_con_ruta_gateada, anonimo):
    app_con_ruta_gateada.state.modules.set_enabled("alquileres", False)
    assert anonimo.get(RUTA).status_code == 401


def test_lo_que_no_es_del_modulo_no_se_gatea(app, admin, anonimo):
    app.state.modules.set_enabled("alquileres", False)
    assert anonimo.get("/salud").status_code == 200
    assert admin.get("/auth/me").status_code == 200
    assert admin.get("/api/usuarios").status_code == 200
    assert admin.get("/api/config/empresa").status_code == 200


def test_aplicar_un_plan_desconocido_falla(app):
    with pytest.raises(ValueError, match="Plan desconocido"):
        app.state.modules.aplicar_plan("platino")


def test_un_modulo_desconocido_esta_apagado(app):
    assert app.state.modules.is_enabled("alquilers") is False
    with pytest.raises(ValueError, match="Módulo desconocido"):
        app.state.modules.set_enabled("alquilers", True)


def test_el_seed_no_pisa_lo_que_ya_estaba_configurado(app):
    app.state.modules.set_enabled("alquileres", False)
    ModuleRepository(app.state.config.database_url).ensure_seeded()  # un reinicio
    assert app.state.modules.get_all() == {"alquileres": False}


def test_aplicar_plan_en_db_es_lo_que_corre_el_alta(app_con_ruta_gateada, admin):
    app_con_ruta_gateada.state.modules.set_enabled("alquileres", False)
    assert admin.get(RUTA).status_code == 403
    plans.aplicar_plan_en_db(url_de_tests(), "alquileres")
    assert admin.get(RUTA).status_code == 200
    with pytest.raises(ValueError):
        plans.aplicar_plan_en_db(url_de_tests(), "platino")


def test_cada_router_de_api_declara_su_modulo(app):
    """Una ruta nueva bajo `/api/` que se olvide del gate tiene que poner rojo
    este test: las únicas rutas de `/api` sin gate del módulo son las de administración
    de la instancia (usuarios, logs, configuración)."""
    sin_gate = set()
    for ruta in app.routes:
        path = getattr(ruta, "path", "")
        if not path.startswith("/api/"):
            continue
        nombres = {getattr(d.call, "__qualname__", "") for d in ruta.dependant.dependencies}
        if not any("require_module" in n for n in nombres):
            sin_gate.add(path)
    asumidas = {p for p in sin_gate if p.startswith(("/api/usuarios", "/api/logs", "/api/config"))}
    assert sin_gate - asumidas == set()


def test_los_roles_no_se_cruzan_con_los_planes(app_con_ruta_gateada, como):
    # El plan decide si el módulo existe; el rol, quién lo usa. Con el módulo prendido, entran los dos roles.
    for rol in ROLES:
        assert como(rol).get(RUTA).status_code == 200
