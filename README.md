# 📚 Bookshelf

**v1.5.5** — ver [CHANGELOG.md](CHANGELOG.md) para el historial de versiones.

Tu biblioteca personal self-hosted. Drag & drop de libros, lector integrado, bookmarks y progreso sincronizado, con soporte multiusuario.

> ⚠️ **Este proyecto está pensado para correr en una red privada (LAN / VPN / servidor casero), no para exponerse directamente a internet.** El login es intencionalmente simple (usuario + contraseña, sin límite de intentos, sin 2FA) para mantener el proyecto liviano. Si igual querés exponerlo a internet, ponelo detrás de un proxy con HTTPS y considerá capas de seguridad adicionales (esto no viene "blindado" para ese escenario).

## Instalación

```bash
git clone https://github.com/dsecc/bookshelf.git
cd bookshelf
docker compose up -d --build
```

Abrí `http://localhost:8090` (o `http://IP-DEL-SERVIDOR:8090` si es un servidor remoto) y entrá con `admin` / `admin123`. `data/` y `uploads/` se crean solos en el primer arranque — ahí vive todo lo tuyo, y nunca se suben a git.

Si preferís copiar la carpeta a mano en vez de usar git (por ejemplo a un servidor sin acceso a internet):
```bash
scp -r ./bookshelf usuario@tu-servidor:~/
ssh usuario@tu-servidor "cd ~/bookshelf && docker compose up -d --build"
```

## Usuarios y login

Cada usuario tiene su propia biblioteca (libros, colecciones, progreso, bookmarks, highlights), completamente aislada de la de los demás. Además existe una cuenta de **administrador**, que no tiene biblioteca propia: solo sirve para crear y borrar usuarios desde `/admin`.

En una instalación nueva (clonada desde cero, sin datos previos) solo se crea automáticamente:
- `admin` / `admin123` — cuenta de administración, sin biblioteca propia.

**Cambiá esta contraseña apenas levantes el proyecto**, y creá desde `/admin` las cuentas reales de cada persona.

### Crear usuarios

Dos formas, usá la que te resulte más cómoda:

1. **Panel web**: entrá como `admin` en `/admin` y usá "Nuevo usuario".
2. **Script bash** (no necesita acceso a la web):
   ```bash
   ./manage.sh create-user tino claveSegura123
   ./manage.sh list-users
   ./manage.sh reset-password tino otraClave
   ./manage.sh delete-user tino
   ```

## Enviar libros entre usuarios

Desde el lector (panel de info, botón "Enviar a otro usuario") podés mandarle cualquier libro a otra cuenta del servidor. Al destinatario le aparece una notificación — 🔔 en el topbar de la biblioteca, con contador de las que no vio — y al abrirla ve la portada, el título y quién se lo mandó, con la opción de aceptarlo eligiendo o creando una colección.

El archivo recién se copia a la biblioteca del destinatario al aceptar, nunca antes: si nunca lo acepta, no se duplicó nada en disco. Cerrar la notificación sin aceptar solo la marca como "vista" (deja de sumar al contador) — se puede volver a abrir y aceptar cuando quieras. Cualquier notificación, la hayas visto o no, aceptado o no, se borra sola a los 7 días de haberse recibido, para no acumular basura en el servidor.

## Leer sin conexión

Bookshelf es una PWA: se puede instalar en el teléfono ("Agregar a inicio" en iOS, "Instalar app" en Android) y abre como una app nativa.

> ⚠️ **Hace falta servir la app por HTTPS.** Esto no es opcional ni una recomendación de seguridad: los navegadores solo habilitan los *service workers* en contextos seguros, y el service worker es lo que hace todo el trabajo de caché. Entrando por `http://IP:8090` el navegador **ni siquiera expone la API** (`navigator.serviceWorker` no existe), así que no hay nada cacheado, la app no abre sin internet y el botón "Guardar sin conexión" **se oculta solo** — el código lo esconde cuando detecta que `caches` no está disponible. La única excepción que hacen los navegadores es `localhost`, que desde el teléfono no sirve.
>
> Todo lo demás (subir, leer, colecciones, envíos entre usuarios) anda perfecto por HTTP. Lo único que se pierde es el modo sin conexión.

### Servir por HTTPS con Tailscale

La forma más simple de conseguir un certificado válido sin exponer nada a internet ni comprar un dominio. Requiere Tailscale instalado en el servidor y en el teléfono, los dos en la misma tailnet.

1. Activá **HTTPS Certificates** en [login.tailscale.com/admin/dns](https://login.tailscale.com/admin/dns) (viene apagado por defecto).
2. En el servidor, poné Tailscale al frente del puerto de Bookshelf:
   ```bash
   sudo tailscale set --operator=$USER   # opcional: evita sudo a futuro
   sudo tailscale serve --bg --https=8443 http://127.0.0.1:8090
   ```
3. Abrí `https://<tu-servidor>.<tu-tailnet>.ts.net:8443` **en Safari/Chrome del teléfono** y agregala a la pantalla de inicio desde ahí.

El certificado es de Let's Encrypt, así que iOS y Android lo confían sin instalar nada. `serve` publica el servicio **solo dentro de tu tailnet** — no es `funnel`, que sí lo expondría a internet. Como Tailscale es una VPN, además la app te funciona desde cualquier lado, no solo en tu red local. Para desactivarlo: `sudo tailscale serve --https=8443 off`.

Si ya tenías la app instalada apuntando a la IP por HTTP, **borrá el ícono viejo y volvé a agregarla desde la dirección HTTPS**: es otro origen, con otro almacén de caché, así que la instalación vieja no sirve.

Dentro del lector, el botón **"Guardar sin conexión"** descarga ese libro al dispositivo. Los libros guardados quedan listados en la sección **"Sin conexión"** de la biblioteca y se marcan con un ícono en la portada. Solo se guarda lo que elegís: nada se descarga solo, para no llenarte el teléfono.

La app en sí (la biblioteca, las portadas y el lector) queda cacheada después de la primera visita con conexión, así que abre igual sin internet — lo único que necesita estar guardado explícitamente es el archivo de cada libro.

Lo guardado vive en el *Cache Storage* del navegador, aislado por origen, y se indexa por URL: al abrir un libro sin conexión el lector pide `/api/books/<id>/file` como siempre y el service worker le devuelve la copia local, de forma indistinguible del servidor. El caché de los libros no lleva número de versión (a diferencia del de la app), así que **los libros guardados sobreviven las actualizaciones**. Al guardar el primero se llama a `navigator.storage.persist()` para que iOS no borre nada — solo lo respeta si la app está instalada en la pantalla de inicio.

> En iPhone, para que la hoja aproveche toda la pantalla (incluso por debajo de la hora y la batería, como en los PDF nativos) hay que abrirla **instalada desde la pantalla de inicio**: Safari siempre muestra su propia barra. Si ya la tenías instalada de antes, borrá el ícono y volvé a agregarla para que tome la configuración nueva.

## Formatos soportados
- **PDF** — lector completo con zoom y navegación por páginas
- **EPUB** — lector con fuente, tamaño y tema ajustable
- **MOBI, CBZ, CBR, DJVU, FB2, TXT** — descarga directa

## Funcionalidades
- 👤 Multiusuario, con bibliotecas completamente aisladas
- 🔔 Enviar un libro a otro usuario, con notificación para aceptar
- 📴 Lectura sin conexión: guardás los libros que quieras y se leen sin internet
- 📁 Colecciones (crear, mover libros entre ellas)
- ⬆️ Subida por drag & drop desde el browser (varios archivos a la vez)
- 📖 Lector integrado para PDF y EPUB
- 🔖 Bookmarks con nombre
- 📍 Progreso guardado por dispositivo
- ⬇️ Descarga directa de archivos
- 🔗 Compartir link + WhatsApp
- 📱 PWA instalable en el teléfono
- 🔍 Búsqueda de libros
