#!/usr/bin/env bash
# Levanta Bookshelf en Docker desde un clon recien hecho, o lo actualiza.
#
#   ./setup.sh                 instala y levanta en el puerto 8090
#   ./setup.sh --port 9000     en otro puerto (queda guardado para la proxima)
#   ./setup.sh --update        git pull + reconstruir (los datos no se tocan)
#
# Funciona en Linux, macOS y Windows (desde WSL o Git Bash, con Docker Desktop).
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\033[1;35m>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mx\033[0m %s\n' "$*" >&2; exit 1; }

PORT="" UPDATE=0
while [ $# -gt 0 ]; do
  case "$1" in
    -p|--port) PORT="${2:-}"; shift 2 ;;
    -u|--update) UPDATE=1; shift ;;
    -h|--help) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Opcion desconocida: $1 (ver ./setup.sh --help)" ;;
  esac
done

# ── 1. Docker y Compose ─────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || die "Falta Docker: https://docs.docker.com/get-docker/"
docker info >/dev/null 2>&1 || die "Docker no responde: ¿esta corriendo? En Linux, ¿tu usuario esta en el grupo docker?"
if docker compose version >/dev/null 2>&1; then DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then DC="docker-compose"
else die "Falta Docker Compose (el plugin 'docker compose' o el binario 'docker-compose')."; fi

# ── 2. Puerto y usuario del contenedor (.env) ───────────────────────────────
# docker compose lee .env solo: asi un "docker compose up -d" a mano usa lo
# mismo. El contenedor corre con tu usuario, no como root, para que los
# archivos de data/ y uploads/ sean tuyos (y puedas dejar libros a mano).
# BOOKSHELF_CONTAINER (nombre del contenedor) se puede pasar por entorno si ya
# tenes otro que se llama bookshelf.
ENV_CONTAINER="${BOOKSHELF_CONTAINER:-}"
ENV_BIND="${BOOKSHELF_BIND:-}"
BOOKSHELF_PORT="" BOOKSHELF_UID="" BOOKSHELF_GID="" BOOKSHELF_CONTAINER="" BOOKSHELF_BIND=""
[ -f .env ] && . ./.env
CONTAINER="${ENV_CONTAINER:-${BOOKSHELF_CONTAINER:-bookshelf}}"
# BOOKSHELF_BIND=127.0.0.1: solo desde la misma maquina (ver docker-compose.yml).
BIND="${ENV_BIND:-${BOOKSHELF_BIND:-0.0.0.0}}"
PORT="${PORT:-${BOOKSHELF_PORT:-8090}}"
case "$PORT" in ''|*[!0-9]*) die "Puerto invalido: $PORT" ;; esac
CUID="${BOOKSHELF_UID:-$(id -u)}" CGID="${BOOKSHELF_GID:-$(id -g)}"
cat > .env <<EOF
# Lo escribe setup.sh; docker compose lo lee solo.
BOOKSHELF_PORT=$PORT
BOOKSHELF_UID=$CUID
BOOKSHELF_GID=$CGID
BOOKSHELF_CONTAINER=$CONTAINER
BOOKSHELF_BIND=$BIND
EOF
# Lo del entorno le gana a .env en compose: que digan lo mismo.
export BOOKSHELF_PORT="$PORT" BOOKSHELF_UID="$CUID" BOOKSHELF_GID="$CGID" BOOKSHELF_CONTAINER="$CONTAINER" BOOKSHELF_BIND="$BIND"

# ── 3. Carpetas de datos ────────────────────────────────────────────────────
# Si las creara Docker serian de root y la app no podria escribir en ellas.
mkdir -p data uploads
[ -w data ] && [ -w uploads ] || die "data/ o uploads/ no son tuyas. Arreglalo con: sudo chown -R $CUID:$CGID data uploads"
PRIMERA=0; [ -f data/bookshelf.db ] || PRIMERA=1

# ── 4. Actualizar ───────────────────────────────────────────────────────────
if [ "$UPDATE" = 1 ]; then
  say "Bajando la ultima version..."
  git pull --ff-only
fi

# ── 5. Construir y levantar ─────────────────────────────────────────────────
say "Construyendo y levantando (la primera vez tarda unos minutos)..."
# Con Docker viejo, recrear el contenedor a veces choca con el nombre del
# anterior: la imagen ya quedo construida y alcanza con levantarlo de nuevo.
$DC up -d --build || { sleep 2; $DC up -d; } ||
  die "No se pudo levantar. Si dice que el nombre $CONTAINER ya esta en uso, tenes otro contenedor con ese nombre: borralo (docker rm $CONTAINER) o usa otro (BOOKSHELF_CONTAINER=otro_nombre ./setup.sh)."

# ── 6. Esperar a que responda ───────────────────────────────────────────────
say "Esperando a que responda en el puerto $PORT..."
OK=0
for _ in $(seq 1 60); do
  if command -v curl >/dev/null 2>&1; then
    curl -fsS -o /dev/null "http://127.0.0.1:$PORT/login" 2>/dev/null && { OK=1; break; }
  elif [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" = "true" ] && [ -f data/bookshelf.db ]; then
    OK=1; break
  fi
  sleep 2
done
[ "$OK" = 1 ] || die "No respondio a tiempo. Mira que paso con: docker logs $CONTAINER"

# ── 7. Primera vez: contraseña del admin al azar (no admin123) ──────────────
PW=""
if [ "$PRIMERA" = 1 ]; then
  PW=$(head -c 512 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' | head -c 16 || true)
  docker exec "$CONTAINER" python manage.py reset-password admin "$PW" >/dev/null
fi

# ── Listo ───────────────────────────────────────────────────────────────────
IP=$( (hostname -I 2>/dev/null || ipconfig getifaddr en0 2>/dev/null || true) | awk '{print $1}')
echo
say "Bookshelf esta andando."
echo "    En esta maquina:  http://localhost:$PORT"
[ -n "$IP" ] && [ "$BIND" = "0.0.0.0" ] && echo "    En tu red:        http://$IP:$PORT"
if [ -n "$PW" ]; then
  echo
  echo "    Administrador:    admin / $PW"
  echo "    (guardala: no se vuelve a mostrar; se cambia con ./manage.sh reset-password admin)"
  echo
  echo "    Entra a http://localhost:$PORT/admin y crea tu usuario, o:"
  echo "    ./manage.sh create-user tu_nombre tu_clave"
fi
