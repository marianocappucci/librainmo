"""Configuración por entorno. Ningún secreto vive en el código.

Todas las variables propias llevan el prefijo `LIBRAINMO_`. Para las genéricas
de la familia (`ENTORNO`, `DEBUG`, `DATA_DIR`, `DATABASE_URL`) se acepta también
el nombre sin prefijo, que es el que traen los composes y los CI.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from libraauth.migrar import normalizar_url
from libracore.db.url_de_instancia import url_de_instancia

PREFIJO = "librainmo"


def _variable(nombre: str, default: str = "") -> str:
    """`LIBRAINMO_<NOMBRE>`, y si no está, `<NOMBRE>` a secas."""
    for clave in (f"LIBRAINMO_{nombre}", nombre):
        valor = (os.environ.get(clave) or "").strip()
        if valor:
            return valor
    return default


@dataclass(frozen=True)
class Config:
    database_url: str
    entorno: str = "dev"
    debug: bool = False
    #: Dónde escribe la app lo que tiene que sobrevivir a un redeploy: hoy, los
    #: ZIP de backup y el logo de la empresa. **Tiene que ser un volumen**.
    directorio_de_datos: str = "./data"

    @classmethod
    def desde_entorno(cls) -> Config:
        # `LIBRAINMO_DATABASE_URL` es el nombre vigente de la familia
        # (`libracore.db.url_de_instancia`); `DATABASE_URL` es el genérico que
        # usan los tests y el CI.
        url = url_de_instancia(PREFIJO) or (os.environ.get("DATABASE_URL") or "").strip()
        if not url:
            raise RuntimeError(
                "Falta la URL de la base: definí LIBRAINMO_DATABASE_URL (el nombre "
                "vigente) o DATABASE_URL. LibraInmo corre sobre PostgreSQL; no hay "
                "default a SQLite a propósito."
            )
        if not url.startswith(("postgresql://", "postgresql+psycopg://")):
            raise RuntimeError(f"LIBRAINMO_DATABASE_URL debe apuntar a PostgreSQL, no a {url.split(':', 1)[0]!r}.")
        return cls(
            # `postgresql://` pelado lo resuelve SQLAlchemy a psycopg2, que la
            # familia no instala: se lleva a `postgresql+psycopg://`.
            database_url=normalizar_url(url),
            entorno=_variable("ENTORNO", "dev"),
            debug=_variable("DEBUG").lower() in {"1", "true", "si"},
            directorio_de_datos=_variable("DATA_DIR", "./data"),
        )
