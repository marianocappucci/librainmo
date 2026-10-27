#!/usr/bin/env bash
# Reset diario de la demo pública de LibraInmo.
#
# Deja la base de cero, corre las migraciones y siembra. **El estado limpio es código, no un backup guardado a mano**: eso
# es lo que hace que sea reproducible, y que agregar un dato de ejemplo sea un commit y no una operación manual sobre el
# servidor.
#
# Corre por cron a las 05:10, después del reset de LibraClub (05:05) y de los demás (04:30 a 05:05), para no cargar el
# I/O del VPS en el mismo minuto.
#
# 🔴 **Sólo toca la instancia demo.** El contenedor está escrito acá, no viene por argumento: un reset apuntado al
# contenedor equivocado le borra la base a un cliente, y no hay confirmación que valga a las cinco de la mañana.
#
# Adaptado del reset de LibraCargo, que acumula las defensas de tres incidentes de esta familia. Las diferencias propias
# están marcadas con [LIBRAINMO]:
#   - la URL de la base está en LIBRAINMO_DATABASE_URL;
#   - la semilla va en la imagen (`scripts/semilla_demo.py`) y se corre adentro del contenedor, sin pasar por la API ni
#     por un login: no hay captcha que resolver ni contraseña que pasar.
set -euo pipefail

CONTENEDOR="librainmo-demo"
CHECKOUT="/root/librainmo"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# --- Las guardas ----------------------------------------------------------
# Si el nombre no es el de una demo, no se sigue. Es barato, y es lo único que separa "resetear la demo" de "borrarle la
# base a un cliente".
case "$CONTENEDOR" in
  *-demo|*-publica) ;;
  *) log "ABORTA: '$CONTENEDOR' no parece una instancia demo."; exit 2 ;;
esac

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTENEDOR"; then
  log "ABORTA: el contenedor $CONTENEDOR no está corriendo."
  exit 3
fi

# 🔴 La guarda del nombre no alcanza, y esto no es teórico: hasta el 2026-08-07 el contenedor llamado `restolibra-demo`
# era el que servía sistema.restolibra.com.ar. El nombre decía demo y no lo era. Por eso se verifica una propiedad real de
# la instancia --DEMO_MODE, lo único que enciende el auto-login público-- y no cómo se llama.
if ! docker exec "$CONTENEDOR" printenv DEMO_MODE 2>/dev/null | grep -qx 1; then
  log "ABORTA: $CONTENEDOR no tiene DEMO_MODE=1. El nombre no alcanza."
  exit 4
fi

log "=== reset de $CONTENEDOR ==="

# --- 0. Todo lo que hace falta para reconstruir, ANTES de tocar la base ----
# 🔴 El 2026-08-06 el reset de otro producto borró la base y recién después descubrió que no podía sembrar: el seed vivía
# en `develop` y el checkout del VPS estaba en `main`. Cinco demos quedaron vacías, y el cron lo habría repetido todas las
# noches. El orden correcto es conseguir primero lo que se necesita para volver a armar: si algo falta, no se borra nada.
#
# [LIBRAINMO] La semilla viaja en la imagen (`COPY scripts ./scripts` del Dockerfile), así que no se busca en ninguna rama:
# se comprueba que se pueda IMPORTAR en el contenedor que corre. Importar no toca la base (`main()` es lo que la usa), y
# atrapa tanto un archivo ausente como una dependencia que ya no resuelve.
if ! docker exec -w /app "$CONTENEDOR" python3 -c "import scripts.semilla_demo" >/dev/null 2>&1; then
  log "ABORTA: $CONTENEDOR no puede importar scripts.semilla_demo. No se borra nada."
  exit 6
fi
log "semilla lista en la imagen ($CONTENEDOR:/app/scripts/semilla_demo.py)"

# Las migraciones que corresponden a ESTA demo: las que declara `scripts/panel_admin.py` **en el commit de la imagen que
# corre** (label `org.libra.commit`), leídas con `libracore.provisioning.migraciones_de_la_imagen`. No las del checkout: el
# checkout está en `develop` y la demo corre la imagen de `main` -- es el defecto que se cerró en `actualizar` el
# 2026-09-16. Se leen ACÁ y no después del `DROP SCHEMA` (donde las leía el reset de LibraCargo): si no se pueden leer, la
# base sigue intacta y no queda una demo vacía hasta la noche siguiente.
IMAGEN=$(docker inspect --format '{{.Config.Image}}' "$CONTENEDOR")
CADENAS=$("$CHECKOUT/.venv-scripts/bin/python" - "$CHECKOUT" "$IMAGEN" <<'PY' || true
import sys
from pathlib import Path
from libracore.provisioning import SCRIPT_DEL_PANEL, migraciones_de_la_imagen
migraciones, commit = migraciones_de_la_imagen(Path(sys.argv[1]), sys.argv[2], script=SCRIPT_DEL_PANEL)
print("\n".join(" ".join(c) for c in migraciones))
PY
)
if [ -z "${CADENAS:-}" ]; then
  log "ABORTA: no se pudieron leer las migraciones de la imagen $IMAGEN. No se borra nada."
  exit 12
fi
# [LIBRAINMO] Los clientes y la demo viven fuera del árbol del repo (`/srv/libra/librainmo/clientes/<slug>`).
COMPOSE="${CLIENTES_DIR:-${LIBRA_CLIENTES_DIR:-/srv/libra/librainmo/clientes}}/demo/docker-compose.yml"
[ -f "$COMPOSE" ] || { log "ABORTA: no encontré $COMPOSE. No se borra nada."; exit 12; }

# --- 1. El sidecar --------------------------------------------------------
# Este producto es PostgreSQL siempre, así que no hay motor que detectar -- pero igual se verifica, en vez de suponerlo: si
# un día la URL no fuera de PostgreSQL, borrar "el schema public" no aplicaría y el reset diría "listo" sin haber
# reseteado nada.
# [LIBRAINMO] La variable es LIBRAINMO_DATABASE_URL (no DATABASE_URL).
URL_BASE=$(docker exec "$CONTENEDOR" printenv LIBRAINMO_DATABASE_URL 2>/dev/null || true)
if [ -z "$URL_BASE" ]; then
  log "ABORTA: no pude leer LIBRAINMO_DATABASE_URL del contenedor."
  exit 8
fi
case "$URL_BASE" in
  postgres://*|postgresql://*|postgresql+*://*) ;;
  *) log "ABORTA: LIBRAINMO_DATABASE_URL no es PostgreSQL. Este reset no aplica."; exit 8 ;;
esac

# El sidecar: su nombre es el host de la URL, que en esta red es la clave del servicio y también el `container_name`.
SIDECAR=${URL_BASE#*@}
SIDECAR=${SIDECAR%%:*}
SIDECAR=${SIDECAR%%/*}
if ! docker ps --format '{{.Names}}' | grep -qx "$SIDECAR"; then
  log "ABORTA: el sidecar '$SIDECAR' no está corriendo."
  exit 9
fi
log "motor: PostgreSQL (sidecar $SIDECAR)"

# Cuántas filas hay en tres tablas del dominio [LIBRAINMO] (propiedades, contratos y cobros). Es la única forma de que este
# script pueda DECIR que reseteó: se mide antes y después, y si después no dio cero, se aborta sin sembrar. Un reset que no
# resetea y siembra igual deja la demo con los datos de ayer más los de hoy, y no avisa nunca.
filas_del_dominio() {
  docker exec "$SIDECAR" sh -c '
    psql -tA -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
      SELECT COALESCE((SELECT COUNT(*) FROM propiedades), 0)
           + COALESCE((SELECT COUNT(*) FROM contratos), 0)
           + COALESCE((SELECT COUNT(*) FROM cobros), 0)"
  ' 2>/dev/null || echo "?"
}

ANTES=$(filas_del_dominio)
log "filas del dominio antes del reset: $ANTES"

# --- 1b. Los códigos de acceso, que SÍ sobreviven al reset -----------------
# 🔴 En este producto `usuarios` --y con él las tablas satélite de libraauth, entre ellas `demo_codigos`-- vive en la MISMA
# base que el dominio. O sea que el `DROP SCHEMA` de abajo **se lleva los códigos emitidos**.
#
# Sin este paso, un código emitido a un cliente potencial --que el sistema declara válido por 7 días y 10 usos-- dejaría de
# servir en el reset de esa misma noche, sin que nadie lo haya revocado.
CODIGOS_DUMP=/tmp/demo-codigos-$CONTENEDOR.sql
rm -f "$CODIGOS_DUMP"
if docker exec "$SIDECAR" sh -c '
     psql -tA -U "$POSTGRES_USER" -d "$POSTGRES_DB"        -c "SELECT 1 FROM information_schema.tables WHERE table_name = '"'"'demo_codigos'"'"'"
   ' 2>/dev/null | grep -q 1; then
  docker exec "$SIDECAR" sh -c '
    pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --data-only --table=demo_codigos
  ' > "$CODIGOS_DUMP" 2>/dev/null || true
  VIVOS=$(docker exec "$SIDECAR" sh -c '
    psql -tA -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT COUNT(*) FROM demo_codigos"
  ' 2>/dev/null || echo 0)
  log "códigos de acceso a preservar: ${VIVOS:-0}"
else
  log "todavía no existe demo_codigos: nada que preservar"
fi

# --- 2. Base de cero ------------------------------------------------------
# Se para la app ANTES de tocar el schema. Con el contenedor arriba, sus conexiones abiertas dejan el `DROP SCHEMA`
# esperando un lock: no falla, se cuelga -- ya pasó, veinte minutos en silencio.
docker stop "$CONTENEDOR" >/dev/null
log "app parada para soltar las conexiones"

# `psql` se corre DENTRO del sidecar y con las variables de su propio entorno: así la contraseña no pasa por la línea de
# comandos del host, donde quedaría en el `ps` y en el log del cron.
docker exec "$SIDECAR" sh -c '
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -c "DROP SCHEMA IF EXISTS public CASCADE" \
    -c "CREATE SCHEMA public" \
    -c "GRANT ALL ON SCHEMA public TO \"$POSTGRES_USER\""
' >/dev/null || { log "ABORTA: no se pudo recrear el schema."; docker start "$CONTENEDOR" >/dev/null; exit 10; }
log "schema recreado, vacío"

# --- 3. Las migraciones, con la app parada --------------------------------
# 🔴 **El arranque NO las corre**: desde el 2026-09-17 no crea las tablas de auth (`exigir_schema_al_dia`) y exige las del
# motor y las del dominio, así que sin este paso la demo no levantaría. Corren con la app PARADA y en un contenedor efímero,
# igual que el deploy. Las cadenas ya se leyeron en el paso 0.
while IFS= read -r cmd; do
  [ -z "$cmd" ] && continue
  log "migraciones: $cmd"
  # `-T` y `</dev/null`: sin ellos `compose run` abre una TTY y se come el resto del heredoc que alimenta este `while`
  # (medido en el reset de Contalibra).
  # $cmd se splitea en argumentos a propósito.
  # shellcheck disable=SC2086
  docker compose -p "$CONTENEDOR" -f "$COMPOSE" run --rm -T "$CONTENEDOR" $cmd >/dev/null 2>&1 </dev/null \
    || { log "ABORTA: falló \`$cmd\`."; docker start "$CONTENEDOR" >/dev/null; exit 12; }
done <<CADENAS_EOF
$CADENAS
CADENAS_EOF
TABLAS=$(docker exec "$SIDECAR" sh -c '
  psql -tA -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '"'"'public'"'"'"' 2>/dev/null || echo 0)
log "migraciones aplicadas: $TABLAS tablas"
if [ "${TABLAS:-0}" -lt 10 ]; then
  log "ABORTA: quedaron $TABLAS tablas, esperaba al menos 10."
  exit 12
fi

# El usuario del visitante y el admin los siembra la app AL ARRANCAR, y este es el primer arranque después de migrar: por
# eso la app arranca recién acá.
docker start "$CONTENEDOR" >/dev/null
for _ in $(seq 1 40); do
  estado=$(docker inspect -f '{{.State.Health.Status}}' "$CONTENEDOR" 2>/dev/null || echo starting)
  [ "$estado" = "healthy" ] && break
  sleep 3
done
estado=$(docker inspect -f '{{.State.Health.Status}}' "$CONTENEDOR" 2>/dev/null || echo desconocido)
log "contenedor: $estado"
if [ "$estado" != "healthy" ]; then
  log "ABORTA: no levantó sano; no se siembra sobre una instancia rota."
  exit 4
fi

# --- 4. Que de verdad haya reseteado --------------------------------------
# La post-condición. Sin esto el script dice "listo" igual cuando no borró nada, que es exactamente como se rompe un reset
# al cambiar de motor: el paso de borrado deja de aplicar, nadie lo nota, y el seed se apila todas las noches.
DESPUES=$(filas_del_dominio)
log "filas del dominio después del reset: $DESPUES"
if [ "$DESPUES" = "?" ]; then
  log "ABORTA: no pude contar las filas -- puede que una tabla haya cambiado"
  log "        de nombre. Sin poder medir, no se siembra."
  exit 11
fi
if [ "$DESPUES" != "0" ]; then
  log "ABORTA: la base no quedó vacía (antes $ANTES, después $DESPUES)."
  log "        No se siembra encima: quedaría la demo de ayer más la de hoy."
  exit 11
fi
if [ "$ANTES" = "0" ]; then
  log "OJO: antes también había 0 filas -- el chequeo no probó nada esta vez."
fi

# --- 4b. Devolver los códigos de acceso -----------------------------------
# Ver el 🔴 del paso 1b. La tabla ya existe: la crea la cadena de `libraauth` en el paso 3.
if [ -s "$CODIGOS_DUMP" ]; then
  if docker exec -i "$SIDECAR" sh -c '
       psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"
     ' < "$CODIGOS_DUMP" >/dev/null 2>&1; then
    DEVUELTOS=$(docker exec "$SIDECAR" sh -c '
      psql -tA -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT COUNT(*) FROM demo_codigos"
    ' 2>/dev/null || echo 0)
    log "códigos de acceso devueltos: ${DEVUELTOS:-0}"
  else
    # No aborta: la demo ya quedó usable y sin códigos se puede emitir otro. Pero se dice fuerte, porque el síntoma sería
    # "a nadie le anda el código".
    log "OJO: no se pudieron devolver los códigos de acceso. Hay que emitir uno nuevo."
  fi
  rm -f "$CODIGOS_DUMP"
fi

# --- 5. Sembrar -----------------------------------------------------------
# [LIBRAINMO] Adentro del contenedor y por los servicios del dominio, no por la API: no hay login, ni captcha, ni contraseña
# que pasar. `python3` acá es el de la IMAGEN (el Dockerfile pone `/opt/venv/bin` primero en el PATH y `docker exec` lo
# hereda), con el entorno del propio contenedor: la URL de la base no pasa por la línea de comandos del host. `-w /app`
# porque `scripts` es un paquete del directorio de trabajo de la imagen, no del venv.
docker exec -w /app "$CONTENEDOR" python3 -m scripts.semilla_demo \
  || { log "ABORTA: falló la semilla."; exit 14; }

# La semilla es idempotente por vacío: si "no sembró" porque ya había propiedades, el paso 4 habría abortado antes. Que
# después de correr haya filas es lo que dice que sembró de verdad y no que terminó sin hacer nada.
SEMBRADAS=$(filas_del_dominio)
log "filas del dominio después de sembrar: $SEMBRADAS"
if [ "$SEMBRADAS" = "?" ] || [ "$SEMBRADAS" = "0" ]; then
  log "ABORTA: la semilla terminó pero la base sigue vacía."
  exit 14
fi

# --- 6. Y que la demo siga siendo una demo --------------------------------
# El último control: que el visitante pueda entrar. Todo lo de arriba puede haber salido bien y aun así haber dejado la
# instancia sin el usuario de la demo, que es el modo de falla más silencioso de este script.
if docker exec "$CONTENEDOR" python3 -c "
import json, urllib.request
r = urllib.request.urlopen('http://localhost:8000/auth/demo', timeout=5)
d = json.load(r)
raise SystemExit(0 if d.get('enabled') and d.get('username') else 1)
" 2>/dev/null; then
  log "la demo se sigue anunciando como tal"
else
  log "ABORTA: GET /auth/demo no devolvió una demo válida."
  exit 13
fi

log "=== listo ==="
