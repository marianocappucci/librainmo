"""Lo que hace falta para dev y demo: la configuración de provisioning y la semilla de la demo.

- `nuevo_cliente.py` y `panel_admin.py` declaran el MISMO `configure(...)`, literal: el motor lee las migraciones de ahí
  con `ast`, sin importar el script.
- Las migraciones del deploy (`cmd_actualizar`) y las del compose de dev son las mismas tres cadenas, en el mismo orden.
- El compose de dev no monta el checkout ni corre con `--reload` (`reglas/deploy.md`).
- La semilla de la demo deja un mes de trabajo con datos ficticios y una segunda corrida no hace nada.
"""

from __future__ import annotations

import ast
import importlib
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def test_los_dos_scripts_cargan_la_misma_configuracion(monkeypatch):
    monkeypatch.syspath_prepend(str(RAIZ / "scripts"))
    monkeypatch.syspath_prepend(str(RAIZ))
    from libracore.provisioning import get_config

    for modulo in ("panel_admin", "nuevo_cliente"):
        sys.modules.pop(modulo, None)
        importlib.import_module(modulo)
        c = get_config()
        assert (c.product_name, c.container_prefix, c.postgres, c.base_port) == ("LIBRAINMO", "librainmo", True, 8110)


def test_los_dos_scripts_declaran_el_mismo_configure_literal():
    def configure_de(nombre):
        arbol = ast.parse((RAIZ / "scripts" / nombre).read_text(encoding="utf-8"))
        llamadas = [n for n in ast.walk(arbol) if isinstance(n, ast.Call) and getattr(n.func, "id", "") == "configure"]
        (llamada,) = llamadas
        assert all(k.arg for k in llamada.keywords), f"{nombre}: configure(...) con ** no lo puede leer el motor"
        return ast.dump(llamada)

    assert configure_de("nuevo_cliente.py") == configure_de("panel_admin.py")


def test_las_migraciones_del_deploy_y_de_dev_son_las_mismas():
    from libracore.provisioning import SCRIPT_DEL_ALTA, SCRIPT_DEL_PANEL, migraciones_declaradas

    # Las lee el motor como en un alta o un deploy: si un `**` o una variable las escondiera, acá saldría vacío.
    del_alta = migraciones_declaradas(RAIZ, SCRIPT_DEL_ALTA)
    assert migraciones_declaradas(RAIZ, SCRIPT_DEL_PANEL) == del_alta
    del_deploy = [" ".join(m) for m in del_alta]
    compose = (RAIZ / "docker-compose.yml").read_text(encoding="utf-8")
    comando = compose.split("command: >-", 1)[1].split("environment:", 1)[0]
    de_dev = [re.sub(r"\s+", " ", x).strip() for x in re.split(r"&&", comando.replace('sh -c "', ""))][:-1]
    assert de_dev == del_deploy
    assert del_deploy[0].startswith("libraauth-migrar") and del_deploy[-1] == "alembic upgrade head"


def test_dev_no_monta_el_checkout_ni_recarga():
    compose = (RAIZ / "docker-compose.yml").read_text(encoding="utf-8")
    servicio = compose.split("librainmo-dev:", 1)[1]
    assert "./:/app" not in servicio and "--reload" not in servicio
    assert "COPY scripts ./scripts" in (RAIZ / "Dockerfile").read_text(encoding="utf-8")


def test_la_semilla_deja_un_mes_de_trabajo_y_no_se_repite(app, sesion):
    from app.servicios import cobros, contratos, cuotas, liquidaciones, propiedades
    from scripts.semilla_demo import sembrar

    r = sembrar(sesion)
    assert r == {"sembrado": True, "propiedades": 4, "contratos": 3}
    assert len(propiedades.buscar(sesion)) == 4
    assert {c["estado"] for c in contratos.buscar(sesion)} == {"vigente"}
    assert len(cobros.buscar(sesion)) >= 6
    assert cuotas.buscar(sesion, estado="pendiente")                     # hay atrasadas y del mes
    assert [x["estado"] for x in liquidaciones.buscar(sesion)] == ["emitida"]
    assert sembrar(sesion) == {"sembrado": False, "motivo": "ya hay propiedades"}
