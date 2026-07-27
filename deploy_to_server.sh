#!/usr/bin/env bash
# Lleva el codigo nuevo (con login multiusuario) a un servidor que ya tiene
# la version vieja de Bookshelf corriendo con libros reales.
#
# No toca data/ ni uploads/ en el servidor: solo actualiza el codigo. La
# migracion (crear admin + santino, pasarles los libros/colecciones
# existentes, mover los archivos a carpetas por usuario) la hace app.py
# automaticamente la primera vez que arranca el contenedor nuevo.
#
# Uso:
#   ./deploy_to_server.sh usuario@servidor ~/bookshelf
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Uso: $0 usuario@servidor ruta/remota/bookshelf" >&2
  exit 1
fi

REMOTE="$1"
REMOTE_PATH="$2"

echo "== 1/3: backup remoto de data/ y uploads/ (por las dudas) =="
ssh "$REMOTE" "cd '$REMOTE_PATH' && ts=\$(date +%Y%m%d_%H%M%S) && cp -r data data.bak.\$ts && cp -r uploads uploads.bak.\$ts && echo Backup listo en data.bak.\$ts y uploads.bak.\$ts"

echo "== 2/3: copiar codigo nuevo, sin tocar data/ ni uploads/ =="
rsync -av --exclude 'data/' --exclude 'uploads/' --exclude '__pycache__/' --exclude '*.bak.*' \
  ./ "$REMOTE:$REMOTE_PATH/"

echo "== 3/3: reconstruir y relanzar en el servidor =="
ssh "$REMOTE" "cd '$REMOTE_PATH' && docker compose down && docker compose up -d --build && sleep 3 && docker compose logs --tail=30"

cat <<EOF

Listo. Verifica en http://<IP-DEL-SERVIDOR>:8090/login:
  - santino / banana  -> debe ver todos los libros y colecciones de siempre
  - admin   / admin123 -> debe entrar al panel de administracion

Despues cambia AMBAS contraseñas por defecto:
  ssh $REMOTE "cd $REMOTE_PATH && ./manage.sh reset-password santino <clave-real>"
  ssh $REMOTE "cd $REMOTE_PATH && ./manage.sh reset-password admin <otra-clave>"
EOF
