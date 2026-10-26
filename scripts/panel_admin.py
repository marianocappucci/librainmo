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

try:  # corrido como `python3 scripts/panel_admin.py` o importado por `libracore.admin.services`
    from configuracion import CONFIGURACION, REPO_ROOT
except ImportError:  # importado como `scripts.panel_admin` (los tests)
    from scripts.configuracion import CONFIGURACION, REPO_ROOT

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

configure(**CONFIGURACION)

# Re-exportado por compatibilidad con cualquier uso directo de este módulo. La
# fuente de verdad es el motor: `LIBRA_CLIENTES_DIR` o, sin ella, `REPO_ROOT/clientes`.
CLIENTES_DIR = get_config().clientes_dir

_NPM_AVAILABLE = npm_available()

if __name__ == "__main__":
    cli()
