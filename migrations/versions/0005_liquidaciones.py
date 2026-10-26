"""Gastos por cuenta del propietario y liquidaciones al propietario (fase 1, tanda 2c).

`gastos` y `gasto_imputaciones` (la parte de cada titular, con su cargo en el libro del motor); `liquidaciones` (lo
cobrado, los gastos, la comisión, el neto y su pago) y `liquidacion_items`, con `asiento_id` único: un movimiento se
liquida una sola vez.

Aditiva: tablas nuevas y vacías.

Revision ID: 0005
Revises: 0004
"""
import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('liquidaciones',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('numero', sa.String(length=20), nullable=False),
    sa.Column('propietario_id', sa.BigInteger(), nullable=False),
    sa.Column('fecha', sa.Date(), nullable=False),
    sa.Column('hasta', sa.Date(), nullable=False),
    sa.Column('cobrado', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('gastos', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('comision', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('neto', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('estado', sa.String(length=20), nullable=False),
    sa.Column('asiento_comision_id', sa.BigInteger(), nullable=True),
    sa.Column('asiento_pago_id', sa.BigInteger(), nullable=True),
    sa.Column('fecha_pago', sa.Date(), nullable=True),
    sa.Column('medio_pago', sa.String(length=30), nullable=True),
    sa.Column('referencia_pago', sa.String(length=120), nullable=True),
    sa.Column('observaciones', sa.Text(), nullable=True),
    sa.Column('usuario', sa.String(length=150), nullable=False),
    sa.Column('creado_en', sa.DateTime(timezone=True), nullable=False),
    sa.Column('actualizado_en', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("estado IN ('emitida', 'pagada', 'anulada')", name=op.f('ck_liquidaciones_estado')),
    sa.CheckConstraint('neto >= 0', name=op.f('ck_liquidaciones_neto')),
    sa.ForeignKeyConstraint(['asiento_comision_id'], ['cc_asientos.id'], name=op.f('fk_liquidaciones_asiento_comision_id_cc_asientos'), ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['asiento_pago_id'], ['cc_asientos.id'], name=op.f('fk_liquidaciones_asiento_pago_id_cc_asientos'), ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['propietario_id'], ['clients.id'], name=op.f('fk_liquidaciones_propietario_id_clients'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_liquidaciones')),
    sa.UniqueConstraint('numero', name=op.f('uq_liquidaciones_numero'))
    )
    op.create_index(op.f('ix_liquidaciones_estado'), 'liquidaciones', ['estado'], unique=False)
    op.create_index(op.f('ix_liquidaciones_propietario_id'), 'liquidaciones', ['propietario_id'], unique=False)
    op.create_table('gastos',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('propiedad_id', sa.Integer(), nullable=False),
    sa.Column('fecha', sa.Date(), nullable=False),
    sa.Column('categoria', sa.String(length=30), nullable=False),
    sa.Column('descripcion', sa.String(length=200), nullable=False),
    sa.Column('importe', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('comprobante', sa.String(length=80), nullable=True),
    sa.Column('anulado', sa.Boolean(), nullable=False),
    sa.Column('usuario', sa.String(length=150), nullable=False),
    sa.Column('creado_en', sa.DateTime(timezone=True), nullable=False),
    sa.Column('actualizado_en', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("categoria IN ('reparacion', 'expensas_extraordinarias', 'impuesto', 'servicio', 'honorarios', 'otro')", name=op.f('ck_gastos_categoria')),
    sa.CheckConstraint('importe > 0', name=op.f('ck_gastos_importe')),
    sa.ForeignKeyConstraint(['propiedad_id'], ['propiedades.id'], name=op.f('fk_gastos_propiedad_id_propiedades'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_gastos'))
    )
    op.create_index(op.f('ix_gastos_propiedad_id'), 'gastos', ['propiedad_id'], unique=False)
    op.create_table('liquidacion_items',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('liquidacion_id', sa.Integer(), nullable=False),
    sa.Column('asiento_id', sa.BigInteger(), nullable=False),
    sa.Column('tipo', sa.String(length=10), nullable=False),
    sa.Column('fecha', sa.Date(), nullable=False),
    sa.Column('descripcion', sa.String(length=200), nullable=False),
    sa.Column('importe', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('base_comision', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('comision_pct', sa.Numeric(precision=5, scale=2), nullable=False),
    sa.CheckConstraint("tipo IN ('cobro', 'gasto')", name=op.f('ck_liquidacion_items_tipo')),
    sa.ForeignKeyConstraint(['asiento_id'], ['cc_asientos.id'], name=op.f('fk_liquidacion_items_asiento_id_cc_asientos'), ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['liquidacion_id'], ['liquidaciones.id'], name=op.f('fk_liquidacion_items_liquidacion_id_liquidaciones'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_liquidacion_items')),
    sa.UniqueConstraint('asiento_id', name=op.f('uq_liquidacion_items_asiento_id'))
    )
    op.create_index(op.f('ix_liquidacion_items_liquidacion_id'), 'liquidacion_items', ['liquidacion_id'], unique=False)
    op.create_table('gasto_imputaciones',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('gasto_id', sa.Integer(), nullable=False),
    sa.Column('propietario_id', sa.BigInteger(), nullable=False),
    sa.Column('importe', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('asiento_id', sa.BigInteger(), nullable=False),
    sa.CheckConstraint('importe > 0', name=op.f('ck_gasto_imputaciones_importe')),
    sa.ForeignKeyConstraint(['asiento_id'], ['cc_asientos.id'], name=op.f('fk_gasto_imputaciones_asiento_id_cc_asientos'), ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['gasto_id'], ['gastos.id'], name=op.f('fk_gasto_imputaciones_gasto_id_gastos'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['propietario_id'], ['clients.id'], name=op.f('fk_gasto_imputaciones_propietario_id_clients'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_gasto_imputaciones'))
    )
    op.create_index(op.f('ix_gasto_imputaciones_gasto_id'), 'gasto_imputaciones', ['gasto_id'], unique=False)
    op.create_index(op.f('ix_gasto_imputaciones_propietario_id'), 'gasto_imputaciones', ['propietario_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_gasto_imputaciones_propietario_id'), table_name='gasto_imputaciones')
    op.drop_index(op.f('ix_gasto_imputaciones_gasto_id'), table_name='gasto_imputaciones')
    op.drop_table('gasto_imputaciones')
    op.drop_index(op.f('ix_liquidacion_items_liquidacion_id'), table_name='liquidacion_items')
    op.drop_table('liquidacion_items')
    op.drop_index(op.f('ix_gastos_propiedad_id'), table_name='gastos')
    op.drop_table('gastos')
    op.drop_index(op.f('ix_liquidaciones_propietario_id'), table_name='liquidaciones')
    op.drop_index(op.f('ix_liquidaciones_estado'), table_name='liquidaciones')
    op.drop_table('liquidaciones')
