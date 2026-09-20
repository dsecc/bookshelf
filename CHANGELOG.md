# Changelog

## v1.5.6 — El modo scroll del lector usa el documento como scroller

### Corregido
- **La franja del fondo al pie del libro en iOS.** En una PWA standalone, iOS le da a la webview un viewport mas corto que la pantalla fisica (medido en un iPhone 12 mini: 762px contra 812px) y **recorta el pintado de cualquier contenedor con overflow propio a ese viewport**. Los ultimos ~50px de pantalla quedaban fuera del alcance del contenedor de scroll y mostraban el fondo del body. Se intentaron tres arreglos que no podian funcionar, porque todos operaban dentro de esa caja: `bottom: 0`, `position: fixed; inset: 0`, y extender el elemento por debajo del viewport con un `bottom` negativo (`--ios-gap`) — este ultimo llego a calcular bien los 50px y aun asi no se vio, lo que confirmo el recorte.

  El scroller **raiz** no tiene esa limitacion: se pinta de borde a borde. Asi que en mobile el modo scroll deja de usar un `div` con `overflow-y: auto` y pasa a scrollear el documento, que es como lo resuelve asmodeloscentral (`html, body { height: 100% }` con el fondo en la raiz, que se propaga al canvas y cubre toda la webview).

  El cambio va scopeado bajo la clase `doc-scroll`, que `reader.js` pone solo en mobile y solo en modo scroll: los modos pagina y EPUB siguen con el shell de alto fijo, y en desktop no cambia nada. La logica de scroll quedo detras de una pequena abstraccion (`S`) que resuelve contra el documento o contra el contenedor segun corresponda, para no duplicar los observers ni el manejo de `scrollTop`.
- Se saco `user-scalable=no` del viewport del lector. Ademas de no usarse en la app de referencia, impedia hacer zoom en un lector de PDF.

### Notas
- `--ios-gap` y su medicion en `reader.js` se eliminaron: eran un parche para el enfoque anterior.
- `VERSION` del service worker: `v7` → `v8`.
- Verificado con navegador real en los dos anchos: en mobile scrollea el documento (3335px de contenido contra 844px de viewport) y en desktop sigue scrolleando el contenedor (7766px contra 810px), con las paginas renderizando y el contador avanzando en ambos. El modo sin conexion se reproba completo, sin regresiones.
- Lo que **no** se puede verificar desde una computadora: `env(safe-area-inset-*)` vale 0 en el navegador de escritorio y el viewport recortado de iOS no se reproduce. Se calibra en un telefono real — la misma advertencia que deja anotada asmodeloscentral.

## v1.5.5 — Safe areas de iOS y el requisito de HTTPS para el modo offline

### Corregido
- **La barra inferior de la biblioteca quedaba aplastada contra el borde de arriba.** `.bottom-nav` declaraba `height: 64px` con `padding-bottom: env(safe-area-inset-bottom)` adentro; como el proyecto usa `box-sizing: border-box`, en un iPhone la zona útil pasaba de 64px a 30px y los iconos con sus labels no entraban (el activo, que escala a 1.15, directamente se desbordaba). Lo rompió v1.5 al agregar `viewport-fit=cover`: hasta entonces `env(safe-area-inset-bottom)` valía 0 y el problema no se veía. Ahora la safe area se suma en vez de descontarse, y el `padding-bottom` del `.content` la acompaña para que la barra no tape la última fila de libros.
- **La topbar del lector tenía el mismo bug** (`height: 52px` con la safe area del notch adentro): pintaba una banda opaca sobre el libro y al ocultarse en pantalla completa se iba solo a medias, porque se trasladaba 52px cuando su alto visual era mayor.
- **Al ocultar la topbar quedaba una franja del fondo al pie del libro.** `_hideTopbar` le aplicaba `margin-top: -52px` al viewer "para llenar el hueco", pero en mobile la topbar es `position: fixed` y nunca ocupó espacio en el flujo: el margen solo subía el contenido y destapaba esa misma cantidad de píxeles abajo.
- **`reader.css` tenía una llave de cierre de más**, que dejaba el archivo desbalanceado.
- **Compensación del viewport recortado de iOS.** En una PWA instalada con `apple-mobile-web-app-status-bar-style: black-translucent`, iOS estira la webview hasta cubrir la pantalla pero reporta en `window.innerHeight` la altura *sin* la franja del status bar (medido en un iPhone 12 mini: pantalla 812px, viewport 762px). Esa diferencia aparece como una banda del fondo del body que ninguna regla de CSS puede tapar, porque `bottom: 0` obedece a un viewport que ya viene corto. `reader.js` mide la diferencia real contra la pantalla y la publica como `--ios-gap`; el viewer se extiende esos píxeles. Acotado a 120px, solo activo en modo standalone y recalculado al rotar. Nota: el disparador real de ese desajuste suele ser que iOS cachea la configuración de la web app al momento de agregarla a la pantalla de inicio — reinstalar el ícono después de cambiar las meta tags es parte del arreglo.

### Documentado
- **El modo sin conexión necesita HTTPS, y sin eso no funciona nada.** Los navegadores solo habilitan service workers en contextos seguros: entrando por `http://IP:8090`, `navigator.serviceWorker` ni siquiera existe, no se cachea nada, la app no abre sin internet y el botón "Guardar sin conexión" se oculta solo (el código lo esconde cuando no hay `caches`). La capacidad offline que anunciaba v1.5 era, en la práctica, inalcanzable en una instalación servida por HTTP plano. El README ahora explica el requisito y documenta cómo resolverlo con `tailscale serve`, que da un certificado de Let's Encrypt sin exponer el servidor a internet.
- El README detalla además cómo se guarda cada cosa: los tres caches, por qué el de los libros no lleva versión (sobreviven las actualizaciones) y el uso de `navigator.storage.persist()`.

### Despliegue
- **El servidor pasa a ser un clon del repo.** Antes se construía la imagen en la máquina de desarrollo, se empaquetaba con `docker save | gzip` (214MB) y se copiaba por `scp` a cada actualización. Ahora se actualiza con `git pull && docker-compose up -d --build` en el propio servidor. Como el repo es público, no necesita credenciales de git.
- **Los datos pasan de volúmenes con nombre a bind mounts** dentro del checkout (`./data`, `./uploads`), que es lo que ya declaraba el `docker-compose.yml` del repo. Hasta ahora el servidor corría con un compose propio que apuntaba a `bookshelf-v12_*`, así que el compose versionado y el real no coincidían — un `git pull` seguido de `up` habría arrancado con la biblioteca vacía. El README documenta la migración.

### Notas de despliegue
- `VERSION` del service worker: `v1` → `v7`. Los archivos del shell se sirven cache-first, así que sin subirla los dispositivos que ya visitaron la app se quedarían con las versiones viejas para siempre; además el navegador solo detecta un service worker nuevo si el archivo cambió. `BOOKS_CACHE` sigue sin versión a propósito: los libros guardados no se borran.

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
