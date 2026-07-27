# Changelog

## v1.3 — Login multiusuario

Hasta v1.2, Bookshelf era de un solo usuario compartido: sin login, cualquiera con acceso a la red veía y borraba todo. v1.3 agrega cuentas por usuario manteniendo el proyecto simple (pensado para redes privadas, no para exponerse a internet).

### Agregado
- **Login con usuario y contraseña**, sesión de Flask con cookie firmada; `SECRET_KEY` se genera una vez y se persiste en `data/secret_key` (un reinicio del contenedor ya no desloguea a todos).
- **Biblioteca aislada por usuario**: cada usuario tiene sus propios libros, colecciones, progreso, bookmarks y highlights. Se agregó `user_id` a `collections` y `books`, y todas las rutas de la API filtran por el usuario en sesión — incluida la descarga de archivos y portadas, que antes no validaban dueño.
- **Archivos separados por usuario en disco**: `uploads/<user_id>/` y `data/covers/<user_id>/`, en vez de carpetas compartidas.
- **Cuenta de administrador** (`/admin`), sin biblioteca propia: solo gestiona usuarios (crear, borrar, cambiar contraseña). Al loguearse como admin se entra directo al panel, nunca a una biblioteca.
- **CLI `manage.py` + wrapper `manage.sh`** para crear/listar/borrar usuarios y resetear contraseñas sin pasar por la web (`./manage.sh create-user`, `list-users`, `delete-user`, `reset-password`).
- **Bootstrap distinto según el caso, automático y de una sola vez**: en una instalación nueva (sin datos previos) solo se crea `admin`/`admin123`. Si en cambio se detectan libros o colecciones de una versión anterior sin login, además se crea `usuario`/`cambiar123` y se le reasignan todos (respetando sus nombres, incluso si había varias colecciones además de "Sin coleccion").
- Animaciones: despliegue suave del formulario de "cambiar contraseña" en el panel, y fade-out al cerrar sesión.
- `deploy_to_server.sh` y `deploy_server/` — herramientas para actualizar un servidor que ya corría una versión sin login sin tocar los datos reales.

### Corregido
- El selector de colección al subir un libro ya no queda seleccionado en la primera opción alfabética por default: ahora exige elegir una colección explícitamente antes de permitir la subida.
- `docker-compose.yml` no tenía sección `build:` (el flag `--build` no hacía nada) y usaba volúmenes con nombre que no coincidían con las carpetas `data/`/`uploads/` reales — corregido para instalaciones nuevas (bind mount a `./data` y `./uploads`).

### Confirmado (ya funcionaba, sin cambios)
- La subida de múltiples archivos a la vez hacia la misma colección ya estaba soportada (selección múltiple + drag & drop), verificado con una prueba automatizada de navegador.
- El resto de la biblioteca (lector, subida, colecciones, progreso, bookmarks, highlights, PWA) no se tocó: mismo comportamiento de siempre, ahora con el filtro de usuario por encima.

### Seguridad
- Contraseñas con hash (`werkzeug.security`, PBKDF2), nunca en texto plano — ni siquiera el admin puede verlas, solo resetearlas.
- Sin límite de intentos de login ni 2FA, a propósito: este proyecto es para redes privadas, no para exponerse a internet.
