# 📚 Bookshelf

**v1.3** — ver [CHANGELOG.md](CHANGELOG.md) para el historial de versiones.

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

## Formatos soportados
- **PDF** — lector completo con zoom y navegación por páginas
- **EPUB** — lector con fuente, tamaño y tema ajustable
- **MOBI, CBZ, CBR, DJVU, FB2, TXT** — descarga directa

## Funcionalidades
- 👤 Multiusuario, con bibliotecas completamente aisladas
- 📁 Colecciones (crear, mover libros entre ellas)
- ⬆️ Subida por drag & drop desde el browser (varios archivos a la vez)
- 📖 Lector integrado para PDF y EPUB
- 🔖 Bookmarks con nombre
- 📍 Progreso guardado por dispositivo
- ⬇️ Descarga directa de archivos
- 🔗 Compartir link + WhatsApp
- 📱 PWA instalable en el teléfono
- 🔍 Búsqueda de libros

## Actualizando desde una versión sin login (pre-v1.3)

Si ya tenías Bookshelf corriendo antes de que existiera el login, con tu biblioteca real en `data/` y `uploads/`, actualizar es seguro: la migración a multiusuario es automática y corre una sola vez, la primera vez que arranca el código nuevo. Si detecta libros o colecciones ya cargados (sean los que sean, de cualquier versión anterior), los asigna a una cuenta nueva llamada `usuario` / `cambiar123` — cambiale el nombre y la contraseña apenas entres.

Para automatizar el paso de código sin tocar tus datos reales, `deploy_to_server.sh` copia el proyecto por `rsync` excluyendo siempre `data/` y `uploads/`:

```bash
./deploy_to_server.sh usuario@tu-servidor ~/bookshelf
```

Después:
1. Entrá con `usuario` / `cambiar123` y confirmá que están todos tus libros y colecciones.
2. Entrá con `admin` / `admin123` y confirmá el panel.
3. Cambiá ambas contraseñas con `./manage.sh reset-password <usuario> <clave-nueva>`.
