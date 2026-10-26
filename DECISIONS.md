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

## ADR-004 — Propiedades, titulares y contratos (fase 1, tanda 1)

**Estado:** aceptada (2026-10-26).

**Contexto.** El primer bloque del dominio: qué administra la inmobiliaria, de quién es y en qué condiciones se
alquila. Diseño: `wiki/analyses/inmobiliaria-administracion-alquileres-diseno.md`.

**Decisión.**
1. **Inquilinos, propietarios y garantes son clientes del motor** (`clients`), con su router
   (`libracore.clientes_router`) bajo el módulo `alquileres`. Las claves foráneas del dominio apuntan a una
   declaración mínima de esa tabla en una `MetaData` aparte (`app/models/motor.py`), como LibraCargo: la crea la
   cadena del motor y el chequeo del esquema compara sólo el dominio.
2. **Los titulares se reemplazan juntos y suman 100** (`PUT /api/propiedades/{id}/titulares`). Cargarlos de a uno
   deja estados intermedios que la liquidación no sabría repartir.
3. **«Alquilada» no se elige a mano**: la pone el contrato al activarse y la saca al rescindirse o finalizar.
4. **El ciclo del contrato es `borrador` → `vigente` → `rescindido` | `finalizado`.** Un borrador se edita entero,
   también su importe inicial; uno vigente sólo cambia sus observaciones. Activar exige titulares completos y que la
   propiedad no tenga otro contrato vigente. Un borrador se borra; un contrato que estuvo vigente, no.
5. **El alquiler tiene precio con vigencia** (`contrato_precios`, la forma de LibraDesk): uno nuevo cierra el vigente
   el día antes. El ajuste por índice valida la clave contra el catálogo del motor (`libracore.indices_ajuste`).
6. **Los importes y porcentajes salen de la API como texto decimal**, con la escala de su columna
   (`app/servicios/montos.py`): un `float` no tiene centavos exactos, y esto es plata de terceros.
7. **Las reglas viven en el servicio, no sólo en pydantic**: la importación de contratos va a llamar al servicio
   directo.

## ADR-005 — Cuotas mensuales y ajuste del alquiler (fase 1, tanda 2a)

**Estado:** aceptada (2026-10-26).

**Decisión.**
1. **La aritmética es la del motor** (`libracore.periodos`): mes adelantado y prorrateo por días en las dos puntas. El
   fin efectivo de un contrato rescindido es su fecha de rescisión.
2. **Una cuota no vence antes de emitirse** (decisión del 2026-10-26): vence `max(día pactado, emisión)`. Con la
   cuenta de LibraDesk, una cuota prorrateada que arranca el 20 con vencimiento el 10 vencería diez días antes de
   existir.
3. **Previsualizar y generar**, con confirmación humana. Idempotente: un índice único parcial deja una sola cuota viva
   por contrato y mes; anular libera el mes.
4. **Un ajuste pendiente bloquea la cuota de ese contrato** hasta aplicarlo. El ajuste se cuenta desde
   `fecha_inicio` (`periodo_anclado`), su base es el precio vigente, por índice usa `libracore.indices_ajuste` (y baja
   el índice si falta) y por porcentaje compone los períodos que pasaron.
5. **Los conceptos que paga el inquilino van en la cuota**: los fijos solos, los variables con el importe del mes (al
   generar o después). No se prorratean. Los que paga el propietario no van en la cuota.
6. **Cada cuota es un cargo en la cuenta del inquilino** (`cc_asientos`, rol `inquilino`), en la misma transacción.
   Agregarle una línea corrige el asiento; anularla lo contraasienta. El importe queda congelado (`precio_id`).

## ADR-006 — El cobro de una cuota: punitorio, reparto entre titulares y recibo del motor (fase 1, tanda 2b)

**Estado:** aceptada (2026-10-26).

**Decisión.**
1. **Se cobra la cuota entera** más el punitorio. El pago parcial queda afuera: repartir un pago a cuenta entre
   alquiler, conceptos y titulares pide reglas de imputación que el piloto todavía no definió.
2. **El punitorio es la cuenta del motor** (`libracore.mora.calcular_punitorio`): interés simple desde el vencimiento,
   con la gracia del contrato y el vencimiento corrido al día hábil. Se puede **condonar** y queda cuánto era.
3. **La inmobiliaria cobra como mandataria.** Haber del inquilino por el total; haber de cada titular por su parte del
   alquiler y de los conceptos (por tipo: el alquiler es la base de la comisión); el punitorio va al propietario sólo
   con `punitorio_para='propietario'`. El reparto cierra al centavo (el último titular absorbe el redondeo).
4. **El recibo es del motor** (`emitir_recibo_de_asiento`, ADR-087 del motor, v1.197.0), «por cuenta y orden de» los
   titulares, en la misma transacción. PDF en `GET /api/cobros/{id}/recibo.pdf`.
5. **Anular** contraasienta todo, anula el recibo y deja la cuota pendiente. 🔸 `anular_recibo` del motor no acepta
   `conn=` todavía: el recibo se anula después de confirmar (pendiente del motor, anotado en `TASKS.md`).
6. Medios: los del motor (`libracore.medios_pago`) menos «cuenta corriente»; tienen que sumar el total.
