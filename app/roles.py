"""Los roles de LibraInmo y quién puede hacer qué.

`libraauth` guarda el rol como texto libre y valida contra la tupla que le pasa
el producto (`UserRepository(roles=ROLES)`), así que el vocabulario vive acá.

Los grupos de abajo son la **matriz de permisos**: cada endpoint pide uno, y no
hay un `require_rol("admin", "operador")` suelto en un router. Cambiar quién
puede hacer algo es tocar una línea de este archivo.

Son los dos roles del **personal de la inmobiliaria**. El inquilino y el
propietario no son usuarios del sistema: son filas de `clients` del motor
(ADR-003); el acceso de ellos a su cuenta es de la fase 2 del `ROADMAP.md`.
"""

from __future__ import annotations

ADMIN = "admin"
OPERADOR = "operador"

ROLES = (ADMIN, OPERADOR)

#: Cualquier usuario con sesión: leer los datos de la empresa y operar el día a día.
TODOS = ROLES

#: Quién opera la administración de alquileres (propiedades, contratos, cobros).
#: Hoy no hay rutas de dominio; las que se sumen piden este grupo y no una tupla suelta.
OPERAN_ALQUILERES = (ADMIN, OPERADOR)

#: Lo que sólo hace el dueño o el encargado: usuarios, actividad, datos de la
#: empresa y backup.
ADMINISTRAN = (ADMIN,)
