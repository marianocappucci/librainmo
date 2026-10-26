"""Errores de dominio: los levantan los servicios y la máquina de estados, y los
traduce a HTTP un único handler en `app/main.py`.

Viven acá y no en los routers para que el dominio puro (`app/dominio/`) pueda
levantarlos sin importar nada de FastAPI.
"""

from __future__ import annotations


class ErrorDeDominio(Exception):
    """Base de los errores que se contestan con un código HTTP propio."""

    status = 400

    def __init__(self, mensaje: str) -> None:
        super().__init__(mensaje)
        self.mensaje = mensaje


class NoEncontrado(ErrorDeDominio):
    status = 404


class Conflicto(ErrorDeDominio):
    """El pedido es válido pero choca con el estado actual de los datos."""

    status = 409


class Invalido(ErrorDeDominio):
    """El pedido no cumple una regla del dominio (dato faltante, inconsistente)."""

    status = 422


class Prohibido(ErrorDeDominio):
    """El rol puede usar el endpoint, pero no sobre **este** dato (p. ej. la cuenta de otro
    operador). El rol lo corta `require_rol`; esto lo corta el servicio."""

    status = 403
