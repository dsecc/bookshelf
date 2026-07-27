# Changelog

## v1.4 — Envío de libros entre usuarios

Un usuario puede enviarle un libro a otro sin salir del aislamiento: aparece como notificación (campana con contador en el topbar), se abre un visor centrado con la portada y se puede aceptar, eligiendo o creando una colección.

### Agregado
- Botón "Enviar a otro usuario" en el panel de info del lector, junto a "Compartir por WhatsApp".
- Campana de notificaciones con contador de no vistas en el topbar de la biblioteca; al abrir una notificación se ve la portada, el título y quién lo envió, con opción de aceptar eligiendo o creando una colección.
- Nueva tabla `book_shares` y rutas `GET /api/users`, `POST /api/books/<id>/share`, `GET /api/notifications`, `POST /api/notifications/<id>/accept|seen`.
- El archivo (y la portada) recién se copian a la biblioteca del destinatario al aceptar, no al enviar — nada se duplica en disco si nunca se acepta.
- Cerrar la notificación sin aceptar solo la marca como "vista" (deja de contar como nueva) — sigue pudiéndose aceptar después, no es un rechazo. Toda notificación (vista o no, aceptada o no) dura 7 días desde que se recibió y después se borra sola.
- `GET /api/users` es la única grieta intencional en el aislamiento total: expone únicamente nombres de usuario (nada de libros, colecciones ni actividad), necesaria para poder elegir destinatario.

### Corregido / cubierto
- La portada no se veía al revisar una notificación: la ruta de portada validaba dueño del libro contra el destinatario, que todavía no lo es hasta aceptar. Ahora hay una ruta dedicada que valida contra la notificación.
- Si el que envía borra el libro mientras el envío sigue pendiente, la notificación pendiente correspondiente se borra sola (no queda apuntando a algo inexistente).
- Si el libro desaparece justo entre el envío y el aceptar, se marca como "ya no disponible" en vez de romper.
- Borrar un usuario desde `/admin` también limpia sus notificaciones enviadas y recibidas.
- No se puede enviar un libro a uno mismo ni a la cuenta admin; un envío duplicado pendiente al mismo destinatario no se repite.

## v1.3 — Login multiusuario

Primera versión pública. Cada usuario tiene su propia biblioteca (libros, colecciones, progreso, bookmarks, highlights), completamente aislada de la de los demás, manteniendo el proyecto simple (pensado para redes privadas, no para exponerse a internet).

### Agregado
- **Login con usuario y contraseña**, sesión de Flask con cookie firmada; `SECRET_KEY` se genera una vez y se persiste en `data/secret_key` (un reinicio del contenedor ya no desloguea a todos).
- **Biblioteca aislada por usuario**: cada usuario tiene sus propios libros, colecciones, progreso, bookmarks y highlights. Cada tabla relevante tiene `user_id`, y todas las rutas de la API filtran por el usuario en sesión — incluida la descarga de archivos y portadas.
- **Archivos separados por usuario en disco**: `uploads/<user_id>/` y `data/covers/<user_id>/`.
- **Cuenta de administrador** (`/admin`), sin biblioteca propia: solo gestiona usuarios (crear, borrar, cambiar contraseña). Al loguearse como admin se entra directo al panel, nunca a una biblioteca.
- **CLI `manage.py` + wrapper `manage.sh`** para crear/listar/borrar usuarios y resetear contraseñas sin pasar por la web (`./manage.sh create-user`, `list-users`, `delete-user`, `reset-password`).
- En el primer arranque se crea automáticamente `admin` / `admin123` — el resto de las cuentas se crean desde `/admin` o `manage.sh`.
- Animaciones: despliegue suave del formulario de "cambiar contraseña" en el panel, y fade-out al cerrar sesión.

### Corregido
- El selector de colección al subir un libro ya no queda seleccionado en la primera opción alfabética por default: ahora exige elegir una colección explícitamente antes de permitir la subida.
- `docker-compose.yml` no tenía sección `build:` (el flag `--build` no hacía nada) y usaba volúmenes con nombre en vez de bind mount a `./data`/`./uploads` — corregido.
- `.dockerignore` agregado: sin él, cada rebuild reenviaba toda la biblioteca (`data/`, `uploads/`) como contexto de build.

### Confirmado (ya funcionaba, sin cambios)
- La subida de múltiples archivos a la vez hacia la misma colección ya estaba soportada (selección múltiple + drag & drop).
- El resto de la biblioteca (lector, subida, colecciones, progreso, bookmarks, highlights, PWA) no se tocó: mismo comportamiento de siempre, ahora con el filtro de usuario por encima.

### Seguridad
- Contraseñas con hash (`werkzeug.security`, PBKDF2), nunca en texto plano — ni siquiera el admin puede verlas, solo resetearlas.
- Sin límite de intentos de login ni 2FA, a propósito: este proyecto es para redes privadas, no para exponerse a internet.
