"""LibraInmo usa el schema de `libracore` en la MISMA base que el dominio (ADR-002).

Lo que se mide acá es que, después de `python -m app.migrar`, las tablas del motor sobre las que se
va a construir el producto existen: los clientes (inquilinos, propietarios y garantes), el libro
de terceros, los recibos, las facturas y los índices de ajuste.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text

from tests.conftest import base_auxiliar, soltar_base_auxiliar, url_de_base_auxiliar, url_de_tests

TABLAS_DEL_MOTOR = ("clients", "cc_asientos", "recibos", "facturas", "indices_ajuste")
RAIZ = Path(__file__).resolve().parent.parent


@pytest.fixture
def base_migrada_por_el_comando():
    """Una base `<la de la suite>_motor`, migrada por el COMANDO (`python -m app.migrar`), como el deploy."""
    url = url_de_tests()
    destino = url_de_base_auxiliar("motor")
    nombre = base_auxiliar("motor")
    raiz = create_engine(url, isolation_level="AUTOCOMMIT")
    with raiz.connect() as c:
        c.execute(text(f"DROP DATABASE IF EXISTS {nombre} WITH (FORCE)"))
        c.execute(text(f"CREATE DATABASE {nombre}"))
    resultado = subprocess.run(
        [sys.executable, "-m", "app.migrar", destino], cwd=RAIZ, capture_output=True, text=True, timeout=300
    )
    assert resultado.returncode == 0, resultado.stderr[-2000:]
    yield destino
    soltar_base_auxiliar(raiz, nombre)
    raiz.dispose()


def test_despues_de_migrar_estan_las_tablas_del_motor_en_la_misma_base(base_migrada_por_el_comando):
    motor = create_engine(base_migrada_por_el_comando)
    try:
        tablas = set(inspect(motor).get_table_names())
        assert set(TABLAS_DEL_MOTOR) <= tablas
        # Y conviven, en esa misma base, con las del dominio y las de `libraauth`.
        assert {"actividad_log", "usuarios"} <= tablas
    finally:
        motor.dispose()


def test_las_tablas_del_motor_se_pueden_consultar_con_el_core_configurado(app):
    """`crear_app()` configura `libracore.db.core` sobre la base del dominio: el SQL crudo del motor la ve."""
    from libracore.db import core

    assert core.esta_configurado()
    with core.get_connection() as conexion:
        for tabla in TABLAS_DEL_MOTOR:
            assert conexion.execute(f"SELECT COUNT(*) FROM {tabla}").fetchone()[0] == 0, tabla


def test_el_libro_de_terceros_y_los_indices_tienen_la_forma_que_el_producto_supone(base):
    """Un canario del motor: si un tag nuevo de `libracore` cambia estas columnas, se nota acá y no en la fase 1."""
    with base.connect() as conexion:

        def columnas(tabla: str) -> set[str]:
            return {
                c[0]
                for c in conexion.execute(
                    text("SELECT column_name FROM information_schema.columns WHERE table_name = :t"), {"t": tabla}
                )
            }

        assert {"tercero_id", "rol"} <= columnas("cc_asientos")
        assert columnas("indices_ajuste")  # la tabla existe y tiene columnas


def test_el_contrato_del_backoffice_lee_los_modulos_sin_arrancar_la_app(base, tmp_path):
    """El backoffice corre `from app.database import get_modulos` ADENTRO del contenedor, sin `crear_app()`.

    Se prueba en un subproceso limpio, que es la forma en que lo corre `docker exec`: con el core sin
    configurar, `app.database` lo apunta solo a la base de la instancia.
    """
    import os

    # La app de la fixture dejó el módulo sembrado: se siembra a mano, como lo deja el primer arranque.
    from libracore.provisioning import apply_plan_modules

    from tests.conftest import url_de_tests

    apply_plan_modules(url_de_tests(), active_modules={"alquileres"}, all_modules={"alquileres"}, plan="alquileres")
    resultado = subprocess.run(
        [sys.executable, "-c", "from app.database import get_modulos; print(get_modulos())"],
        cwd=RAIZ,
        env={**os.environ, "LIBRAINMO_DATABASE_URL": url_de_tests()},
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert resultado.returncode == 0, resultado.stderr[-2000:]
    assert resultado.stdout.strip() == "{'alquileres': True}"


def test_set_addon_cambia_el_estado_que_lee_el_backoffice(app):
    from app import database

    database.set_addon("alquileres", False)
    assert database.get_modulos() == {"alquileres": False}
    assert app.state.modules.is_enabled("alquileres") is False
    database.set_addon("alquileres", True)
    assert database.get_modulos() == {"alquileres": True}
