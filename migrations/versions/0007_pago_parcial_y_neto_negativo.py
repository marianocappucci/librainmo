"""El pago a cuenta de una cuota y la liquidación con neto negativo (decisiones del humano, 2026-10-28).

- `cobros.punitorio_pendiente`: el punitorio devengado que un pago a cuenta no cubrió y arrastra el próximo cobro.
  `importe_cuota` puede ser cero (un pago que sólo alcanzó al punitorio) y el total tiene que ser positivo (ADR-010).
- `liquidaciones.saldo_anterior` y los estados `deudora` y `saldada`: una liquidación con neto negativo se emite y su
  deuda la absorbe la próxima del propietario como un ítem `saldo` (`liquidacion_items.liquidacion_origen_id`, único),
  que no tiene asiento (ADR-011).

Aditiva para los datos: columnas nuevas con default o nulas y restricciones que lo que había ya cumple.

Revision ID: 0007
Revises: 0006
"""
import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

_NETO = "neto >= 0 OR estado IN ('deudora', 'saldada', 'anulada')"
_SALDO = ("(tipo = 'saldo') = (asiento_id IS NULL) AND (tipo = 'saldo') = (liquidacion_origen_id IS NOT NULL)")


def upgrade() -> None:
    op.add_column("cobros", sa.Column("punitorio_pendiente", sa.Numeric(precision=14, scale=2), nullable=False,
                                      server_default="0"))
    op.drop_constraint(op.f("ck_cobros_importe_cuota"), "cobros", type_="check")
    op.create_check_constraint(op.f("ck_cobros_importe_cuota"), "cobros", "importe_cuota >= 0")
    op.create_check_constraint(op.f("ck_cobros_punitorio_pendiente"), "cobros", "punitorio_pendiente >= 0")
    op.create_check_constraint(op.f("ck_cobros_total"), "cobros", "total > 0")

    op.add_column("liquidaciones", sa.Column("saldo_anterior", sa.Numeric(precision=14, scale=2), nullable=False,
                                             server_default="0"))
    op.create_check_constraint(op.f("ck_liquidaciones_saldo_anterior"), "liquidaciones", "saldo_anterior <= 0")
    op.drop_constraint(op.f("ck_liquidaciones_estado"), "liquidaciones", type_="check")
    op.create_check_constraint(op.f("ck_liquidaciones_estado"), "liquidaciones",
                               "estado IN ('emitida', 'pagada', 'deudora', 'saldada', 'anulada')")
    op.drop_constraint(op.f("ck_liquidaciones_neto"), "liquidaciones", type_="check")
    op.create_check_constraint(op.f("ck_liquidaciones_neto"), "liquidaciones", _NETO)

    op.alter_column("liquidacion_items", "asiento_id", existing_type=sa.BigInteger(), nullable=True)
    op.add_column("liquidacion_items", sa.Column("liquidacion_origen_id", sa.Integer(), nullable=True))
    op.create_foreign_key(op.f("fk_liquidacion_items_liquidacion_origen_id_liquidaciones"), "liquidacion_items",
                          "liquidaciones", ["liquidacion_origen_id"], ["id"], ondelete="RESTRICT")
    op.create_unique_constraint(op.f("uq_liquidacion_items_liquidacion_origen_id"), "liquidacion_items",
                                ["liquidacion_origen_id"])
    op.drop_constraint(op.f("ck_liquidacion_items_tipo"), "liquidacion_items", type_="check")
    op.create_check_constraint(op.f("ck_liquidacion_items_tipo"), "liquidacion_items",
                               "tipo IN ('cobro', 'gasto', 'saldo')")
    op.create_check_constraint(op.f("ck_liquidacion_items_saldo"), "liquidacion_items", _SALDO)


def downgrade() -> None:
    op.drop_constraint(op.f("ck_liquidacion_items_saldo"), "liquidacion_items", type_="check")
    op.drop_constraint(op.f("ck_liquidacion_items_tipo"), "liquidacion_items", type_="check")
    op.create_check_constraint(op.f("ck_liquidacion_items_tipo"), "liquidacion_items", "tipo IN ('cobro', 'gasto')")
    op.drop_constraint(op.f("uq_liquidacion_items_liquidacion_origen_id"), "liquidacion_items", type_="unique")
    op.drop_constraint(op.f("fk_liquidacion_items_liquidacion_origen_id_liquidaciones"), "liquidacion_items",
                       type_="foreignkey")
    op.drop_column("liquidacion_items", "liquidacion_origen_id")
    op.alter_column("liquidacion_items", "asiento_id", existing_type=sa.BigInteger(), nullable=False)

    op.drop_constraint(op.f("ck_liquidaciones_neto"), "liquidaciones", type_="check")
    op.create_check_constraint(op.f("ck_liquidaciones_neto"), "liquidaciones", "neto >= 0")
    op.drop_constraint(op.f("ck_liquidaciones_estado"), "liquidaciones", type_="check")
    op.create_check_constraint(op.f("ck_liquidaciones_estado"), "liquidaciones",
                               "estado IN ('emitida', 'pagada', 'anulada')")
    op.drop_constraint(op.f("ck_liquidaciones_saldo_anterior"), "liquidaciones", type_="check")
    op.drop_column("liquidaciones", "saldo_anterior")

    op.drop_constraint(op.f("ck_cobros_total"), "cobros", type_="check")
    op.drop_constraint(op.f("ck_cobros_punitorio_pendiente"), "cobros", type_="check")
    op.drop_constraint(op.f("ck_cobros_importe_cuota"), "cobros", type_="check")
    op.create_check_constraint(op.f("ck_cobros_importe_cuota"), "cobros", "importe_cuota > 0")
    op.drop_column("cobros", "punitorio_pendiente")
