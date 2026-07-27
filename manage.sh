#!/usr/bin/env bash
# Wrapper para administrar usuarios de Bookshelf sin pasar por la web.
# Uso:
#   ./manage.sh create-user tino claveSegura123
#   ./manage.sh create-user otro_admin --admin
#   ./manage.sh list-users
#   ./manage.sh delete-user tino
#   ./manage.sh reset-password tino nuevaClave
set -euo pipefail

CONTAINER="${BOOKSHELF_CONTAINER:-bookshelf}"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "El contenedor '$CONTAINER' no esta corriendo (docker compose up -d)." >&2
  exit 1
fi

docker exec -it "$CONTAINER" python manage.py "$@"
