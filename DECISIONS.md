# Decisiones arquitectónicas — LibraInmo

Registro ADR. No borrar decisiones: si dejan de aplicar, marcarlas como reemplazadas.
El diseño del producto (qué ya existe en la familia, reparto motor y producto, fases) está en la
página `inmobiliaria-administracion-alquileres-diseno` del wiki.

## ADR-001 — Producto nuevo sobre los motores, como LibraView

- Estado: aceptada (humano, 2026-10-26: «producto nuevo, con nombre, landing y backoffice propios»;
  esqueleto armado el mismo día)
- Contexto: la administración de alquileres podía construirse como un módulo de un producto existente
  (LibraDesk ya devenga cuotas de contratos de alquiler de equipos) o como vertical propio. La mitad
  difícil —devengado, cuenta de terceros, recibo, factura— ya está escrita y probada en el motor y en
  LibraDesk, pero el contrato de locación (propiedad, titulares, garantes, conceptos trasladables) no
  se parece al de LibraDesk, atado a activos y colocaciones.
- Decisión: vertical propio sobre `libraauth`, `libracore` y `libra-ui`, con la misma estructura que
  LibraView (nacido el 2026-10-25): FastAPI + React, `crear_app()` que no corre al importar, el
  arranque que exige las migraciones en vez de crear tablas, tests contra PostgreSQL real, huso
  `America/Argentina/Buenos_Aires` y fechas `dd-mm-aaaa`, `index.html` sin traductor.
- Consecuencias: un solo login, un solo padrón de clientes (los del motor) y facturación, recibos y
  tesorería que vienen del motor. Lo común se escribe y se arregla en `libracore`, no acá
  (`CONVENTIONS.md`, «Dónde se arregla»); este repo aporta costuras y el modelo inmobiliario.
- Alternativas descartadas: un módulo de LibraDesk (acoplaría dos modelos de contrato distintos y
  ataría la venta de uno a la del otro).

## ADR-002 — Una sola base, con el schema de `libracore` adentro

- Estado: aceptada (pedido del esqueleto, 2026-10-26; criterio «una sola base por producto», ADR-078 de
  `libracore`)
- Contexto: LibraView no usa el schema del motor (no factura) y sólo comparte la base con
  `libraauth`. LibraInmo sí lo necesita: los inquilinos, propietarios y garantes son `clients`; la
  cuenta de cada uno es el libro de terceros (`cc_asientos`); el cobro emite `recibos`; la comisión
  sale en una `facturas` de ARCA; el ajuste lee `indices_ajuste`. Los productos nuevos (LibraCargo,
  LibraClub) ya llevan todo en una base.
- Decisión: dominio, `libraauth` y `libracore` conviven en la misma base. `python -m app.migrar` corre
  las tres cadenas en orden —`libraauth` (crea `usuarios`), `libracore` (`libracore.migrar.upgrade`,
  cuyas FK apuntan a `usuarios`) y la del dominio— cada una con su tabla de versión
  (`alembic_version_libraauth`, `alembic_version` y `alembic_version_librainmo`). `crear_app()`
  configura `libracore.db.core` sobre esa URL y **exige** las tres al día: el arranque no crea nada
  (`init_core_schema` no se llama). El backup es un solo dump.
- Consecuencias:
  - **La tabla `modulos` es la del motor**, no una del dominio como en LibraView: tiene otra forma
    (`id`, `modulo` único, `habilitado` entero) y dos tablas con el mismo nombre no caben en un
    schema. `app/modulos.py` la lee y escribe por `libracore.db.modulos` y
    `libracore.provisioning.apply_plan_modules`; el dominio no tiene `ModuloRow`. La baseline `0001`
    del dominio sólo crea `actividad_log`.
  - Las claves foráneas del dominio hacia `clients` y `usuarios` son posibles y verificables en la
    misma base.
  - La suite restaura entre test y test las filas que el motor siembra al migrar (caja y depósito
    por defecto, categorías de egreso).
  - `libracore.db.url_de_instancia._UNA_SOLA_BASE` todavía no nombra a `librainmo`: mientras no
    esté, `libracore-migrar --prefijo librainmo` falla a propósito. `app.migrar` pasa la URL
    explícita y no depende de eso, pero el alta por el backoffice sí lo va a necesitar (TASKS.md).
- Alternativas descartadas: el core en una base aparte (es la forma que la familia está retirando:
  hay dos cadenas de usuarios y las FK del motor a `usuarios` no resuelven).

## ADR-003 — Roles `admin` y `operador`, y un solo módulo `alquileres`

- Estado: aceptada (2026-10-26; los permisos finos se ajustan con el piloto)
- Contexto: LibraView tiene cuatro roles y dos módulos que son las dos mitades de lo que vende.
  LibraInmo, hoy, es una sola cosa.
- Decisión:
  - Roles del **personal de la inmobiliaria**: `admin` (usuarios, actividad, empresa, backup y todo
    lo operativo) y `operador` (el día a día). Viven en `app/roles.py` como grupos con nombre
    (`OPERAN_ALQUILERES`, `ADMINISTRAN`, `TODOS`); ningún router escribe una tupla suelta.
  - El inquilino y el propietario **no son usuarios**: son filas de `clients`. Su acceso a su cuenta
    es de la fase 2.
  - Un módulo, `alquileres`, y un plan, `alquileres`, que lo habilita. `PLAN_PRECIOS` va vacío: el
    precio es una decisión comercial. La parte comercial (ventas, reservas con seña) será otro módulo
    cuando esté construida, no antes: declararla ahora le daría al backoffice una casilla para algo que
    la instancia no sirve.
  - Cada router de dominio se monta con `exigir_modulo("alquileres")` y falla cerrado: un test
    recorre las rutas de `/api` y exige el gate en toda la que no sea administración.
- Consecuencias: si el piloto necesita un rol de sólo lectura (un contador) o de cobranza sin acceso
  a liquidaciones, se agrega como grupo en `roles.py` y como fila en `test_permisos.py`.
