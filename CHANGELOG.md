# Changelog — LibraInmo

## Sin publicar

- Esqueleto del producto, copiado y adaptado de LibraView: `crear_app()`, `libraauth` (login, usuarios, auditoría, Términos), `libracore` (empresa, backup, reloj de Argentina) y `libra-ui`; roles `admin` y `operador`; módulo y plan `alquileres` (`PLAN_PRECIOS` vacío); Alembic propio con la baseline `0001` (`actividad_log`); `/salud`; Dockerfile y compose de desarrollo; `docs/desarrollo-local.md`.
- **Una sola base con el schema de `libracore` adentro** (ADR-002): `python -m app.migrar` corre tres cadenas (`libraauth`, `libracore` v1.196.1 y el dominio), `crear_app()` configura `libracore.db.core` sobre la misma URL y exige las tres al día. La tabla `modulos` es la del motor.
- SPA (`frontend/`, React + Vite + `libra-ui` v0.181.0): login con Términos, Inicio («Administración de alquileres», vacía), Usuarios con los dos roles y Actividad.
- `app/database.py`: el contrato del backoffice (`get_modulos`/`set_addon` por `docker exec`) sobre la tabla `modulos` del motor.
- Suite contra PostgreSQL real con una base por worker de xdist, y CI (`.github/workflows/ci.yml`).
