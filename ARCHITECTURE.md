# Arquitectura — LibraInmo

Estado: **esqueleto** (2026-10-26). Sin dominio inmobiliario todavía: sólo lo que el producto
necesita para arrancar, migrar, hacer login y administrar usuarios. Decisiones: `DECISIONS.md`.
Diseño del producto: página `inmobiliaria-administracion-alquileres-diseno` del wiki.

## Componentes

```
                    ┌──────────────── FastAPI (app/main.py: crear_app) ───────────────┐
 navegador / SPA ──►│ middleware: headers de seguridad · usuario para la auditoría    │
                    │                                                                  │
                    │ routers                                                          │
                    │  /auth, /api/usuarios ──► libraauth                              │
                    │  /salud, /health                                                 │
                    │  /api/logs ─────────────► libraauth (log de actividad)           │
                    │  /api/config/empresa, /api/config/backups ─► libracore           │
                    │  (fase 1: /api/propiedades, /contratos… con exigir_modulo)       │
                    └───────────────────────────────┬──────────────────────────────────┘
                                                    ▼
              PostgreSQL — UNA sola base por producto (ADR-002), tres cadenas de Alembic:
                 libraauth (usuarios, auth_log, términos…)        alembic_version_libraauth
                 libracore (clients, facturas, recibos,           alembic_version
                            cc_asientos, indices_ajuste, modulos…)
                 dominio   (actividad_log; después, el modelo      alembic_version_librainmo
                            inmobiliario)
```

- **`app/main.py`** — `crear_app(config=None, *, sembrar_admin=True)`. No corre al importar; el
  entrypoint es `app/asgi.py` (`uvicorn app.asgi:app`), que además monta la SPA de `frontend/dist` o
  `/opt/frontend-dist` **si existe**. En este orden: configura `libracore.db.core` sobre la URL de la
  base, **exige** que las tres cadenas estén al día (no crea nada), siembra el admin (fail-closed,
  `LIBRAINMO_ADMIN_PASSWORD`), siembra el módulo y arma auditoría, Términos y routers.
- **`app/migrar.py`** — `python -m app.migrar [url]`: `libraauth`, luego `libracore`
  (`libracore.migrar.upgrade`) y por último el dominio. El orden importa: las FK del motor apuntan a
  `usuarios`, y las del dominio van a apuntar a `clients`.
- **`libraauth`** (v0.55.0): usuarios, sesión por cookie `inmo_session`, log de accesos, log de
  actividad (`AUDITABLES`, lista blanca, hoy vacía), Términos y Condiciones (gate de 403 hasta
  aceptar) y el router de usuarios unificado (`/api/usuarios`).
- **`libracore`** (v1.196.1): reloj de Argentina (`libracore.fechas`), headers de seguridad
  (`CSP_SPA`), empresa/logo (`/api/config/empresa`), backup (`/api/config/backups…`), gate por módulo
  (`modules_gate.require_module`) y SPA. Y, a diferencia de LibraView, **su schema vive en la base
  del dominio**: es sobre lo que se va a construir el producto.
  - `clients`: inquilinos, propietarios y garantes (el propietario tiene que serlo: se le factura la comisión).
  - `cc_asientos` (libro de terceros, ADR-026 del motor): `libracore/db/libro_de_terceros.py`
    (`asentar`, `contraasentar`, `saldo`, `extracto`, `saldos`) con `tercero_id` y `rol` (`inquilino`,
    `propietario`).
  - `recibos`, `facturas` (ARCA), `comprobantes_pendientes`, tesorería y medios de pago.
  - `indices_ajuste`: ICL, IPC, Casa Propia y dólar, con carga manual y fuente.
  - Es **SQL crudo** (`libracore.db.core.get_connection()`), no modelos de SQLAlchemy: el dominio lo
    usa por sus funciones, y la `Base` del dominio no mapea sus tablas.
- **`plans.py`** — plan `alquileres` → módulo `{"alquileres"}`. `app/modulos.py` lo guarda en la tabla
  `modulos` **del motor** y los routers de dominio pasan por `exigir_modulo("alquileres")` (403 si el
  plan no lo incluye; 401 antes, para no contarle a un anónimo qué módulos hay).
- **`app/roles.py`** — `admin` y `operador`, con la matriz como grupos con nombre.
- **Backup** — una sola base: el dump trae dominio, `libraauth` y `libracore`.

## Frontend

`frontend/` (React 19, Vite, TypeScript, Tailwind v4, `libra-ui` v0.181.0). Login y Términos del
kit; layout con barra lateral (Inicio, y en Administración: Usuarios y Actividad); `Inicio` es una
pantalla vacía hasta la fase 1. Las rutas no llevan guarda de rol: el permiso lo decide el servidor,
y el menú sólo evita ofrecer lo que va a dar 403.

## Tests

- Backend: PostgreSQL real, una base por worker de xdist (`<base>_gw0`…, `libracore.testing.pg_por_worker`),
  el schema reconstruido con las tres cadenas y las filas que siembra el motor devueltas entre test y test.
- Frontend: vitest + testing-library, con guards que leen los fuentes (colores fijos, relleno de pantallas,
  barra lateral, títulos con ícono, `index.html` sin traductor).

## Lo que todavía no hay

El modelo inmobiliario (propiedades, titulares, contratos, garantías, conceptos trasladables), el
devengado, el ajuste, el cobro y la liquidación. Parte de eso es del motor (fase 0 del `ROADMAP.md`).
