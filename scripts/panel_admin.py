#!/usr/bin/env python3
"""Panel de administración de LibraInmo.

    python3 scripts/panel_admin.py            → menú interactivo
    python3 scripts/panel_admin.py listar
    python3 scripts/panel_admin.py backup micliente

Envoltorio de configuración sobre `libracore.provisioning.panel_admin`. Es
además lo que consume el backoffice compartido (`libra-backoffice`) a través de
`libracore.admin.services`: sin este archivo, LibraInmo se podría listar pero
no operar.
"""
from pathlib import Path

from libracore.provisioning import (
    client_from_config,
    configure,
    forward_host_from_config,
    get_config,
    le_email_from_config,
    npm_available,
)
from libracore.provisioning.panel_admin import (
    _set_servicio_estado,
    cli,
    cmd_activar,
    cmd_actualizar,
    cmd_backup,
    cmd_backup_all,
    cmd_eliminar,
    cmd_estado_servicio,
    cmd_info,
    cmd_list_backups,
    cmd_listar,
    cmd_logs,
    cmd_npm_crear,
    cmd_npm_eliminar,
    cmd_npm_listar,
    cmd_pausar,
    cmd_restart,
    cmd_restore_db,
    cmd_start,
    cmd_stop,
    cmd_suspender,
    compose,
    container_status,
    find_client,
    interactive,
    load_clients,
    pick_client,
)

#: Re-exportados: es la interfaz que consume el backoffice compartido a través
#: de `libracore.admin.services`. Van en `__all__` para que quede escrito que la
#: razón de importarlos es exponerlos, y para que el linter no los borre por
#: "no usados".
__all__ = [
    "cli", "cmd_activar", "cmd_actualizar", "cmd_backup", "cmd_backup_all",
    "cmd_eliminar", "cmd_estado_servicio", "cmd_info", "cmd_list_backups",
    "cmd_listar", "cmd_logs", "cmd_npm_crear", "cmd_npm_eliminar",
    "cmd_npm_listar", "cmd_pausar", "cmd_restart", "cmd_restore_db",
    "cmd_start", "cmd_stop", "cmd_suspender", "compose", "container_status",
    "find_client", "interactive", "load_clients", "pick_client",
    "_set_servicio_estado",
    "client_from_config", "configure", "forward_host_from_config",
    "le_email_from_config", "npm_available",
    "CLIENTES_DIR", "REPO_ROOT", "_NPM_AVAILABLE",
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

# Re-exportado por compatibilidad con cualquier uso directo de este módulo. La
# fuente de verdad es el motor: `LIBRA_CLIENTES_DIR` o, sin ella, `REPO_ROOT/clientes`.
CLIENTES_DIR = get_config().clientes_dir

_NPM_AVAILABLE = npm_available()

if __name__ == "__main__":
    cli()
