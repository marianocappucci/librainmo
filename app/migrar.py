"""Aplica las migraciones, en este orden: la cadena de `libraauth` (sus tablas,
`usuarios` incluida), la de `libracore` (el schema del motor: clientes, facturas,
libro de terceros, recibos, índices de ajuste…) y por último la propia del dominio.

    python -m app.migrar            # usa LIBRAINMO_DATABASE_URL o DATABASE_URL
    python -m app.migrar <url>      # contra una base explícita

Es lo que corre el compose de desarrollo antes de levantar la app, y lo que
usan los tests para dejar la base como la deja el deploy.

🔴 **El orden importa.** El dominio va último porque sus tablas van a apuntar con claves
foráneas a las del motor (`clients`) y a `usuarios`; y `libracore` va después de
`libraauth` porque las FK del motor referencian `usuarios`. Las tres cadenas comparten la
base y llevan cada una su tabla de versión (`alembic_version_libraauth`, `alembic_version`
—la de `libracore`— y `alembic_version_librainmo`): con una sola se pisarían la revisión.
"""

from __future__ import annotations

import sys
from pathlib import Path

from alembic import command
from alembic.config import Config as AlembicConfig
from libraauth import migrar as migrar_libraauth
from libracore import migrar as migrar_libracore

RAIZ = Path(__file__).resolve().parent.parent


def configuracion_del_dominio(url: str) -> AlembicConfig:
    cfg = AlembicConfig(str(RAIZ / "alembic.ini"))
    cfg.set_main_option("script_location", str(RAIZ / "migrations"))
    # `%` se duplica porque el Config de alembic interpola.
    cfg.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    return cfg


def migrar(url: str) -> None:
    url = migrar_libraauth.normalizar_url(url)
    migrar_libraauth.upgrade(url)
    # El schema del motor va en la MISMA base que el dominio (ADR-002). Se le pasa la URL
    # explícita —no un prefijo— para no depender de `libracore.db.url_de_instancia._UNA_SOLA_BASE`,
    # que todavía no conoce a este producto.
    migrar_libracore.upgrade(url)
    command.upgrade(configuracion_del_dominio(url), "head")


def main(argv: list[str] | None = None) -> int:
    from app.config import Config

    argv = list(sys.argv[1:] if argv is None else argv)
    url = argv[0] if argv else Config.desde_entorno().database_url
    migrar(url)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
