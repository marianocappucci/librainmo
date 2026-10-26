#!/usr/bin/env python3
"""Alta de un cliente nuevo de LibraInmo.

    python3 scripts/nuevo_cliente.py

Envoltorio de configuración sobre `libracore.provisioning.nuevo_cliente`: la lógica es la del motor, la misma que la
de los otros productos. La configuración sale de `scripts/configuracion.py`, la misma que usa `panel_admin.py`.
"""
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

try:  # corrido como `python3 scripts/nuevo_cliente.py` o importado por `libracore.admin.services`
    from configuracion import CONFIGURACION, REPO_ROOT
except ImportError:  # importado como `scripts.nuevo_cliente` (los tests)
    from scripts.configuracion import CONFIGURACION, REPO_ROOT

#: Re-exportados: `libracore.admin.services` y los scripts del servidor los buscan en este módulo.
__all__ = [
    "ClienteError", "ask", "build_image", "crear_cliente", "image_exists",
    "main", "network_exists", "next_port", "slugify", "used_ports",
    "configure", "CLIENTES_DIR", "REPO_ROOT",
]

configure(**CONFIGURACION)

CLIENTES_DIR = get_config().clientes_dir

if __name__ == "__main__":
    main()
