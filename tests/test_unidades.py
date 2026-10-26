"""Las piezas chicas sin router: errores de dominio, base declarativa, etiquetas del log y el engine perezoso."""

from __future__ import annotations

from datetime import datetime

import pytest
from fastapi import APIRouter
from libraauth.auditoria import etiqueta_por_defecto
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app import db, tiempo
from app.auditoria import etiqueta_segura
from app.errores import Conflicto, ErrorDeDominio, Invalido, NoEncontrado, Prohibido
from app.migrar import main as migrar_main
from app.models.base import ConTiempos, en_lista
from tests.conftest import base_auxiliar, soltar_base_auxiliar, url_de_base_auxiliar, url_de_tests


@pytest.mark.parametrize(
    ("error", "status"),
    [(ErrorDeDominio, 400), (NoEncontrado, 404), (Conflicto, 409), (Invalido, 422), (Prohibido, 403)],
)
def test_un_error_de_dominio_se_contesta_con_su_codigo(app, admin, error, status):
    """Los servicios levantan errores de dominio y un único handler los traduce a HTTP."""
    router = APIRouter()

    @router.get("/api/_prueba/error")
    def _falla():
        raise error("No se puede, por el motivo que sea.")

    app.include_router(router)
    r = admin.get("/api/_prueba/error")
    assert r.status_code == status
    assert r.json() == {"detail": "No se puede, por el motivo que sea."}


def test_en_lista_arma_el_check_de_un_enum():
    assert en_lista("estado", ["vigente", "rescindido"]) == "estado IN ('vigente', 'rescindido')"


def test_los_tiempos_de_los_modelos_son_la_hora_de_argentina():
    # Con una base declarativa propia: un modelo de prueba en la `Base` del producto ensuciaría su MetaData.
    class _Otra(DeclarativeBase):
        pass

    class Prueba(ConTiempos, _Otra):
        __tablename__ = "prueba"
        id: Mapped[int] = mapped_column(primary_key=True)

    por_defecto = Prueba.__table__.c.creado_en.default.arg(None)
    assert isinstance(por_defecto, datetime)
    assert por_defecto.utcoffset() == tiempo.ahora().utcoffset()


def test_la_etiqueta_segura_es_la_del_motor_salvo_las_entidades_sin_etiqueta(monkeypatch):
    class Contrato:
        id = 7

        def __str__(self) -> str:
            return "Contrato 7"

    assert etiqueta_segura(Contrato()) == etiqueta_por_defecto(Contrato())  # sin entidades marcadas, la arma el motor
    monkeypatch.setattr("app.auditoria.ENTIDADES_SIN_ETIQUETA", frozenset({"Contrato"}))
    assert etiqueta_segura(Contrato()) == ""


def test_el_engine_se_arma_solo_la_primera_vez(base, monkeypatch):
    monkeypatch.setattr(db, "_engine", None)
    monkeypatch.setattr(db, "_Sesion", None)
    assert db.engine() is not None
    monkeypatch.setattr(db, "_Sesion", None)
    assert db.fabrica_de_sesiones() is not None
    monkeypatch.setattr(db, "_Sesion", None)
    sesiones = db.obtener_sesion()
    sesion = next(sesiones)
    assert sesion.execute(db.text("SELECT 1")).scalar() == 1
    sesiones.close()


def test_el_comando_migra_la_base_que_se_le_pasa():
    """`python -m app.migrar <url>` (en proceso: el subproceso de `test_motor.py` no suma cobertura)."""
    from sqlalchemy import create_engine, text

    destino = url_de_base_auxiliar("comando")
    nombre = base_auxiliar("comando")
    raiz = create_engine(url_de_tests(), isolation_level="AUTOCOMMIT")
    with raiz.connect() as c:
        c.execute(text(f"DROP DATABASE IF EXISTS {nombre} WITH (FORCE)"))
        c.execute(text(f"CREATE DATABASE {nombre}"))
    try:
        assert migrar_main([destino]) == 0
        motor = create_engine(destino)
        try:
            with motor.connect() as c:
                assert c.execute(text("SELECT COUNT(*) FROM clients")).scalar() == 0
        finally:
            motor.dispose()
    finally:
        soltar_base_auxiliar(raiz, nombre)
        raiz.dispose()


def test_el_comando_sin_argumentos_migra_la_base_del_entorno(base, monkeypatch):
    monkeypatch.setenv("LIBRAINMO_DATABASE_URL", url_de_tests())
    assert migrar_main([]) == 0
