# Changelog

## v1.5 — Lectura sin conexión y pantalla completa real en mobile

### Agregado
- **Guardar libros para leer sin conexión**: botón "Guardar sin conexión" en el panel de info del lector. Descarga ese libro (y su portada) al dispositivo; el resto de la biblioteca **no** se baja sola, así no se llena el teléfono sin querer. Se puede quitar con el mismo botón.
- **Sección "Sin conexión"** en la biblioteca (sidebar en desktop, hoja de colecciones en mobile) que lista solo los libros guardados, más un indicador en la portada de cada libro disponible offline.
- **Service worker de verdad**: cachea el app shell (CSS, JS, íconos) y los datos de la biblioteca, así la app abre y se navega sin conexión. Antes el `sw.js` era un *kill-switch* que borraba todos los caches y se desregistraba a sí mismo: la capacidad offline era cero.
- `navigator.storage.persist()` al guardar el primer libro, para que iOS no evicte lo guardado.

### Corregido
- **El lector dependía de tres CDNs externos** (pdf.js, page-flip, epub.js): sin internet no abría ni un PDF, y en un servidor privado sin salida a la red tampoco. Ahora las librerías se sirven localmente desde `static/js/vendor/`. De paso, el `workerSrc` de pdf.js apuntaba al CDN aunque ya existía una copia local sin usar.
- **El CDN de epub.js devolvía 404**, así que la lectura de EPUB estaba rota desde antes. Se vendorizó la versión correcta (+ JSZip, que epub.js necesita).
- **El service worker nunca podía controlar la app**: un SW solo alcanza la carpeta donde vive el script, y estaba en `/static/js/`. Ahora se sirve desde `/sw.js`.
- **Pantalla completa en iPhone**: faltaba `viewport-fit=cover` (iOS reservaba las safe areas y el contenido nunca llegaba al borde) y las meta tags de PWA en el lector. En fullscreen mobile la hoja ahora ocupa el 100% del ancho, sin padding ni sombras, y pasa por debajo de la hora/batería como en los PDF nativos. Nota: `requestFullscreen()` no existe en Safari iOS, así que esto solo se logra con la app instalada en la pantalla de inicio.
- **El ancho de la hoja se descontaba dos veces** (32px en el cálculo del contenedor y otros 32px dentro del render), dejando la página más chica de lo necesario en pantallas pequeñas.
- **Las páginas no se re-escalaban** al rotar el teléfono o entrar/salir de fullscreen: el ancho disponible se calculaba una sola vez al abrir el libro.
- **Sin conexión, la biblioteca quedaba sin ningún botón funcional**: si las llamadas a la API fallaban, el init cortaba antes de enganchar los handlers. Ahora cada fetch resuelve con lo que haya cacheado.
- Abrir un libro no guardado sin conexión mostraba una pantalla en blanco; ahora avisa y ofrece volver a la biblioteca.

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
- **Modo scroll del lector, varios bugs que lo dejaban inutilizable**:
  - Renderizaba el PDF completo (todas las páginas) al abrir, en vez de solo lo cercano a la pantalla — en libros largos esto saturaba memoria/CPU y congelaba la interfaz. Ahora se renderiza de a poco, con margen, a medida que se scrollea.
  - Al texto seleccionable del PDF le faltaba la variable CSS `--scale-factor` que pdf.js necesita para posicionarlo — sin ella, terminaba tapando la topbar y bloqueando todos sus clics.
  - En pantallas anchas, la página se escalaba para llenar todo el ancho de la ventana sin límite, quedando gigante y con scroll excesivo por página. Ahora se acota a un ancho de lectura razonable.
  - Abrir un libro scrolleaba la ventana del navegador entera (no solo el visor interno), tapando la topbar arriba del viewport hasta hacer zoom o resize. Se reemplazó `scrollIntoView` por scroll directo del contenedor correcto.
  - Se le dio prioridad de superposición explícita a la topbar y las barras de controles del lector, para que el contenido del PDF nunca vuelva a robarles los clics.

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
