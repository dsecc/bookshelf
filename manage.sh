#!/usr/bin/env bash
# Wrapper para administrar usuarios de Bookshelf sin pasar por la web.
# Uso:
#   ./manage.sh create-user tino claveSegura123
#   ./manage.sh create-user otro_admin --admin
#   ./manage.sh list-users
#   ./manage.sh delete-user tino
#   ./manage.sh reset-password tino nuevaClave
set -euo pipefail

# El nombre del contenedor puede venir de .env (lo escribe setup.sh).
[ -f "$(dirname "$0")/.env" ] && . "$(dirname "$0")/.env"
CONTAINER="${BOOKSHELF_CONTAINER:-bookshelf}"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "El contenedor '$CONTAINER' no esta corriendo (./setup.sh lo levanta)." >&2
  exit 1
fi

# -t solo con una terminal de verdad (desde un script o un cron no la hay).
if [ -t 0 ]; then docker exec -it "$CONTAINER" python manage.py "$@"; else docker exec -i "$CONTAINER" python manage.py "$@"; fi
