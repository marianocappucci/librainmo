"""La app levanta, el login anda y está todo cableado."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import Config
from app.main import crear_app
from tests.conftest import CLAVE


def test_salud_es_publica_y_mide_la_base(anonimo):
    for ruta in ("/salud", "/health"):
        r = anonimo.get(ruta)
        assert r.status_code == 200, r.text
        assert r.json()["estado"] == "ok"
        assert r.json()["ts"]


def test_login_me_y_logout(app):
    cliente = TestClient(app, base_url="https://testserver")
    assert cliente.get("/auth/me").status_code == 401

    r = cliente.post("/auth/login", json={"username": "admin", "password": CLAVE})
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "admin"

    assert cliente.get("/auth/me").json()["username"] == "admin"
    assert cliente.post("/auth/logout").status_code == 200
    assert cliente.get("/auth/me").status_code == 401


def test_login_con_clave_mala_es_401(app):
    cliente = TestClient(app, base_url="https://testserver")
    r = cliente.post("/auth/login", json={"username": "admin", "password": "otra"})
    assert r.status_code == 401


def test_el_admin_inicial_es_fail_closed(base, config, monkeypatch):
    monkeypatch.delenv("LIBRAINMO_ADMIN_PASSWORD", raising=False)
    with pytest.raises(RuntimeError, match="LIBRAINMO_ADMIN_PASSWORD"):
        crear_app(config)


def test_sin_sembrar_admin_no_hace_falta_clave(base, config, monkeypatch):
    monkeypatch.delenv("LIBRAINMO_ADMIN_PASSWORD", raising=False)
    app = crear_app(config, sembrar_admin=False)
    assert app.state.users.list() == []


def test_la_app_no_arranca_con_una_base_sin_migrar(config, monkeypatch):
    from sqlalchemy import create_engine, text

    from app.config import Config as _Config
    from tests.conftest import base_auxiliar, soltar_base_auxiliar, url_de_base_auxiliar, url_de_tests

    # Una base vacía y propia (derivada de la de la suite): no se toca la de la suite.
    url = url_de_tests()
    vacia = url_de_base_auxiliar("vacia")
    nombre = base_auxiliar("vacia")
    raiz = create_engine(url, isolation_level="AUTOCOMMIT")
    with raiz.connect() as c:
        c.execute(text(f"DROP DATABASE IF EXISTS {nombre}"))
        c.execute(text(f"CREATE DATABASE {nombre}"))
    try:
        monkeypatch.setenv("LIBRAINMO_ADMIN_PASSWORD", CLAVE)
        with pytest.raises(RuntimeError, match="libraauth-migrar"):
            crear_app(_Config(database_url=vacia, entorno="test", directorio_de_datos=config.directorio_de_datos))
    finally:
        soltar_base_auxiliar(raiz, nombre)
        raiz.dispose()


def test_config_exige_postgresql(monkeypatch):
    monkeypatch.delenv("LIBRAINMO_DATABASE_URL", raising=False)
    monkeypatch.setenv("DATABASE_URL", "sqlite:///x.db")
    with pytest.raises(RuntimeError, match="PostgreSQL"):
        Config.desde_entorno()
    monkeypatch.delenv("DATABASE_URL")
    with pytest.raises(RuntimeError, match="LIBRAINMO_DATABASE_URL"):
        Config.desde_entorno()


def test_config_prefiere_el_nombre_con_prefijo_y_normaliza_el_driver(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg:///otra")
    monkeypatch.setenv("LIBRAINMO_DATABASE_URL", "postgresql://u:p@host/librainmo")
    monkeypatch.setenv("LIBRAINMO_ENTORNO", "prod")
    config = Config.desde_entorno()
    assert config.database_url == "postgresql+psycopg://u:p@host/librainmo"
    assert config.entorno == "prod"


def test_las_fechas_de_la_api_salen_en_hora_argentina(admin):
    # El ts de la sonda de salud es el reloj del motor: UTC-3 fijo.
    assert admin.get("/salud").json()["ts"].endswith("-03:00")


def test_los_headers_de_seguridad_envuelven_todas_las_respuestas(anonimo):
    from libracore.security_headers import CSP_SPA

    r = anonimo.get("/auth/me")  # un 401 también los lleva
    assert r.status_code == 401
    assert r.headers["content-security-policy"] == CSP_SPA
    assert r.headers["x-content-type-options"] == "nosniff"


def test_una_ruta_de_api_inexistente_es_404(anonimo):
    assert anonimo.get("/api/no-existe").status_code == 404


def test_empresa_la_lee_cualquier_rol_y_la_escribe_el_admin(como):
    assert como("operador").get("/api/config/empresa").status_code == 200
    r = como("admin").put("/api/config/empresa", json={"empresa_nombre": "Inmobiliaria Ficticia Sur"})
    assert r.status_code == 200, r.text
    assert como("operador").get("/api/config/empresa").json()["empresa_nombre"] == "Inmobiliaria Ficticia Sur"
    assert como("operador").put("/api/config/empresa", json={"empresa_nombre": "x"}).status_code == 403


def test_backup_es_del_admin(como):
    assert como("operador").get("/api/config/backups").status_code == 403
    assert como("admin").get("/api/config/backups").status_code == 200


def _correr_entrypoint(tmp_path, dist, codigo):
    """Importa `app.asgi` en un subproceso con `LIBRAINMO_FRONTEND_DIST=dist`."""
    import os
    import subprocess
    import sys
    from pathlib import Path

    from tests.conftest import url_de_tests

    raiz = Path(__file__).resolve().parent.parent
    entorno = {
        **os.environ,
        "DATABASE_URL": url_de_tests(),
        "SECRET_KEY": "x" * 32,
        "LIBRAINMO_ADMIN_PASSWORD": CLAVE,
        "DATA_DIR": str(tmp_path / "datos"),
        "LIBRAINMO_FRONTEND_DIST": str(dist),
    }
    r = subprocess.run(
        [sys.executable, "-c", codigo], cwd=raiz, env=entorno, capture_output=True, text=True, timeout=120
    )
    assert r.returncode == 0, r.stderr[-2000:]
    assert r.stdout.strip().endswith("ok")


def test_el_entrypoint_sirve_la_spa_con_build(base, tmp_path):
    """Con un build, `/` y una ruta del cliente devuelven `index.html`, y la API sigue siendo API."""
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)  # `montar_spa` monta `dist/assets`, como en un build de Vite
    (dist / "index.html").write_text("<html>spa-de-prueba</html>", encoding="utf-8")
    _correr_entrypoint(
        tmp_path,
        dist,
        "from fastapi.testclient import TestClient\n"
        "from app.asgi import app\n"
        "c = TestClient(app)\n"
        "assert 'spa-de-prueba' in c.get('/').text\n"
        "assert 'spa-de-prueba' in c.get('/contratos').text\n"
        "assert c.get('/api/nada').status_code == 404\n"
        "assert c.get('/salud').json()['estado'] == 'ok'\n"
        "print('ok')\n",
    )


def test_el_entrypoint_levanta_sin_frontend(base, tmp_path):
    """`app/asgi.py` arma la app al importar y, sin build del frontend, sirve sólo la API.

    En un subproceso porque importar `app.asgi` construye la app entera (siembra
    el admin, configura la auditoría): en medio de la suite pisaría el estado de
    los demás tests. El dist apunta a una carpeta vacía, así que el resultado no
    depende de si el repo tiene `frontend/dist` compilado.
    """
    _correr_entrypoint(
        tmp_path,
        tmp_path / "sin-build",
        "from fastapi.testclient import TestClient\n"
        "from app.asgi import app\n"
        "c = TestClient(app)\n"
        "assert c.get('/salud').json()['estado'] == 'ok'\n"
        "assert c.get('/').status_code == 404\n"  # no hay SPA que lo conteste
        "print('ok')\n",
    )
