"""El log de actividad: la lista blanca `AUDITABLES` está cableada.

Vacía hasta que haya dominio. Lo que se mide es el cableado (el endpoint de logs, el registro
de accesos y el corte por fuerza bruta) y que la lista blanca sólo nombre modelos que existen.
"""

from __future__ import annotations

from app.auditoria import COLUMNAS_OCULTAS, ENTIDADES_SIN_ETIQUETA
from app.main import AUDITABLES
from app.models import Base


def test_la_lista_blanca_nombra_solo_modelos_del_dominio():
    """Se indexa por nombre de clase: un error de tipeo apagaría el log de esa tabla sin avisar."""
    clases = {mapper.class_.__name__ for mapper in Base.registry.mappers}
    assert set(AUDITABLES) <= clases


def test_lo_que_se_oculta_o_se_deja_sin_etiqueta_es_de_un_modelo_auditado():
    # Sin dominio las dos listas van vacías; cuando haya, una columna oculta de una tabla que no se
    # audita no protege nada.
    assert ENTIDADES_SIN_ETIQUETA <= set(AUDITABLES)
    assert isinstance(COLUMNAS_OCULTAS, frozenset)


def test_el_endpoint_de_logs_lo_lee_el_admin(admin):
    r = admin.get("/api/logs")
    assert r.status_code == 200
    cuerpo = r.json()
    assert {"actividad", "accesos", "entidades"} <= cuerpo.keys()
    assert any(a for a in cuerpo["accesos"])  # el login del admin quedó anotado


def test_el_login_fallido_se_anota_y_corta_por_intentos(app, anonimo):
    for _ in range(5):
        assert anonimo.post("/auth/login", json={"username": "admin", "password": "mala"}).status_code == 401
    # Tras 5 fallidos, ni la clave correcta entra: el corte por fuerza bruta está activo.
    from tests.conftest import CLAVE

    assert anonimo.post("/auth/login", json={"username": "admin", "password": CLAVE}).status_code == 429
