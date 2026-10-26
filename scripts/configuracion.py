"""La configuración de provisioning de LibraInmo, **una sola vez**.

`libracore.provisioning.configure()` pisa un `_cfg` global, y `libracore.admin.services` importa `nuevo_cliente` y
`panel_admin` en el mismo proceso: si cada uno trajera su bloque, ganaría el último import y un desvío entre los dos
saldría con la configuración equivocada. LibraClub lo resuelve con dos bloques iguales y un test que los compara; acá
los dos scripts llaman a `configure(**CONFIGURACION)` con este diccionario y no hay nada que comparar.
"""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent.resolve()

CONFIGURACION = dict(
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
