#!/usr/bin/env python3
"""Alta de un cliente nuevo de LibraInmo.

    python3 scripts/nuevo_cliente.py

Envoltorio de configuración sobre `libracore.provisioning.nuevo_cliente`: la lógica es la del motor, la misma que la
de los otros productos. La configuración es la misma que la de `panel_admin.py`.
"""
from pathlib import Path

from libracore.provisioning import configure, get_config
from libracore.provisioning.nuevo_cliente import (
    ClienteError,
    ask,
    build_image,
    crear_cliente,
    image_exists,
    main,
    network_exists,
    next_port,
    slugify,
    used_ports,
)

#: Re-exportados: `libracore.admin.services` y los scripts del servidor los buscan en este módulo.
__all__ = [
    "ClienteError", "ask", "build_image", "crear_cliente", "image_exists",
    "main", "network_exists", "next_port", "slugify", "used_ports",
    "configure", "CLIENTES_DIR", "REPO_ROOT",
]

REPO_ROOT = Path(__file__).parent.parent.resolve()

# 🔴 Este bloque está IGUAL en `nuevo_cliente.py` y `panel_admin.py`, y va LITERAL, sin `**` ni variables: el motor lee
# las `migraciones=` del commit de cada imagen con `ast` (`libracore.provisioning.migraciones_declaradas`), sin importar
# el script. Con `configure(**CONFIGURACION)` no veía ninguna y el alta de la demo (2026-10-26) arrancó sin migrar.
# `configure()` pisa un `_cfg` global y `libracore.admin.services` importa los dos módulos en el mismo proceso: si se
# desviaran, ganaría el último import. `tests/test_despliegue.py` compara los dos bloques.
configure(
    product_name="LIBRAINMO",
    image_name="librainmo:latest",
    container_prefix="librainmo",
    # Vestigio del tiempo de SQLite: obligatorio para el motor y lo muestra el backoffice. Con `postgres=True` no se
    # crea ningún archivo.
    db_filename="librainmo.db",
    repo_root=REPO_ROOT,
    postgres=True,
    # Una sola base: el schema del motor vive en la del dominio (ADR-002); `librainmo` está en `_UNA_SOLA_BASE` desde
    # libracore v1.197.0.
    base_core_separada=False,
    # La misma imagen que el CI y que dev: el collation viene de la imagen.
    postgres_image="postgres:16",
    # El backup del cron es el mismo ZIP que la pantalla de Datos / Backup (`build_backup_router` en `app/main.py`).
    backup_zip=True,
    # 🔴 El deploy corre las migraciones antes del `up -d` (`cmd_actualizar`), con el código nuevo: si fallan, aborta.
    # Tres cadenas, en el orden de `python -m app.migrar` y del compose de dev: `libraauth` primero (las FK del motor
    # apuntan a `usuarios`), después el motor y al final el dominio, cuyas FK apuntan a `clients` y `cc_asientos`.
    migraciones=(
        ("libraauth-migrar", "upgrade", "--prefijo", "librainmo", "--base", "dominio"),
        ("libracore-migrar", "upgrade", "--prefijo", "librainmo"),
        ("alembic", "upgrade", "head"),
    ),
    # El 8100 a 8105 los usan otros productos (medido con `ss -ltn` en el VPS el 2026-10-26) y el 8107 es
    # `librainmo-dev`. `next_port()` sube desde acá mientras el puerto esté usado por cualquier contenedor del host.
    base_port=8110,
)

CLIENTES_DIR = get_config().clientes_dir

if __name__ == "__main__":
    main()
