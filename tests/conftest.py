"""Fixtures de la suite.

Corre **contra PostgreSQL real**. No hay fallback a SQLite y no lo va a haber:
las garantías del producto —el libro de terceros con su contraasiento, los `CHECK`,
los índices únicos— son de PostgreSQL, y una suite verde sobre SQLite estaría
midiendo otro producto.

Variable: `DATABASE_URL`, por ejemplo `postgresql+psycopg:///librainmo_test`. Sin
ella los tests se saltean. **La base tiene que llamarse `librainmo_*`**: la suite
la reconstruye entera (`DROP SCHEMA public CASCADE`) y no se anima a hacerlo
sobre cualquier otra.

Con `pytest -n N` (xdist) cada worker usa **su propia base** (`<base>_gw0`, …), que se crea
al arrancar y se borra al salir (`libracore.testing.pg_por_worker`): el `DROP SCHEMA` y el
`TRUNCATE` de un worker no pisan a los demás. Por eso `DATABASE_URL` tiene que apuntar a una
base que exista en el servidor (la «original»), y el nombre `librainmo_*` se mide sobre la
del worker.
"""

from __future__ import annotations

import os
import time

import pytest
from fastapi.testclient import TestClient
from libracore.testing.pg_por_worker import base_por_worker
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from app.config import Config
from app.main import crear_app
from app.migrar import migrar
from app.roles import ADMIN

# ── Una base por worker de xdist ──────────────────────────────────────────────
#
# Idempotente a propósito (`base_por_worker`): el proceso que lanza a los workers importa
# este conftest también, y un test que hace `from tests.x import ...` lo carga bajo dos
# nombres. Se pisa `DATABASE_URL` con la del worker y de ahí en adelante TODO lo que la
# lee (`url_de_tests()`, `Config.desde_entorno()`, los subprocesos) habla con SU base.
_PG = base_por_worker("librainmo", os.environ.get("DATABASE_URL", ""))
if _PG:
    os.environ["DATABASE_URL"] = _PG.url

#: Secreto de firma de sesión para la suite. Fijo y evidente: no es una clave,
#: es una constante de test.
SECRETO_DE_PRUEBA = "librainmo-suite-no-es-un-secreto-real"
CLAVE = "clave-de-prueba"


@pytest.fixture(autouse=True)
def _config_de_libracore_aislada(tmp_path, monkeypatch):
    """`config_manager` de LibraCore escribe un JSON **en el cwd**, y persiste.

    Con esto cada test arranca con la configuración de empresa en su default y
    no deja un `config.json` en la raíz del repo.
    """
    from libracore import config_manager

    monkeypatch.setattr(config_manager, "CONFIG_PATH", str(tmp_path / "config.json"))
    # Lo mismo con el logo de la empresa: sin esto un test que lo sube lo deja en `./logos`.
    monkeypatch.setattr(config_manager, "LOGO_DIR", str(tmp_path / "logos"))


@pytest.fixture(autouse=True)
def _secreto_de_sesion(monkeypatch):
    """`SessionAuth` no se construye sin `SECRET_KEY` (salvo `ENV=development`).

    Autouse para que la suite no pase o falle según lo que tenga exportado el
    shell de quien la corre.
    """
    monkeypatch.setenv("SECRET_KEY", SECRETO_DE_PRUEBA)
    monkeypatch.delenv("ENV", raising=False)


@pytest.fixture(autouse=True)
def _sin_pools_colgados():
    """Cierra el pool que dejó `crear_app()`, si el test armó una app.

    Cada `crear_app()` construye un engine nuevo y lo deja en el módulo `db`; el
    anterior queda con su pool abierto hasta que el recolector lo junte, y con
    suficientes tests eso cruza el límite de conexiones de PostgreSQL (`too many
    clients`) en un test cualquiera.
    """
    yield
    from app import db as _db

    if _db._engine is not None:
        _db._engine.dispose()


@pytest.fixture(autouse=True)
def _terminos_ya_aceptados(request):
    """Desde libraauth v0.31.0 el motor corta con 403 **cualquier** llamada
    gateada por rol mientras la instancia no haya aceptado los Términos. Sin
    esta excepción la suite entera se pone roja y el rojo no dice nada sobre el
    dominio.

    🔴 Esto NO apaga el gate donde importa: `test_terminos.py` se marca con
    `sin_aceptar_terminos` y queda afuera, y es lo único que se pondría rojo si
    alguien borrara el cableado de `app.state.terminos`.
    """
    if request.node.get_closest_marker("sin_aceptar_terminos"):
        yield
        return

    from libraauth.terminos import TerminosRepository

    # `MonkeyPatch()` propio y no el fixture: el del test puede hacer `undo()` y
    # le prendería el gate a la mitad.
    mp = pytest.MonkeyPatch()
    mp.setattr(TerminosRepository, "esta_aceptada", lambda self: True)
    yield
    mp.undo()


def url_de_tests() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.skip(
            "Falta DATABASE_URL. La suite corre contra PostgreSQL real: exportá la URL "
            "de una base `librainmo_*`, p. ej. postgresql+psycopg:///librainmo_test."
        )
    base = make_url(url).database or ""
    if not base.startswith("librainmo_"):
        pytest.exit(
            f"DATABASE_URL apunta a la base {base!r}: la suite la reconstruye entera y sólo "
            "corre sobre bases llamadas `librainmo_*`.",
            returncode=2,
        )
    return url


def base_auxiliar(sufijo: str) -> str:
    """Nombre de una base auxiliar de la suite (`<base de tests>_<sufijo>`).

    Deriva del nombre de la base de tests y no es fijo: dos workers (o dos corridas con
    bases distintas) no se pisan las auxiliares aunque compartan el servidor de PostgreSQL.
    """
    return f"{make_url(url_de_tests()).database}_{sufijo}"


def url_de_base_auxiliar(sufijo: str) -> str:
    """La URL de la base auxiliar `base_auxiliar(sufijo)`, en el mismo servidor que la de la suite."""
    return url_de_tests().rsplit("/", 1)[0] + "/" + base_auxiliar(sufijo)


def soltar_base_auxiliar(raiz, nombre: str) -> None:
    """`DROP DATABASE … WITH (FORCE)` con reintentos.

    PostgreSQL puede responder «permission denied to terminate process» si en ese
    instante hay un autovacuum conectado a la base recién creada (no se puede
    cortar a un proceso que no es del usuario). Es una carrera de milisegundos: al
    reintentar, el autovacuum ya terminó.
    """
    from sqlalchemy.exc import ProgrammingError

    for intento in range(10):
        try:
            with raiz.connect() as c:
                c.execute(text(f"DROP DATABASE IF EXISTS {nombre} WITH (FORCE)"))
            return
        except ProgrammingError:
            if intento == 9:
                raise
            time.sleep(0.5)


#: Las filas que deja sembradas la migración del motor (la caja por defecto, las categorías de
#: egreso, el depósito…): `{tabla: (columnas, filas)}`, tomadas una vez por worker, justo después
#: de migrar. `base` las devuelve entre test y test.
_SEMILLAS: dict[str, tuple[list[str], list[tuple]]] = {}


def _tablas_con_datos(conexion) -> list[str]:
    """Las tablas con alguna fila, menos las de versión de las cadenas de Alembic."""
    tablas = (
        conexion.execute(
            text(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE 'alembic_version%'"
            )
        )
        .scalars()
        .all()
    )
    return [t for t in tablas if conexion.execute(text(f'SELECT EXISTS (SELECT 1 FROM "{t}")')).scalar()]


@pytest.fixture(scope="session")
def engine():
    """El engine, con el schema ya migrado por la cadena de verdad (las tres).

    Se corren las migraciones y no `Base.metadata.create_all()`: `create_all` no
    crea las tablas de `libraauth` ni el schema de `libracore`.

    🔴 Se **reconstruye** el schema, no se migra sobre lo que haya quedado: un
    `upgrade head` sobre una base ya en head no hace nada, y una corrida
    interrumpida a mitad de un DDL dejaría una base a medias que se ve migrada.
    """
    url = url_de_tests()
    motor = create_engine(url)
    with motor.begin() as conexion:
        conexion.execute(text("SET lock_timeout = '15s'"))
        conexion.execute(text("DROP SCHEMA public CASCADE"))
        conexion.execute(text("CREATE SCHEMA public"))
    migrar(url)
    _SEMILLAS.clear()
    with motor.connect() as conexion:
        for tabla in _tablas_con_datos(conexion):
            cursor = conexion.exec_driver_sql(f'SELECT * FROM "{tabla}"')
            _SEMILLAS[tabla] = (list(cursor.keys()), [tuple(f) for f in cursor.fetchall()])
    yield motor
    motor.dispose()


@pytest.fixture
def base(engine):
    """La base vacía: se vacían **antes** de cada test las tablas que quedaron con
    datos (menos las de versión), no después, para que un test que falla deje sus
    datos a la vista. Después se devuelven las semillas del motor.

    Sólo se truncan las que tienen filas: un `TRUNCATE` reescribe y sincroniza a
    disco cada tabla, y sobre las ~50 tablas de la base (dominio, `libraauth` y
    `libracore`) eran segundos por test.
    """
    with engine.begin() as conexion:
        # `lock_timeout`: un test que dejó una sesión abierta hace fallar al
        # siguiente con un error de lock en vez de colgar la suite.
        conexion.execute(text("SET lock_timeout = '15s'"))
        con_datos = _tablas_con_datos(conexion)
        if con_datos:
            conexion.execute(text("TRUNCATE " + ", ".join(f'"{t}"' for t in con_datos) + " RESTART IDENTITY CASCADE"))
        # El `CASCADE` puede llevarse una tabla sembrada por una FK: se revisan todas.
        for tabla, (columnas, filas) in _SEMILLAS.items():
            if conexion.execute(text(f'SELECT EXISTS (SELECT 1 FROM "{tabla}")')).scalar():
                continue
            lista = ", ".join(f'"{c}"' for c in columnas)
            marcas = ", ".join(["%s"] * len(columnas))
            for fila in filas:
                conexion.exec_driver_sql(
                    f'INSERT INTO "{tabla}" ({lista}) OVERRIDING SYSTEM VALUE VALUES ({marcas})', fila
                )
            secuencia = conexion.execute(text("SELECT pg_get_serial_sequence(:t, 'id')"), {"t": f'"{tabla}"'}).scalar()
            if secuencia and "id" in columnas:
                conexion.execute(text(f'SELECT setval(:s, (SELECT max(id) FROM "{tabla}"))'), {"s": secuencia})
    return engine


@pytest.fixture
def sesion(base) -> Session:
    fabrica = sessionmaker(bind=base, expire_on_commit=False)
    with fabrica() as sesion:
        yield sesion


@pytest.fixture
def config(tmp_path) -> Config:
    return Config(
        database_url=url_de_tests(),
        entorno="test",
        debug=False,
        directorio_de_datos=str(tmp_path / "datos"),
    )


@pytest.fixture
def app(base, config, monkeypatch):
    """La aplicación sobre la base vacía, con el admin sembrado (`admin`/`CLAVE`)."""
    monkeypatch.setenv("LIBRAINMO_ADMIN_USERNAME", ADMIN)
    monkeypatch.setenv("LIBRAINMO_ADMIN_PASSWORD", CLAVE)
    return crear_app(config)


def _cliente_logueado(app, username: str) -> TestClient:
    # `https://testserver` y no `http`: la cookie de sesión de `libraauth` es
    # `Secure`, y sobre http el cliente la acepta pero **no la reenvía**: el login
    # daría 200 y todo lo demás 401.
    cliente = TestClient(app, base_url="https://testserver")
    respuesta = cliente.post("/auth/login", json={"username": username, "password": CLAVE})
    assert respuesta.status_code == 200, respuesta.text
    return cliente


@pytest.fixture
def como(app):
    """`como("operador")` → un cliente HTTP logueado con ese rol.

    Un cliente por rol (cada uno con su cookie), creado a pedido. `como("admin")`
    es el admin sembrado.
    """
    clientes: dict[str, TestClient] = {}

    def _como(rol: str) -> TestClient:
        if rol not in clientes:
            if rol != ADMIN:
                app.state.users.create(username=rol, name=f"Usuario {rol}", password=CLAVE, role=rol)
            clientes[rol] = _cliente_logueado(app, rol if rol != ADMIN else ADMIN)
        return clientes[rol]

    return _como


@pytest.fixture
def admin(como) -> TestClient:
    return como("admin")


@pytest.fixture
def anonimo(app) -> TestClient:
    return TestClient(app, base_url="https://testserver")
