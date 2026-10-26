"""Cuotas: el devengado mensual de un contrato y sus líneas (fase 1, tanda 2a).

`cuotas` guarda el período, la emisión, el vencimiento, el prorrateo, el precio con que salió (congelado) y el cargo
en la cuenta del inquilino (`asiento_id`, FK a `cc_asientos` del motor). El índice único parcial
`uq_cuotas_contrato_periodo_viva` es la idempotencia: una sola cuota viva por contrato y mes (las anuladas no cuentan).
`cuota_lineas`: el alquiler y los conceptos que paga el inquilino.

Aditiva: tablas nuevas y vacías.

Revision ID: 0003
Revises: 0002
"""
import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('cuotas',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('contrato_id', sa.Integer(), nullable=False),
    sa.Column('periodo_desde', sa.Date(), nullable=False),
    sa.Column('periodo_hasta', sa.Date(), nullable=False),
    sa.Column('fecha_emision', sa.Date(), nullable=False),
    sa.Column('fecha_vencimiento', sa.Date(), nullable=False),
    sa.Column('prorrateada', sa.Boolean(), nullable=False),
    sa.Column('dias_cubiertos', sa.Integer(), nullable=False),
    sa.Column('dias_del_periodo', sa.Integer(), nullable=False),
    sa.Column('precio_id', sa.Integer(), nullable=False),
    sa.Column('total', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('estado', sa.String(length=20), nullable=False),
    sa.Column('asiento_id', sa.BigInteger(), nullable=False),
    sa.Column('creado_en', sa.DateTime(timezone=True), nullable=False),
    sa.Column('actualizado_en', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("estado IN ('pendiente', 'cobrada', 'anulada')", name=op.f('ck_cuotas_estado')),
    sa.CheckConstraint('periodo_hasta >= periodo_desde', name=op.f('ck_cuotas_periodo')),
    sa.CheckConstraint('total > 0', name=op.f('ck_cuotas_total')),
    sa.ForeignKeyConstraint(['asiento_id'], ['cc_asientos.id'], name=op.f('fk_cuotas_asiento_id_cc_asientos'), ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['contrato_id'], ['contratos.id'], name=op.f('fk_cuotas_contrato_id_contratos'), ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['precio_id'], ['contrato_precios.id'], name=op.f('fk_cuotas_precio_id_contrato_precios'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_cuotas'))
    )
    op.create_index(op.f('ix_cuotas_contrato_id'), 'cuotas', ['contrato_id'], unique=False)
    op.create_index(op.f('ix_cuotas_estado'), 'cuotas', ['estado'], unique=False)
    op.create_index('uq_cuotas_contrato_periodo_viva', 'cuotas', ['contrato_id', 'periodo_desde'], unique=True, postgresql_where=sa.text("estado <> 'anulada'"))
    op.create_table('cuota_lineas',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('cuota_id', sa.Integer(), nullable=False),
    sa.Column('tipo', sa.String(length=20), nullable=False),
    sa.Column('concepto_id', sa.Integer(), nullable=True),
    sa.Column('descripcion', sa.String(length=160), nullable=False),
    sa.Column('importe', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.CheckConstraint("tipo IN ('alquiler', 'concepto')", name=op.f('ck_cuota_lineas_tipo')),
    sa.CheckConstraint('importe > 0', name=op.f('ck_cuota_lineas_importe')),
    sa.ForeignKeyConstraint(['concepto_id'], ['contrato_conceptos.id'], name=op.f('fk_cuota_lineas_concepto_id_contrato_conceptos'), ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['cuota_id'], ['cuotas.id'], name=op.f('fk_cuota_lineas_cuota_id_cuotas'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_cuota_lineas'))
    )
    op.create_index(op.f('ix_cuota_lineas_cuota_id'), 'cuota_lineas', ['cuota_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_cuota_lineas_cuota_id'), table_name='cuota_lineas')
    op.drop_table('cuota_lineas')
    op.drop_index('uq_cuotas_contrato_periodo_viva', table_name='cuotas', postgresql_where=sa.text("estado <> 'anulada'"))
    op.drop_index(op.f('ix_cuotas_estado'), table_name='cuotas')
    op.drop_index(op.f('ix_cuotas_contrato_id'), table_name='cuotas')
    op.drop_table('cuotas')
