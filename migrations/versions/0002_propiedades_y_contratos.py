"""Propiedades, titulares y contratos de locación (fase 1, tanda 1).

- `propiedades` y `propiedad_titulares`: qué se administra y de quién es, con su porcentaje (un condominio liquida a
  cada titular su parte).
- `contratos`: inquilino, fechas, vencimiento y gracia, ajuste (fijo, porcentaje o índice del motor), punitorio,
  comisión de administración y depósito.
- `contrato_precios` (el alquiler con vigencia, la forma de LibraDesk), `contrato_garantias` y `contrato_conceptos`
  (expensas, ABL, seguro y servicios, con quién los paga).

Las claves foráneas a `clients` apuntan a la tabla del motor, que la cadena de `libracore` crea antes que ésta
(`python -m app.migrar`, ADR-002). Aditiva: tablas nuevas y vacías.

Revision ID: 0002
Revises: 0001
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('propiedades',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('codigo', sa.String(length=20), nullable=False),
    sa.Column('tipo', sa.String(length=20), nullable=False),
    sa.Column('direccion', sa.String(length=255), nullable=False),
    sa.Column('unidad', sa.String(length=50), nullable=True),
    sa.Column('localidad', sa.String(length=120), nullable=False),
    sa.Column('partida_abl', sa.String(length=50), nullable=True),
    sa.Column('partida_arba', sa.String(length=50), nullable=True),
    sa.Column('estado', sa.String(length=20), nullable=False),
    sa.Column('observaciones', sa.Text(), nullable=True),
    sa.Column('creado_en', sa.DateTime(timezone=True), nullable=False),
    sa.Column('actualizado_en', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("estado IN ('disponible', 'alquilada', 'en_venta', 'reservada', 'vendida', 'baja')", name=op.f('ck_propiedades_estado')),
    sa.CheckConstraint("tipo IN ('departamento', 'casa', 'ph', 'local', 'oficina', 'cochera', 'terreno', 'galpon', 'otro')", name=op.f('ck_propiedades_tipo')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_propiedades')),
    sa.UniqueConstraint('codigo', name=op.f('uq_propiedades_codigo'))
    )
    op.create_table('contratos',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('numero', sa.String(length=20), nullable=False),
    sa.Column('propiedad_id', sa.Integer(), nullable=False),
    sa.Column('inquilino_id', sa.BigInteger(), nullable=False),
    sa.Column('fecha_inicio', sa.Date(), nullable=False),
    sa.Column('fecha_fin', sa.Date(), nullable=False),
    sa.Column('moneda', sa.String(length=3), nullable=False),
    sa.Column('dia_vencimiento', sa.Integer(), nullable=False),
    sa.Column('dias_gracia', sa.Integer(), nullable=False),
    sa.Column('metodo_ajuste', sa.String(length=20), nullable=False),
    sa.Column('indice_ajuste', sa.String(length=30), nullable=True),
    sa.Column('porcentaje_ajuste', sa.Numeric(precision=7, scale=3), nullable=True),
    sa.Column('periodicidad_ajuste', sa.String(length=20), nullable=True),
    sa.Column('punitorio_tasa', sa.Numeric(precision=7, scale=4), nullable=True),
    sa.Column('punitorio_base', sa.String(length=10), nullable=False),
    sa.Column('punitorio_para', sa.String(length=20), nullable=False),
    sa.Column('comision_pct', sa.Numeric(precision=5, scale=2), nullable=False),
    sa.Column('deposito', sa.Numeric(precision=14, scale=2), nullable=True),
    sa.Column('estado', sa.String(length=20), nullable=False),
    sa.Column('fecha_rescision', sa.Date(), nullable=True),
    sa.Column('observaciones', sa.Text(), nullable=True),
    sa.Column('creado_en', sa.DateTime(timezone=True), nullable=False),
    sa.Column('actualizado_en', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("estado IN ('borrador', 'vigente', 'rescindido', 'finalizado')", name=op.f('ck_contratos_estado')),
    sa.CheckConstraint("metodo_ajuste <> 'indice' OR (indice_ajuste IS NOT NULL AND periodicidad_ajuste IS NOT NULL)", name=op.f('ck_contratos_ajuste_por_indice')),
    sa.CheckConstraint("metodo_ajuste <> 'porcentaje' OR (porcentaje_ajuste IS NOT NULL AND periodicidad_ajuste IS NOT NULL)", name=op.f('ck_contratos_ajuste_por_porcentaje')),
    sa.CheckConstraint("metodo_ajuste IN ('fijo', 'porcentaje', 'indice')", name=op.f('ck_contratos_metodo_ajuste')),
    sa.CheckConstraint("moneda IN ('ARS', 'USD')", name=op.f('ck_contratos_moneda')),
    sa.CheckConstraint("punitorio_base IN ('diaria', 'mensual')", name=op.f('ck_contratos_punitorio_base')),
    sa.CheckConstraint("punitorio_para IN ('inmobiliaria', 'propietario')", name=op.f('ck_contratos_punitorio_para')),
    sa.CheckConstraint('comision_pct >= 0 AND comision_pct <= 100', name=op.f('ck_contratos_comision')),
    sa.CheckConstraint('dia_vencimiento BETWEEN 1 AND 31', name=op.f('ck_contratos_dia_vencimiento')),
    sa.CheckConstraint('dias_gracia >= 0', name=op.f('ck_contratos_dias_gracia')),
    sa.CheckConstraint('fecha_fin >= fecha_inicio', name=op.f('ck_contratos_fechas')),
    sa.ForeignKeyConstraint(['inquilino_id'], ['clients.id'], name=op.f('fk_contratos_inquilino_id_clients'), ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['propiedad_id'], ['propiedades.id'], name=op.f('fk_contratos_propiedad_id_propiedades'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_contratos')),
    sa.UniqueConstraint('numero', name=op.f('uq_contratos_numero'))
    )
    op.create_index(op.f('ix_contratos_estado'), 'contratos', ['estado'], unique=False)
    op.create_index(op.f('ix_contratos_inquilino_id'), 'contratos', ['inquilino_id'], unique=False)
    op.create_index(op.f('ix_contratos_propiedad_id'), 'contratos', ['propiedad_id'], unique=False)
    op.create_table('propiedad_titulares',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('propiedad_id', sa.Integer(), nullable=False),
    sa.Column('cliente_id', sa.BigInteger(), nullable=False),
    sa.Column('porcentaje', sa.Numeric(precision=5, scale=2), nullable=False),
    sa.CheckConstraint('porcentaje > 0 AND porcentaje <= 100', name=op.f('ck_propiedad_titulares_porcentaje')),
    sa.ForeignKeyConstraint(['cliente_id'], ['clients.id'], name=op.f('fk_propiedad_titulares_cliente_id_clients'), ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['propiedad_id'], ['propiedades.id'], name=op.f('fk_propiedad_titulares_propiedad_id_propiedades'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_propiedad_titulares')),
    sa.UniqueConstraint('propiedad_id', 'cliente_id', name=op.f('uq_propiedad_titulares_propiedad_id_cliente_id'))
    )
    op.create_index(op.f('ix_propiedad_titulares_cliente_id'), 'propiedad_titulares', ['cliente_id'], unique=False)
    op.create_index(op.f('ix_propiedad_titulares_propiedad_id'), 'propiedad_titulares', ['propiedad_id'], unique=False)
    op.create_table('contrato_conceptos',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('contrato_id', sa.Integer(), nullable=False),
    sa.Column('concepto', sa.String(length=20), nullable=False),
    sa.Column('descripcion', sa.String(length=120), nullable=False),
    sa.Column('paga', sa.String(length=20), nullable=False),
    sa.Column('importe', sa.Numeric(precision=14, scale=2), nullable=True),
    sa.Column('activo', sa.Boolean(), nullable=False),
    sa.CheckConstraint("concepto IN ('expensas', 'abl', 'seguro', 'servicio', 'otro')", name=op.f('ck_contrato_conceptos_concepto')),
    sa.CheckConstraint("paga IN ('inquilino', 'propietario')", name=op.f('ck_contrato_conceptos_paga')),
    sa.CheckConstraint('importe IS NULL OR importe > 0', name=op.f('ck_contrato_conceptos_importe')),
    sa.ForeignKeyConstraint(['contrato_id'], ['contratos.id'], name=op.f('fk_contrato_conceptos_contrato_id_contratos'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_contrato_conceptos'))
    )
    op.create_index(op.f('ix_contrato_conceptos_contrato_id'), 'contrato_conceptos', ['contrato_id'], unique=False)
    op.create_table('contrato_garantias',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('contrato_id', sa.Integer(), nullable=False),
    sa.Column('tipo', sa.String(length=20), nullable=False),
    sa.Column('garante_id', sa.BigInteger(), nullable=True),
    sa.Column('descripcion', sa.Text(), nullable=True),
    sa.Column('vence', sa.Date(), nullable=True),
    sa.CheckConstraint("tipo IN ('propietaria', 'caucion', 'recibo_sueldo', 'otra')", name=op.f('ck_contrato_garantias_tipo')),
    sa.ForeignKeyConstraint(['contrato_id'], ['contratos.id'], name=op.f('fk_contrato_garantias_contrato_id_contratos'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['garante_id'], ['clients.id'], name=op.f('fk_contrato_garantias_garante_id_clients'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_contrato_garantias'))
    )
    op.create_index(op.f('ix_contrato_garantias_contrato_id'), 'contrato_garantias', ['contrato_id'], unique=False)
    op.create_index(op.f('ix_contrato_garantias_garante_id'), 'contrato_garantias', ['garante_id'], unique=False)
    op.create_table('contrato_precios',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('contrato_id', sa.Integer(), nullable=False),
    sa.Column('vigencia_desde', sa.Date(), nullable=False),
    sa.Column('vigencia_hasta', sa.Date(), nullable=True),
    sa.Column('importe', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('motivo', sa.String(length=50), nullable=False),
    sa.Column('usuario', sa.String(length=150), nullable=False),
    sa.Column('creado_en', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint('importe > 0', name=op.f('ck_contrato_precios_importe')),
    sa.CheckConstraint('vigencia_hasta IS NULL OR vigencia_hasta >= vigencia_desde', name=op.f('ck_contrato_precios_vigencia')),
    sa.ForeignKeyConstraint(['contrato_id'], ['contratos.id'], name=op.f('fk_contrato_precios_contrato_id_contratos'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_contrato_precios')),
    sa.UniqueConstraint('contrato_id', 'vigencia_desde', name=op.f('uq_contrato_precios_contrato_id_vigencia_desde'))
    )
    op.create_index(op.f('ix_contrato_precios_contrato_id'), 'contrato_precios', ['contrato_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_contrato_precios_contrato_id'), table_name='contrato_precios')
    op.drop_table('contrato_precios')
    op.drop_index(op.f('ix_contrato_garantias_garante_id'), table_name='contrato_garantias')
    op.drop_index(op.f('ix_contrato_garantias_contrato_id'), table_name='contrato_garantias')
    op.drop_table('contrato_garantias')
    op.drop_index(op.f('ix_contrato_conceptos_contrato_id'), table_name='contrato_conceptos')
    op.drop_table('contrato_conceptos')
    op.drop_index(op.f('ix_propiedad_titulares_propiedad_id'), table_name='propiedad_titulares')
    op.drop_index(op.f('ix_propiedad_titulares_cliente_id'), table_name='propiedad_titulares')
    op.drop_table('propiedad_titulares')
    op.drop_index(op.f('ix_contratos_propiedad_id'), table_name='contratos')
    op.drop_index(op.f('ix_contratos_inquilino_id'), table_name='contratos')
    op.drop_index(op.f('ix_contratos_estado'), table_name='contratos')
    op.drop_table('contratos')
    op.drop_table('propiedades')
