"""Sesión y engine. Un único lugar donde se construye la conexión."""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import Config

_config = None
_engine = None
_Sesion = None

#: Tabla de versión de la cadena de Alembic del dominio. Propia (y no el
#: `alembic_version` por defecto) porque la base es compartida con las cadenas
#: de `libraauth` (`alembic_version_libraauth`) y de `libracore`, que usa el
#: `alembic_version` por defecto: dos cadenas sobre la misma tabla de versión se
#: pisan la revisión.
TABLA_DE_VERSION = "alembic_version_librainmo"

#: Se manda en la conexión: las columnas `timestamptz` se devuelven en la hora
#: de Argentina (`-03:00`) sin importar el huso del servidor de PostgreSQL. Así
#: la API habla siempre el mismo offset, en el sidecar y en cualquier base.
HUSO = "America/Argentina/Buenos_Aires"


def inicializar(config: Config | None = None) -> None:
    global _config, _engine, _Sesion
    _config = config or Config.desde_entorno()
    _engine = create_engine(
        _config.database_url,
        pool_pre_ping=True,
        connect_args={"options": f"-c timezone={HUSO}"},
    )
    _Sesion = sessionmaker(bind=_engine, expire_on_commit=False)


def engine():
    if _engine is None:
        inicializar()
    return _engine


def fabrica_de_sesiones():
    """El `sessionmaker`, que es a la vez el `session_factory` que espera
    `libraauth.UserRepository`: un callable que devuelve una `Session` usable
    como context manager."""
    if _Sesion is None:
        inicializar()
    return _Sesion


def obtener_sesion() -> Iterator[Session]:
    """La sesión del request. La transacción la maneja el servicio que la usa:
    cada operación hace `commit()` al terminar, o `rollback()` si falla."""
    if _Sesion is None:
        inicializar()
    sesion = _Sesion()
    try:
        yield sesion
    finally:
        sesion.close()


class EsquemaDesactualizado(RuntimeError):
    """La base del dominio no está en la cabeza de la cadena de Alembic."""


def cabeza_del_dominio() -> str:
    from alembic.script import ScriptDirectory

    from app.migrar import configuracion_del_dominio

    return ScriptDirectory.from_config(configuracion_del_dominio("")).get_current_head()


def cabeza_de_libracore(url: str) -> str:
    """La revisión más nueva de la cadena de `libracore` que trae el paquete instalado."""
    from alembic.script import ScriptDirectory
    from libracore.migrar import configuracion

    return ScriptDirectory.from_config(configuracion(url)).get_current_head()


def exigir_libracore_al_dia(motor, url: str) -> str:
    """Falla si el schema del motor no está en la cabeza de su cadena. **No crea nada.**

    🔴 Es la guarda que le falta al arranque de los productos con el core en la
    misma base: `libracore.db.core` es SQL crudo y no sabe de versiones, así que
    una instancia a la que nadie le corrió `libracore-migrar upgrade` levanta
    igual y falla recién en la primera consulta que toca una tabla que falta (o,
    peor, que tiene una columna menos). Acá no levanta, y el mensaje dice qué correr.
    """
    esperada = cabeza_de_libracore(url)
    actual = None
    # La cadena de `libracore` usa el `alembic_version` por defecto (la nuestra y la de `libraauth` tienen sufijo).
    if inspect(motor).has_table("alembic_version"):
        with motor.connect() as conexion:
            fila = conexion.execute(text("SELECT version_num FROM alembic_version")).first()
        actual = fila[0] if fila else None
    if actual != esperada:
        raise EsquemaDesactualizado(
            f"El schema de libracore está en {actual!r} y este LibraInmo espera {esperada!r}. "
            "Corré `python -m app.migrar` (o `libracore-migrar upgrade`) antes de arrancar."
        )
    return actual


def exigir_dominio_al_dia(motor) -> str:
    """Falla si la base del dominio no está en la cabeza. **No crea nada.**

    Mismo criterio que `libraauth.migrar.exigir_schema_al_dia`: un arranque que
    «tapa» con `create_all` una migración olvidada deja la base sin versión, y
    el próximo cambio de schema no tiene de dónde partir. Acá la app no
    arranca, y el mensaje dice qué correr.
    """
    esperada = cabeza_del_dominio()
    actual = None
    if inspect(motor).has_table(TABLA_DE_VERSION):
        with motor.connect() as conexion:
            fila = conexion.execute(text(f"SELECT version_num FROM {TABLA_DE_VERSION}")).first()
        actual = fila[0] if fila else None
    if actual != esperada:
        raise EsquemaDesactualizado(
            f"La base del dominio está en {actual!r} y este LibraInmo espera {esperada!r}. "
            "Corré `python -m app.migrar` (o `alembic upgrade head`) antes de arrancar."
        )
    return actual
