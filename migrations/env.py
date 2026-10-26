from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from libraauth.migrar import normalizar_url
from sqlalchemy import engine_from_config, pool

from app.db import TABLA_DE_VERSION
from app.models import Base

config = context.config
if config.config_file_name:
    # `disable_existing_loggers=False`: migrar desde la suite no tiene que
    # silenciar los loggers que ya creó pytest.
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# La URL la pone `app.migrar` (`sqlalchemy.url`); si se corre `alembic` a mano,
# sale del entorno.
url = config.get_main_option("sqlalchemy.url") or (
    os.environ.get("LIBRAINMO_DATABASE_URL") or os.environ.get("DATABASE_URL")
)
if not url:
    raise RuntimeError("Falta LIBRAINMO_DATABASE_URL (o DATABASE_URL): LibraInmo migra sobre PostgreSQL.")
url = normalizar_url(url)
config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))

target_metadata = Base.metadata


def incluir(objeto, nombre, tipo, reflejado, comparado) -> bool:
    """La base es compartida con las tablas de `libraauth` y con todo el schema de
    `libracore` (clientes, facturas, libro de terceros…): el autogenerate no tiene
    que proponer borrarlas."""
    if tipo == "table" and reflejado and nombre not in target_metadata.tables:
        return False
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        version_table=TABLA_DE_VERSION,
        include_object=incluir,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            version_table=TABLA_DE_VERSION,
            include_object=incluir,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
