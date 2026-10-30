"""La marca blanca está cableada: la instancia puede tener nombre, color y logo del revendedor (libracore ADR-092)

Lo que se mide acá es el **cableado** del producto, no el motor: que las rutas estén montadas, que escribir las gatee el
rol del producto y que el mail de recuperación salga con el nombre de la marca. El comportamiento lo prueba `libracore`.
"""

from __future__ import annotations

import pytest

MARCA = {"nombre": "Inmobiliaria Modelo", "nombre_corto": "Modelo", "color": "#c0392b"}


def test_sin_marca_la_instancia_es_la_del_producto(anonimo):
    r = anonimo.get("/api/marca")
    assert r.status_code == 200
    assert r.json()["propia"] is False
    assert r.json()["terminos_propios"] is False


def test_el_admin_carga_la_marca_y_cualquiera_la_lee(admin, anonimo):
    assert admin.put("/api/marca", json=MARCA).status_code == 200
    leida = anonimo.get("/api/marca").json()  # sin sesión: el login también lleva la marca
    assert leida["propia"] is True
    assert leida["nombre"] == "Inmobiliaria Modelo"
    assert leida["color"] == "#c0392b"


@pytest.mark.parametrize("metodo", ["put", "delete"])
def test_sin_sesion_no_se_escribe_la_marca(anonimo, metodo):
    r = anonimo.request(metodo, "/api/marca", json=MARCA if metodo == "put" else None)
    assert r.status_code in (401, 403)


def test_un_operador_no_escribe_la_marca(como):
    assert como("operador").put("/api/marca", json=MARCA).status_code == 403


def test_sin_sesion_no_se_escriben_los_terminos_propios(anonimo):
    r = anonimo.put("/api/marca/terminos", json={"version": "r-1.0", "vigente_desde": "01-01-2026", "texto": "x"})
    assert r.status_code in (401, 403)


def test_el_manifest_es_el_de_la_marca_y_no_el_index_de_la_spa(admin, anonimo):
    admin.put("/api/marca", json=MARCA)
    r = anonimo.get("/manifest.webmanifest")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/manifest+json")
    assert r.json()["name"] == "Inmobiliaria Modelo"


def test_el_mail_de_recuperacion_sale_con_el_nombre_de_la_marca(app, admin):
    reset = app.state.password_reset
    assert reset.product_name == "LibraInmo"
    admin.put("/api/marca", json=MARCA)
    assert reset.product_name == "Inmobiliaria Modelo"
    admin.delete("/api/marca")
    assert reset.product_name == "LibraInmo"


def test_el_manifest_le_gana_al_catch_all_de_la_spa(base, tmp_path):
    """🔴 Con un build, la SPA contesta `index.html` a cualquier ruta que no conozca. Si la marca se montara después,
    el navegador leería HTML como manifest. Corre el entrypoint real (`app.asgi`) con un build de juguete."""
    from tests.test_infraestructura import _correr_entrypoint

    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>spa-de-prueba</html>", encoding="utf-8")
    (dist / "manifest.webmanifest").write_text('{"name": "LibraInmo", "icons": []}', encoding="utf-8")
    _correr_entrypoint(
        tmp_path,
        dist,
        "from fastapi.testclient import TestClient\n"
        "from app.asgi import app\n"
        "c = TestClient(app)\n"
        "r = c.get('/manifest.webmanifest')\n"
        "assert r.status_code == 200 and r.json()['name'] == 'LibraInmo', r.text\n"
        "assert 'manifest' in r.headers['content-type'], r.headers\n"
        "assert c.get('/api/marca').json()['propia'] is False\n"
        "print('ok')\n",
    )
