"""Las migraciones: desde una base vacía, hasta la cabeza, y de ida y vuelta.

Son TRES cadenas sobre la misma base (`libraauth`, `libracore` y la del dominio), cada una
con su tabla de versión, y `python -m app.migrar` las corre en ese orden.
"""

from __future__ import annotations

import re

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text

from app.db import (
    TABLA_DE_VERSION,
    EsquemaDesactualizado,
    cabeza_de_libracore,
    cabeza_del_dominio,
    exigir_dominio_al_dia,
    exigir_libracore_al_dia,
)
from app.migrar import configuracion_del_dominio, migrar
from app.models import Base
from tests.conftest import base_auxiliar, soltar_base_auxiliar, url_de_base_auxiliar, url_de_tests

#: Lo que crea la cadena del dominio. `modulos` NO está: la trae la de `libracore` (ADR-002).
TABLAS_DEL_DOMINIO = {"actividad_log"}
TABLAS_DE_LIBRAAUTH = {"usuarios", "auth_log", "aceptaciones_terminos", "smtp_settings", "password_reset_tokens"}
TABLAS_DE_LIBRACORE = {"clients", "facturas", "recibos", "cc_asientos", "indices_ajuste", "modulos"}


@pytest.fixture
def base_vacia():
    """Una base `<la de la suite>_migracion` recién creada, aparte de la de la suite."""
    url = url_de_tests()
    destino = url_de_base_auxiliar("migracion")
    nombre = base_auxiliar("migracion")
    raiz = create_engine(url, isolation_level="AUTOCOMMIT")
    with raiz.connect() as c:
        c.execute(text(f"DROP DATABASE IF EXISTS {nombre} WITH (FORCE)"))
        c.execute(text(f"CREATE DATABASE {nombre}"))
    yield destino
    soltar_base_auxiliar(raiz, nombre)
    raiz.dispose()


def test_upgrade_desde_vacio_crea_todo(base_vacia):
    migrar(base_vacia)
    motor = create_engine(base_vacia)
    try:
        tablas = set(inspect(motor).get_table_names())
        assert TABLAS_DEL_DOMINIO <= tablas
        assert TABLAS_DE_LIBRAAUTH <= tablas
        assert TABLAS_DE_LIBRACORE <= tablas
        # Una tabla de versión por cadena: con una sola se pisarían la revisión.
        assert {TABLA_DE_VERSION, "alembic_version_libraauth", "alembic_version"} <= tablas
        assert exigir_dominio_al_dia(motor) == cabeza_del_dominio()
        assert exigir_libracore_al_dia(motor, base_vacia) == cabeza_de_libracore(base_vacia)
    finally:
        motor.dispose()


def test_migrar_dos_veces_es_idempotente(base_vacia):
    migrar(base_vacia)
    migrar(base_vacia)
    motor = create_engine(base_vacia)
    try:
        assert exigir_dominio_al_dia(motor) == cabeza_del_dominio()
        assert exigir_libracore_al_dia(motor, base_vacia) == cabeza_de_libracore(base_vacia)
    finally:
        motor.dispose()


def test_el_dominio_tiene_una_sola_cabeza():
    assert len(ScriptDirectory.from_config(configuracion_del_dominio("")).get_heads()) == 1


def test_los_ids_de_revision_entran_en_la_tabla_de_version():
    """`alembic_version.version_num` es `VARCHAR(32)`: un id más largo corta el deploy con un
    error de PostgreSQL que no nombra la migración."""
    revisiones = ScriptDirectory.from_config(configuracion_del_dominio("")).walk_revisions()
    largos = [r.revision for r in revisiones if len(r.revision) > 32]
    assert largos == []


def test_los_archivos_de_revision_se_llaman_como_su_id():
    """`NNNN_descripcion.py` con el id `NNNN`: lo que lee el humano en el árbol es lo que corre Alembic."""
    from app.migrar import RAIZ

    for archivo in sorted((RAIZ / "migrations" / "versions").glob("*.py")):
        contenido = archivo.read_text(encoding="utf-8")
        id_ = re.search(r'^revision = "([^"]+)"', contenido, re.M).group(1)
        assert archivo.name.startswith(id_), archivo.name


def test_downgrade_hasta_la_base_y_vuelta_a_subir(base_vacia):
    migrar(base_vacia)
    cfg = configuracion_del_dominio(base_vacia)
    command.downgrade(cfg, "base")
    motor = create_engine(base_vacia)
    try:
        tablas = set(inspect(motor).get_table_names())
        assert not (TABLAS_DEL_DOMINIO & tablas)
        # Las de `libraauth` y las de `libracore` no son de esta cadena.
        assert "usuarios" in tablas
        assert "clients" in tablas
    finally:
        motor.dispose()
    command.upgrade(cfg, "head")


def test_el_modelo_y_la_migracion_dicen_lo_mismo(base_vacia):
    """Si alguien cambia un modelo sin escribir la migración (o al revés), esto
    se pone rojo. Compara sólo las tablas del dominio: las de `libraauth`, las del
    motor y las de versión son de otras cadenas."""
    migrar(base_vacia)
    motor = create_engine(base_vacia)
    try:
        with motor.connect() as conexion:
            contexto = MigrationContext.configure(
                conexion,
                opts={
                    "compare_type": True,
                    "version_table": TABLA_DE_VERSION,
                    "include_object": lambda obj, nombre, tipo, reflejado, comparado: (
                        nombre in Base.metadata.tables if tipo == "table" else True
                    ),
                },
            )
            diferencias = compare_metadata(contexto, Base.metadata)
        assert diferencias == []
    finally:
        motor.dispose()


def test_la_base_sin_migrar_no_pasa_la_guarda(base_vacia):
    motor = create_engine(base_vacia)
    try:
        with pytest.raises(EsquemaDesactualizado, match="python -m app.migrar"):
            exigir_dominio_al_dia(motor)
        with pytest.raises(EsquemaDesactualizado, match="python -m app.migrar"):
            exigir_libracore_al_dia(motor, base_vacia)
    finally:
        motor.dispose()


def test_la_base_en_otra_revision_no_pasa_la_guarda(base_vacia):
    """Con una sola revisión no hay «a medias» posible: se simula una base que quedó en una revisión
    que no es la cabeza (la de un deploy anterior, o una migración que no corrió)."""
    migrar(base_vacia)
    motor = create_engine(base_vacia)
    try:
        with motor.begin() as c:
            c.execute(text(f"UPDATE {TABLA_DE_VERSION} SET version_num = '0000'"))
            c.execute(text("UPDATE alembic_version SET version_num = '0000'"))
        with pytest.raises(EsquemaDesactualizado, match="'0000'"):
            exigir_dominio_al_dia(motor)
        with pytest.raises(EsquemaDesactualizado, match="'0000'"):
            exigir_libracore_al_dia(motor, base_vacia)
    finally:
        motor.dispose()


def test_la_app_no_arranca_si_falta_la_cadena_de_libracore(base_vacia, tmp_path, monkeypatch):
    """Con `libraauth` y el dominio al día pero la cadena del motor sin versión, `crear_app()` corta y dice qué correr.

    Es la guarda que le faltaba a `libracore.db.core` (SQL crudo): sin ella la app levanta y falla
    en la primera consulta a una tabla que no está. Desde la `0002` el dominio no se puede migrar sin el
    motor (sus claves foráneas apuntan a `clients`), así que se migra todo y se le saca la versión al motor:
    es la base a la que alguien le corrió las cadenas a mano y salteó la del motor en un deploy.
    """
    from app.config import Config
    from app.main import crear_app

    migrar(base_vacia)
    motor = create_engine(base_vacia)
    try:
        with motor.begin() as conexion:
            conexion.execute(text("DROP TABLE alembic_version"))
    finally:
        motor.dispose()
    monkeypatch.setenv("LIBRAINMO_ADMIN_PASSWORD", "clave-de-prueba")
    config = Config(database_url=base_vacia, entorno="test", directorio_de_datos=str(tmp_path / "datos"))
    with pytest.raises(EsquemaDesactualizado, match="libracore"):
        crear_app(config)
