"""La moneda de los gastos y de las liquidaciones, y el gasto que genera un concepto que paga el propietario.

- `gastos.moneda` y `liquidaciones.moneda` (`ARS` por defecto, `CHECK` en `ARS`/`USD`): un contrato en dólares se
  liquida en dólares, y un gasto en dólares se descuenta de esa liquidación (ADR-088 del motor).
- `gastos.cuota_id` y `gastos.concepto_id`: el gasto que generó la cuota del mes por un concepto del contrato que paga
  el propietario. Anular la cuota lo anula.

Aditiva: columnas nuevas con default o nulas; todo lo que había es en pesos y cargado a mano.

Revision ID: 0006
Revises: 0005
"""
import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for tabla in ("gastos", "liquidaciones"):
        op.add_column(tabla, sa.Column("moneda", sa.String(length=3), nullable=False, server_default="ARS"))
        op.create_check_constraint(op.f(f"ck_{tabla}_moneda"), tabla, "moneda IN ('ARS', 'USD')")
    op.add_column("gastos", sa.Column("cuota_id", sa.Integer(), nullable=True))
    op.add_column("gastos", sa.Column("concepto_id", sa.Integer(), nullable=True))
    op.create_foreign_key(op.f("fk_gastos_cuota_id_cuotas"), "gastos", "cuotas", ["cuota_id"], ["id"],
                          ondelete="RESTRICT")
    op.create_foreign_key(op.f("fk_gastos_concepto_id_contrato_conceptos"), "gastos", "contrato_conceptos",
                          ["concepto_id"], ["id"], ondelete="RESTRICT")
    op.create_index(op.f("ix_gastos_cuota_id"), "gastos", ["cuota_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_gastos_cuota_id"), table_name="gastos")
    op.drop_constraint(op.f("fk_gastos_concepto_id_contrato_conceptos"), "gastos", type_="foreignkey")
    op.drop_constraint(op.f("fk_gastos_cuota_id_cuotas"), "gastos", type_="foreignkey")
    op.drop_column("gastos", "concepto_id")
    op.drop_column("gastos", "cuota_id")
    for tabla in ("liquidaciones", "gastos"):
        op.drop_constraint(op.f(f"ck_{tabla}_moneda"), tabla, type_="check")
        op.drop_column(tabla, "moneda")
