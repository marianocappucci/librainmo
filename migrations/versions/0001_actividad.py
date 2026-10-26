"""Baseline: el log de actividad.

`actividad_log` es la tabla del log de actividad de `libraauth` (`AuditoriaBase`): el
motor NO la versiona en su cadena porque vive en la base del dominio, así que la crea
el producto.

🔑 **No crea `modulos`.** En LibraView esa tabla es del dominio; acá la trae la cadena
de `libracore` (misma base, ADR-002 de este repo), que `python -m app.migrar` corre
antes que ésta. Crearla de nuevo fallaría con «la relación ya existe».

Revision ID: 0001
Revises:
"""

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    from libraauth.auditoria import crear_tabla_actividad_log

    crear_tabla_actividad_log(op.get_bind())


def downgrade() -> None:
    op.drop_table("actividad_log")
