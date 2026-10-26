"""Las tablas del motor que este producto referencia, en una `MetaData` **aparte**.

Las crea y las migra `libracore-migrar` (ADR-002): ni la cadena de Alembic de acá ni `test_migraciones` las tocan. Se
declaran sólo las columnas que LibraInmo usa, para que las claves foráneas del dominio apunten a ellas. Mismo
criterio que `app/models/operacion.py` de LibraCargo.
"""

from __future__ import annotations

from sqlalchemy import BigInteger, Column, MetaData, Numeric, Table, Text

MOTOR = MetaData()

#: Los clientes del motor: inquilinos, propietarios y garantes. El alta se hace con el router del motor
#: (`libracore.clientes_router`), que es el que usa `SelectCliente` de libra-ui.
clients = Table(
    "clients", MOTOR,
    Column("id", BigInteger, primary_key=True),
    Column("name", Text, nullable=False),
    Column("cuit_dni", Text),
    Column("address", Text),
    Column("email", Text),
    Column("phone", Text),
)

#: El libro de cuenta corriente de terceros (ADR-026 del motor): la cuenta del inquilino y la del propietario. Se
#: **escribe** sólo por `libracore.db.libro_de_terceros` (`app/servicios/cuentas.py`); acá se declara para la FK de las
#: cuotas y los cobros, y para leer extractos.
cc_asientos = Table(
    "cc_asientos", MOTOR,
    Column("id", BigInteger, primary_key=True),
    Column("fecha", Text, nullable=False),
    Column("tercero_id", BigInteger, nullable=False),
    Column("rol", Text, nullable=False),
    Column("concepto", Text, nullable=False),
    Column("descripcion", Text),
    Column("debe", Numeric, nullable=False),
    Column("haber", Numeric, nullable=False),
)
