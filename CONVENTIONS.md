# Convenciones — LibraInmo

Reglas específicas del código y del repositorio. Las instrucciones generales del ecosistema siguen en `AGENTS.md`/`CLAUDE.md` y la wiki.

## Código

- Frontend: `index.html` con `<html lang="es" translate="no">` y `<meta name="google" content="notranslate" />` desde el primer commit; el traductor de Chrome rompe React (`reglas/producto.md`, «La app no se deja traducir»).

## Tests

- `frontend/src/test/index-sin-traductor.test.ts`: vigila el `lang` y el `translate="no"` del `index.html`.
- Backend: `pytest -n 2` (xdist): cada worker usa su propia base (`libracore.testing.pg_por_worker`). Ver `docs/desarrollo-local.md`.

## Git y ramas

- `develop`: desarrollo e integración.
- `main`: producción.

## Seguridad y configuración

- No hardcodear secretos.

## Dónde se arregla (regla de la familia, 2026-10-03)

**El arreglo de fondo vive siempre en el motor** (`libracore`; `libracommerce` y `libra-ui` para
lo suyo), **nunca en este repo.** Lo que otro producto comparte o podría compartir —el protocolo
con ARCA, las reglas fiscales y sus validaciones, las guardas contra duplicados, la numeración, la
cuenta corriente, los índices de ajuste y el cálculo del ajuste, la aritmética de períodos y
devengado, los punitorios, los componentes de pantalla compartidos— se escribe y se arregla en el
motor. Este repo sólo aporta **costuras** (los hooks que el motor ya expone) y lo suyo: pantallas,
textos y su modelo de datos propio (propiedades, titulares, contratos de locación, garantías).
Si falta la costura, se agrega al motor; si el arreglo hace falta antes, igual se hace en el motor
(PR y tag) y acá se sube el pin: nada «provisorio» en este repo. Un hueco que se encuentra acá se
busca en los demás productos antes de darlo por acotado. Detalle y motivo: `reglas/producto.md` del
wiki.

## Propias de LibraInmo

- Todo en español rioplatense: código de dominio, textos, commits y docs (nombres de tablas y campos en español, como LibraClub).
- Huso `America/Argentina/Buenos_Aires` en el contenedor, en el sidecar (`postgres -c timezone=...`) y en los tests; fechas en pantalla `dd-mm-aaaa`.
- Tests contra **PostgreSQL real**, nunca SQLite. En local, de a una suite por vez (`herramientas/suite-local.sh` del wiki, `-n` ≤ 2).
- Datos de demo y de tests **ficticios**: nombres, CUIT, direcciones y teléfonos inventados; nunca personas o empresas reales (ni el humano, ni sus clientes, ni combinaciones).
- **Una sola base.** Las tablas del dominio van en la cadena de este repo (`migrations/`); las del motor las trae `libracore` y no se redefinen acá. Sin `ModuloRow`: la tabla `modulos` es la del motor.
- Inquilinos, propietarios y garantes son filas de `clients` del motor; su cuenta es el libro de terceros (`cc_asientos`) con `tercero_id` y `rol` (`inquilino`, `propietario`). Un campo de cliente en pantalla es siempre `SelectCliente` del kit (ADR-071).
- Las tres cadenas de Alembic corren en este orden: `libraauth`, `libracore`, dominio (`python -m app.migrar`). Cada una con su tabla de versión; ids de revisión del dominio de hasta 32 caracteres.
