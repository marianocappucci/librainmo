"""Construcción de la aplicación.

`crear_app()` no se ejecuta al importar: el entrypoint es `app/asgi.py`. Es a
propósito — con la app armada al importar, la configuración queda resuelta por
el primer import y un test que quiera otra base ya llega tarde.
"""

from __future__ import annotations

import os

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from libraauth.auditoria import (
    AuditoriaRepository,
    agregar_middleware_de_usuario,
    build_logs_router,
    configurar_auditoria,
)
from libraauth.auth_events import AuthEventRepository
from libraauth.bootstrap import ensure_default_admin, ensure_demo_user
from libraauth.demo_codigos import DemoCodigoRepository
from libraauth.migrar import exigir_schema_al_dia
from libraauth.password_reset import PasswordResetService
from libraauth.session_auth import build_demo_codigos_router, build_smtp_settings_router, demo_username
from libraauth.smtp_settings import SmtpSettingsRepository, resolver_smtp_config
from libraauth.terminos import TerminosRepository, build_terminos_router
from libracore.clientes_router import build_clientes_router
from libracore.config_router import (
    build_backup_router,
    build_empresa_admin_router,
    build_empresa_router,
)
from libracore.db import core as libracore_core
from libracore.estado_del_sistema import build_estado_del_sistema_router
from libracore.indices_ajuste import INDICES, IndiceFaltante
from libracore.marca_router import build_marca_admin_router, build_marca_router, es_marca_propia, nombre_de_marca
from libracore.modules_gate import require_module
from libracore.resguardo_enlace import build_resguardo_enlace_router
from libracore.respaldo import Instancia
from libracore.security_headers import CSP_SPA, SecurityHeadersMiddleware
from libracore.smtp_router import build_smtp_probe_router
from libracore.tema_router import build_tema_admin_router, build_tema_router
from libracore.terminos_propios import leer_terminos_propios

from app import db
from app.auditoria import COLUMNAS_OCULTAS, etiqueta_segura
from app.auth import (
    UserRepository,
    construir_session_auth,
    get_current_user,
    require_admin,
    require_admin_o_servicio_o_panel,
    require_rol,
)
from app.config import Config
from app.errores import ErrorDeDominio
from app.frontend_dist import frontend_dist
from app.modulos import ModuleRepository, exigir_modulo
from app.roles import OPERADOR, ROLES, TODOS
from app.routers import auth as auth_router
from app.routers import cobros, contratos, cuotas, liquidaciones, propiedades, salud
from app.routers import usuarios as usuarios_router
from app.servicios import clientes as servicio_clientes
from app.validacion import errores_en_espanol

#: Qué entra al log de actividad: `{clase del modelo: nombre legible}`.
#:
#: Es una lista **blanca** a propósito: una tabla nueva no entra sola, así que
#: agregar un modelo obliga a decidir si su historial le importa a alguien.
#:
#: Las filas del motor (`clients`, `facturas`, `cc_asientos`…) son SQL crudo de
#: `libracore`, no modelos de SQLAlchemy, así que no pasan por este log: su historia
#: es el propio libro (el contraasiento) y la bitácora del motor.
AUDITABLES: dict[str, str] = {
    "Propiedad": "propiedad",
    "Titular": "titular de propiedad",
    "Contrato": "contrato",
    "ContratoPrecio": "precio de contrato",
    "Garantia": "garantía de contrato",
    "ConceptoContrato": "concepto de contrato",
    "Cuota": "cuota",
    "CuotaLinea": "línea de cuota",
    "Cobro": "cobro",
    "CobroImputacion": "imputación de cobro",
    "Gasto": "gasto",
    "GastoImputacion": "imputación de gasto",
    "Liquidacion": "liquidación",
    "LiquidacionItem": "ítem de liquidación",
}


def _instancia_a_respaldar(config: Config) -> Instancia:
    """Qué se lleva el backup: **una sola base**. El dominio, las tablas de
    `libraauth` y el schema de `libracore` viven juntos (ADR-002), así que el dump
    de la principal ya lo trae todo; declarar una segunda base sería meter dos veces
    la misma en `librainmo.dump` (`Instancia` lo rechaza al arrancar)."""
    return Instancia(nombre="librainmo", postgres_url=config.database_url, postgres_extra=[])


def crear_app(config: Config | None = None, *, sembrar_admin: bool = True) -> FastAPI:
    # Se resuelve acá y no adentro de `db.inicializar` porque el router de backup
    # necesita la MISMA config: la URL para el dump y el directorio de datos.
    config = config or Config.desde_entorno()
    db.inicializar(config)
    motor = db.engine()

    # 🔑 **`libracore` habla con la MISMA base que el dominio** (ADR-002). Es una conexión
    # aparte —`libracore.db` es SQL crudo, sin el engine de SQLAlchemy—, configurada con la
    # única URL que hay. Va antes de todo lo que lea `modulos` o cualquier tabla del motor.
    #
    # 🔴 **Acá NO se llama a `init_core_schema()`**: el schema lo crea la cadena de `libracore`
    # (`python -m app.migrar`) y el arranque la EXIGE más abajo. Si la app se lo creara sola,
    # un deploy que se olvide de migrar quedaría invisible.
    libracore_core.configure(config.database_url)

    # 🔑 **El arranque no crea tablas: exige que alguien haya migrado.** Las de
    # `libraauth` las versiona `libraauth-migrar`, las del motor `libracore-migrar` y las del
    # dominio Alembic (`python -m app.migrar` corre las tres cadenas). Una base sin migrar
    # hace que la app no levante, con el comando a correr en el mensaje, en vez de levantar
    # con un schema a medias.
    exigir_schema_al_dia(motor, prefijo="librainmo", base="dominio")
    db.exigir_libracore_al_dia(motor, config.database_url)
    db.exigir_dominio_al_dia(motor)

    sesiones = db.fabrica_de_sesiones()
    usuarios = UserRepository(sesiones, roles=ROLES)
    if sembrar_admin:
        # Variante **fail-closed**: sin `LIBRAINMO_ADMIN_PASSWORD` la app no
        # levanta, salvo `ENV=development`. La otra (`ensure_admin_user`) inventa
        # una contraseña y la imprime, y no son intercambiables.
        ensure_default_admin(usuarios, env_prefix="LIBRAINMO")

    # El visitante de la demo pública, **sólo si la instancia es una demo** (`DEMO_MODE` + `DEMO_USERNAME`, las mismas
    # dos variables que registran `POST /auth/demo`): en una instancia de cliente devuelve None y no toca la base.
    # 🔴 `rol=OPERADOR` explícito: el default de `libraauth` es `staff`, que acá no existe y cortaría el arranque.
    # Nunca admin: el visitante no puede entrar a Usuarios, Configuración ni al backup. Sin esta llamada la ruta
    # existe y no tiene a quién loguear (503).
    ensure_demo_user(usuarios, rol=OPERADOR)

    modulos = ModuleRepository(config.database_url)
    modulos.ensure_seeded()

    app = FastAPI(
        title="LibraInmo",
        description="Administración de alquileres para inmobiliarias — familia Libra",
        version="0.1.0",
    )
    # El router de `libraauth` los lee de acá por nombre: sin estos, el login
    # devuelve 500 al primer request y no al arrancar.
    app.state.users = usuarios
    app.state.session_auth = construir_session_auth(usuarios)
    # `libracore.modules_gate.require_module` lee `app.state.modules`.
    app.state.modules = modulos
    app.state.config = config

    # 🔴 **Sin esta línea se apagan DOS cosas.** `auth_events` es opt-in por
    # ausencia: sin él no se anota el log de accesos y el corte por intentos
    # fallidos del login nunca dispara (cuenta 0).
    app.state.auth_events = AuthEventRepository(sesiones)

    # Log de actividad: quién creó, editó o borró qué. Cuelga del `flush` de
    # SQLAlchemy, así que una escritura que no pase por acá no existe.
    configurar_auditoria(sesiones, AUDITABLES, columnas_ocultas=COLUMNAS_OCULTAS, etiqueta=etiqueta_segura)
    app.state.auditoria = AuditoriaRepository(sesiones)
    agregar_middleware_de_usuario(app)

    # Términos y Condiciones: la prueba de la aceptación y lo que enciende el
    # gate. 🔴 Sin esta línea el gate NO corta y la instancia no falla: se
    # queda sin gate, en silencio. Por eso hay un test que lo prueba.
    #
    # Marca blanca (ADR-092/093 del motor): una instancia con marca propia **exige** los Términos de su revendedor
    # y, sin ellos, queda frenada; nunca cae a los de la familia.
    app.state.terminos = TerminosRepository(
        sesiones, contrato_propio=leer_terminos_propios, exigir_propio=es_marca_propia
    )

    # Se agrega **al final** a propósito: en Starlette el último middleware
    # agregado es el más externo, así envuelve todas las respuestas, incluidas
    # las de error de los de adentro. `CSP_SPA`: este producto no carga nada
    # externo.
    app.add_middleware(SecurityHeadersMiddleware, csp=CSP_SPA)

    app.add_exception_handler(RequestValidationError, errores_en_espanol)

    @app.exception_handler(IndiceFaltante)
    async def _indice_faltante(_request: Request, exc: IndiceFaltante) -> JSONResponse:
        # El ajuste no se calcula con un índice que falta (ADR-085 del motor): se dice qué fechas cargar.
        return JSONResponse({"detail": {"mensaje": str(exc), "indice": exc.indice,
                                        "indice_nombre": INDICES[exc.indice].nombre,
                                        "fechas_faltantes": exc.fechas}}, status_code=409)

    @app.exception_handler(ErrorDeDominio)
    async def _error_de_dominio(_request: Request, exc: ErrorDeDominio) -> JSONResponse:
        return JSONResponse({"detail": exc.mensaje}, status_code=exc.status)

    app.include_router(salud.router)
    # El tema de la suite (colores y modo de la instancia): lo lee la SPA al arrancar, antes de la sesión, y lo
    # cambia el admin o el backoffice. Sin esto la SPA pide `/api/tema` y recibe un 404 en cada carga.
    app.include_router(build_tema_router())
    app.include_router(build_tema_admin_router(), dependencies=[Depends(require_admin_o_servicio_o_panel)])
    # La marca de la instancia (nombre, logo, color, íconos y manifest), para venderla a marca blanca. La lectura es
    # pública (el login también lleva la marca) y va **antes** del catch-all de la SPA (`asgi.py`): si no,
    # `/manifest.webmanifest` devolvería el `index.html`. Escribir es del admin o del backoffice (token de servicio).
    app.include_router(build_marca_router(dist=frontend_dist()))
    app.include_router(build_marca_admin_router(), dependencies=[Depends(require_admin_o_servicio_o_panel)])
    app.include_router(auth_router.construir_router())

    # Los códigos de acceso de la demo pública: se emiten desde el backoffice y los consume `POST /auth/demo`.
    # 🔴 `POST /auth/demo` falla cerrado sin esta línea (503 en vez de dejar entrar sin código): una demo abierta a
    # internet es justo lo que el código existe para evitar. Misma `sesiones` que los usuarios (una sola base).
    if demo_username():
        app.state.demo_codigos = DemoCodigoRepository(sesiones)
        app.include_router(build_demo_codigos_router())

    # El correo saliente de la instancia (`/admin/smtp`) y la recuperación de contraseña, que lo usa para mandar el
    # enlace. Sin SMTP la app levanta igual: `forgot-password` contesta 503 recién cuando alguien lo pide.
    app.state.smtp_settings = SmtpSettingsRepository(sesiones)
    app.include_router(build_smtp_settings_router())
    # `POST /admin/smtp/probar`: resuelve por el MISMO camino que los envíos, así el botón mide lo que va a pasar. El
    # gate lo pone el producto: el router del motor no trae ninguno y esto abre una sesión SMTP con las credenciales
    # de la instancia.
    app.include_router(
        build_smtp_probe_router(lambda: resolver_smtp_config(sesiones)),
        dependencies=[Depends(require_admin)],
    )
    app.state.password_reset = PasswordResetService(
        sesiones,
        # CALLABLE: con marca propia el mail de recuperación sale con el nombre del revendedor.
        product_name=lambda: nombre_de_marca("LibraInmo"),
        reset_url_base=os.environ.get("LIBRAINMO_RESET_URL_BASE", "https://dev.librainmo.com.ar/reset-password"),
        # CALLABLE, no un valor: se resuelve en cada envío. Con uno fijo, guardar el SMTP por pantalla no tendría
        # efecto hasta recrear el contenedor.
        smtp_config=lambda: resolver_smtp_config(sesiones),
    )
    app.include_router(usuarios_router.construir_router())
    # `GET/POST /terminos…`. NO se gatea desde afuera: es el único camino para
    # salir del gate.
    app.include_router(build_terminos_router())

    # La administración de alquileres: cada router declara `exigir_modulo("alquileres")` y sus roles.
    # Los clientes (inquilinos, propietarios, garantes) son los del motor, con su router: es el que usa
    # `SelectCliente` de libra-ui para elegir y dar de alta en el lugar.
    #
    # `impide_desactivar`: la baja de un inquilino con contrato abierto, de un garante o de un titular dejaría al
    # dominio apuntando a un cliente inactivo. El motor no ve esas tablas; el producto le dice por qué no.
    def _impide_desactivar(cliente_id: int) -> str | None:
        with sesiones() as sesion:
            return servicio_clientes.impide_desactivar(sesion, cliente_id)

    app.include_router(build_clientes_router(impide_desactivar=_impide_desactivar),
                       dependencies=[*exigir_modulo("alquileres"), Depends(require_rol(*ROLES))])
    app.include_router(propiedades.router)
    app.include_router(contratos.router)
    app.include_router(cuotas.router)
    app.include_router(cobros.de_cuotas)
    app.include_router(cobros.router)
    app.include_router(liquidaciones.gastos)
    app.include_router(liquidaciones.router)
    app.include_router(liquidaciones.reportes)

    # 🔴 `prefix="/api/logs"` y NO el `/logs` por default: la SPA tiene su
    # pantalla en `/logs`, y FastAPI resuelve sus rutas antes que el catch-all.
    app.include_router(
        build_logs_router(AUDITABLES, prefix="/api/logs"),
        dependencies=[Depends(require_admin)],
    )

    # Datos de la empresa (nombre, logo): los lee cualquier usuario con sesión
    # —el encabezado de los comprobantes y la pantalla los muestran—, los escribe el
    # admin. Son los routers del motor; el producto sólo les pone el gate.
    app.include_router(build_empresa_router(), dependencies=[Depends(require_rol(*TODOS))])
    app.include_router(build_empresa_admin_router(), dependencies=[Depends(require_admin)])

    # "Datos / Backup". 🔴 `cerrar_conexiones`/`reabrir_conexiones` no son
    # opcionales: sin ellos el restore contesta `ok` y no tiene efecto hasta que
    # alguien reinicie el contenedor, porque el pool sigue con la conexión vieja.
    backups_dir = os.path.join(config.directorio_de_datos, "backups")
    app.include_router(
        build_backup_router(
            _instancia_a_respaldar(config),
            backups_dir,
            cerrar_conexiones=motor.dispose,
            reabrir_conexiones=motor.dispose,
        ),
        dependencies=[Depends(require_admin)],
    )
    # La barra de estado del pie (libracore ADR-075, libra-ui ADR-083), la de los otros ocho: usuario, versión y el
    # último respaldo, en una consulta. La abre cualquier rol; lo que ve cada uno lo decide el motor (el respaldo, sólo
    # el admin). LibraInmo no factura con ARCA todavía ni tiene LibraEdge: esos bloques salen `null`.
    app.include_router(
        build_estado_del_sistema_router(usuario_actual=get_current_user, backups_dir=backups_dir),
        dependencies=[Depends(require_rol(*TODOS))],
    )

    # La copia externa: el administrador conecta el Google Drive o el Dropbox de la inmobiliaria desde Configuración →
    # Datos / Backup (`/api/config/resguardo-externo/enlace`). El router es del motor; subir es del host, por cron, con
    # el `rclone.conf` que este router deja en `backups_dir/.resguardo/` (por eso es la MISMA variable que el backup).
    #
    # 🔴 **Es un add-on**, apagado hasta que el backoffice lo prenda en la instancia: el segundo gate es el módulo
    # `resguardo_externo`, y apagado contesta 403, que la pantalla del kit lee como «tu plan no lo incluye» y esconde la
    # tarjeta. El callback de OAuth va detrás de los mismos gates a propósito (docstring del router).
    app.include_router(
        build_resguardo_enlace_router(backups_dir, carpeta="Resguardo LibraInmo"),
        dependencies=[Depends(require_admin), Depends(require_module("resguardo_externo"))],
    )
    return app
