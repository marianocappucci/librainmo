"""Cobros de cuotas y su reparto entre titulares (fase 1, tanda 2b).

`cobros`: lo que pagó el inquilino por una cuota (la cuota entera más el punitorio), con los medios, el haber en su
cuenta (`asiento_id`), el debe del punitorio y el recibo del motor (`recibo_id`, FK a `recibos`, ADR-087 del motor).
`cobro_imputaciones`: la parte de cada propietario, por tipo (alquiler, concepto, punitorio), con su asiento.

Aditiva: tablas nuevas y vacías.

Revision ID: 0004
Revises: 0003
"""
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('cobros',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('cuota_id', sa.Integer(), nullable=False),
    sa.Column('fecha', sa.Date(), nullable=False),
    sa.Column('importe_cuota', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('punitorio', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('punitorio_condonado', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('dias_de_atraso', sa.Integer(), nullable=False),
    sa.Column('total', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('medios', sa.Text(), nullable=False),
    sa.Column('asiento_id', sa.BigInteger(), nullable=False),
    sa.Column('asiento_punitorio_id', sa.BigInteger(), nullable=True),
    sa.Column('recibo_id', sa.BigInteger(), nullable=False),
    sa.Column('anulado', sa.Boolean(), nullable=False),
    sa.Column('motivo_anulacion', sa.Text(), nullable=True),
    sa.Column('usuario', sa.String(length=150), nullable=False),
    sa.Column('creado_en', sa.DateTime(timezone=True), nullable=False),
    sa.Column('actualizado_en', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint('importe_cuota > 0', name=op.f('ck_cobros_importe_cuota')),
    sa.CheckConstraint('punitorio >= 0', name=op.f('ck_cobros_punitorio')),
    sa.ForeignKeyConstraint(['asiento_id'], ['cc_asientos.id'], name=op.f('fk_cobros_asiento_id_cc_asientos'), ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['asiento_punitorio_id'], ['cc_asientos.id'], name=op.f('fk_cobros_asiento_punitorio_id_cc_asientos'), ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['cuota_id'], ['cuotas.id'], name=op.f('fk_cobros_cuota_id_cuotas'), ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['recibo_id'], ['recibos.id'], name=op.f('fk_cobros_recibo_id_recibos'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_cobros'))
    )
    op.create_index(op.f('ix_cobros_cuota_id'), 'cobros', ['cuota_id'], unique=False)
    op.create_table('cobro_imputaciones',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('cobro_id', sa.Integer(), nullable=False),
    sa.Column('propietario_id', sa.BigInteger(), nullable=False),
    sa.Column('tipo', sa.String(length=20), nullable=False),
    sa.Column('importe', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('asiento_id', sa.BigInteger(), nullable=False),
    sa.CheckConstraint("tipo IN ('alquiler', 'concepto', 'punitorio')", name=op.f('ck_cobro_imputaciones_tipo')),
    sa.CheckConstraint('importe > 0', name=op.f('ck_cobro_imputaciones_importe')),
    sa.ForeignKeyConstraint(['asiento_id'], ['cc_asientos.id'], name=op.f('fk_cobro_imputaciones_asiento_id_cc_asientos'), ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['cobro_id'], ['cobros.id'], name=op.f('fk_cobro_imputaciones_cobro_id_cobros'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['propietario_id'], ['clients.id'], name=op.f('fk_cobro_imputaciones_propietario_id_clients'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_cobro_imputaciones'))
    )
    op.create_index(op.f('ix_cobro_imputaciones_cobro_id'), 'cobro_imputaciones', ['cobro_id'], unique=False)
    op.create_index(op.f('ix_cobro_imputaciones_propietario_id'), 'cobro_imputaciones', ['propietario_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_cobro_imputaciones_propietario_id'), table_name='cobro_imputaciones')
    op.drop_index(op.f('ix_cobro_imputaciones_cobro_id'), table_name='cobro_imputaciones')
    op.drop_table('cobro_imputaciones')
    op.drop_index(op.f('ix_cobros_cuota_id'), table_name='cobros')
    op.drop_table('cobros')
