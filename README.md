# LibraInmo

Administración de alquileres para inmobiliarias: contratos con ajuste por índice, cobro
mensual al inquilino y liquidación al propietario. Lo comercial (ventas, reservas, interesados)
viene en una fase posterior. Piloto propuesto: NA Propiedades.

Parte de LibraSuite: corre sobre `libraauth`, `libracore` y `libra-ui`.

## Estado

- **Sólo local** (2026-10-26): sin dominios, sin repo en GitHub, sin deploy. El CI está escrito
  (`.github/workflows/`) y se estrena con el primer remoto.
- **Esqueleto sin dominio inmobiliario.** Hay app que arranca, migra las tres cadenas
  (`libraauth`, `libracore` y la del dominio), login, usuarios (`admin` y `operador`), actividad,
  Términos, datos de la empresa y backup. Propiedades, titulares, contratos, cuenta corriente y
  liquidaciones son la fase 1 del [ROADMAP.md](ROADMAP.md).
- **Una sola base** con el schema de `libracore` adentro (clientes, facturas, libro de terceros,
  recibos, índices de ajuste): ver ADR-002 en [DECISIONS.md](DECISIONS.md).
- Rama de desarrollo: `develop`; producción: `main`.
- **Nombre de trabajo:** LibraInmo, el sugerido en el diseño. Falta confirmar los dominios en NIC
  Argentina antes de registrar (`libraprop.com.ar`, la otra opción, está ocupado).

## Desarrollo local

Ver [docs/desarrollo-local.md](docs/desarrollo-local.md).

## Documentación relacionada

- [ROADMAP.md](ROADMAP.md) — fases
- [TASKS.md](TASKS.md) — trabajo vigente
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [CONVENTIONS.md](CONVENTIONS.md)
- [DECISIONS.md](DECISIONS.md) — ADR
- [CHANGELOG.md](CHANGELOG.md)
- Wiki: `inmobiliaria-administracion-alquileres-diseno` (diseño: qué ya existe en la familia, reparto motor y producto, cuenta corriente, fases)
