# Tasks — LibraInmo

Trabajo concreto y vigente.

## En curso

## Próximas

- [ ] Fase 1 del [ROADMAP.md](ROADMAP.md): modelo inmobiliario (propiedades, titulares, contratos, garantías, conceptos trasladables) con sus migraciones, y los routers con `exigir_modulo("alquileres")`
- [ ] Cuando entre el primer modelo: sumarlo a `AUDITABLES` (`app/main.py`) y declarar en `app/auditoria.py` las columnas que no deben copiarse al log
- [ ] Pantallas de la SPA: hoy sólo hay Inicio (vacía), Usuarios y Actividad. Agregar al menú de `Layout.tsx` y a `titulos-con-icono.test.ts` cada una que entre
- [ ] Cuando haya selects de datos y campos de cliente: subir los pisos de los guards de `frontend/src/test/` (`campos-de-cliente`, `selects-buscables`), que hoy aceptan cero porque el esqueleto no tiene ninguno
- [ ] Cuando entre la primera tabla con columna de acciones: sumar el guard de «columna de acciones con título y botones con borde» (`acciones-normalizadas.test.ts` en LibraView/LibraClub), que acá no se copió porque no hay tablas
- [ ] Datos de demo (semillas) con inquilinos, propietarios y propiedades **ficticios**

## Bloqueadas

- [ ] Alta por el backoffice / `libracore-migrar --prefijo librainmo` — bloqueo: `librainmo` no figura en `libracore.db.url_de_instancia._UNA_SOLA_BASE` (arreglo de fondo en el motor, ADR-002) [H: autorizar el cambio en `libracore`]
- [ ] Identidad en el kit (`libra-ui/identidad`): hoy el producto usa los tokens neutros y una marca propia sencilla (`/favicon.svg`) — bloqueo: agregarla al kit
- [ ] Repo en GitHub, CI y dev — bloqueo: nombre definitivo y dominios [H]
- [ ] Fase 0 en `libracore` (cálculo del ajuste, aritmética de períodos y devengado, punitorios, descarga de índices oficiales): es previa a que el producto ajuste contratos

## Hecho

- [x] Esqueleto (2026-10-26) — app que arranca y migra las tres cadenas sobre una sola base (`libraauth`, `libracore`, dominio), login por cookie, roles `admin` y `operador`, módulo y plan `alquileres`, auditoría, Términos, empresa y backup, SPA con login, Inicio, Usuarios y Actividad, suite y CI

- [x] ~~**Motor:** `anular_recibo` sin `conn=`~~ ✅ **Cerrado el 2026-10-26**: libracore v1.197.1.
- 🔸 **Pago parcial de una cuota** (ADR-006): definir con el piloto cómo se imputa.
- 🔸 **[H] IVA de la comisión** (ADR-007): ¿va incluida o aparte? Con el contador del piloto, antes de facturarla.
- 🔸 **Neto negativo** (ADR-007): cómo se arrastra la deuda del propietario a la liquidación siguiente.
