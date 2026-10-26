"""Qué NO puede terminar escrito en el log de actividad.

El mecanismo vive en `libraauth.auditoria`, y ya oculta por su cuenta lo que es
secreto en cualquier producto (contraseñas, tokens). Acá queda lo único que el
producto sabe: cuáles de sus datos son sensibles.

> 🔵 **Sin dominio todavía, la lista va vacía a propósito.** Cuando lleguen las
> tablas de propiedades, titulares y contratos, cada columna que no deba copiarse
> al `actividad_log` (que lo lee cualquier admin) se declara acá: un CBU o un
> alias de cobro, el CUIT de un propietario si se decide que no, las notas internas
> sobre un inquilino. Mismo criterio que MedLibra (`app/auditoria.py`), con las dos
> defensas: `COLUMNAS_OCULTAS` sale del **diff**, y `etiqueta_segura()` sale de la
> **descripción** (la etiqueta se arma leyendo atributos directamente, así que ocultar
> la columna del diff no alcanza).
"""

from __future__ import annotations

from libraauth.auditoria import etiqueta_por_defecto

#: Columnas que, si cambian, el log registra el hecho pero no el valor (`(oculto)`).
COLUMNAS_OCULTAS: frozenset[str] = frozenset()

#: De estas entidades no se escribe etiqueta: «contrato #12» alcanza para saber quién lo tocó.
ENTIDADES_SIN_ETIQUETA: frozenset[str] = frozenset()


def etiqueta_segura(obj) -> str:
    if type(obj).__name__ in ENTIDADES_SIN_ETIQUETA:
        return ""
    return etiqueta_por_defecto(obj)
