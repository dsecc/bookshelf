// Service worker de Bookshelf.
//
// Estrategia:
//  - App shell (CSS/JS/iconos): precache en install, se sirve desde cache.
//  - Navegacion (/ y /read/<id>): network-first con fallback a cache.
//  - Datos (/api/books, /api/collections, portadas): network-first con
//    fallback a cache, para poder ver la biblioteca sin conexion.
//  - Progreso de lectura (/api/books/<id>/progress): solo red. La fuente de
//    verdad offline es localStorage (progress.js), no este cache.
//  - Archivos de libros (/api/books/<id>/file): NUNCA se cachean solos (pesan
//    demasiado). Solo se sirven desde cache si el usuario guardo ese libro
//    explicitamente con "Guardar sin conexion".

// Subir VERSION en cada cambio de un archivo del shell (CSS/JS): se sirven
// cache-first, asi que sin cambiar el nombre del cache los dispositivos que ya
// visitaron la app seguirian con los archivos viejos para siempre. Ademas el
// navegador solo detecta un service worker nuevo si el archivo cambio.
const VERSION = "v49";
const SHELL_CACHE = "bookshelf-shell-" + VERSION;
// Sin VERSION: es solo el respaldo sin conexion (todo lo de datos es
// network-first). Antes se borraba con cada version y, justo despues de un
// deploy, el celu quedaba sin copia de la biblioteca: si la red fallaba en ese
// momento, Safari mostraba "FetchEvent.respondWith received an error".
const DATA_CACHE  = "bookshelf-data";
const BOOKS_CACHE = "bookshelf-books-v1"; // sin VERSION: los libros guardados
                                          // por el usuario sobreviven updates

const SHELL_ASSETS = [
  "/static/css/nav.css",
  "/static/css/main.css",
  "/static/css/reader.css",
  "/static/js/nav.js",
  "/static/js/progress.js",
  "/static/js/mdlite.js",
  "/static/js/app.js",
  "/static/js/reader.js",
  "/static/js/pdf.worker.min.js",
  "/static/js/vendor/pdf.min.js",
  "/static/js/vendor/jszip.min.js",
  "/static/js/vendor/page-flip.browser.js",
  "/static/js/vendor/epub.min.js",
  "/static/manifest.json",
  "/static/icons/favicon.png",
  "/static/icons/icon-192.png",
  "/static/icons/icon-512.png",
  "/static/icons/apple-touch-icon.png",
  "/static/icons/icon-maskable-192.png",
  "/static/icons/icon-maskable-512.png",
  "/static/icons/logo.svg",
];

self.addEventListener("install", e => {
  e.waitUntil(
    Promise.all([
      // addAll falla entero si un solo archivo falla: se cachea uno por uno
      // para que un asset faltante no rompa toda la instalacion.
      caches.open(SHELL_CACHE).then(cache => Promise.all(
        SHELL_ASSETS.map(url => cache.add(url).catch(() => {}))
      )),
      // La biblioteca y sus datos se cargan antes de que el SW tome control,
      // asi que esas requests nunca pasarian por el cache: se precachean aca
      // para que la primera vez sin conexion ya haya algo que mostrar.
      caches.open(DATA_CACHE).then(cache => Promise.all(
        ["/", "/api/books", "/api/collections", "/api/books/recent?limit=10"]
          .map(url => cache.add(url).catch(() => {}))
      )),
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      // Lo de los caches de datos viejos (bookshelf-data-vNN) pasa al nuevo
      // antes de borrarlos, para no quedar sin respaldo.
      .then(keys => Promise.all(keys.filter(k => k.startsWith("bookshelf-data-")).map(async k => {
        const viejo = await caches.open(k), nuevo = await caches.open(DATA_CACHE);
        for (const req of await viejo.keys()) {
          if (!(await nuevo.match(req))) { const r = await viejo.match(req); if (r) await nuevo.put(req, r); }
        }
      })).then(() => caches.keys()))
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith("bookshelf-") && k !== SHELL_CACHE &&
                         k !== DATA_CACHE && k !== BOOKS_CACHE)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Las URLs de los estaticos llevan ?v=<timestamp> que cambia en cada arranque
// del servidor, asi que hay que matchear ignorando el query string.
function matchIgnoringQuery(cacheName, request) {
  return caches.open(cacheName)
    .then(cache => cache.match(request, { ignoreSearch: true }));
}

async function networkFirst(request, cacheName) {
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, res.clone());
    }
    return res;
  } catch (err) {
    const cached = await matchIgnoringQuery(cacheName, request);
    if (cached) return cached;
    throw err;
  }
}

async function staticFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const exact = await cache.match(request);
  if (exact) return exact;
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const any = await cache.match(request, { ignoreSearch: true });
    if (any) return any;
    throw err;
  }
}
async function cacheFirst(request, cacheName) {
  const cached = await matchIgnoringQuery(cacheName, request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res && res.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, res.clone());
  }
  return res;
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Archivo de un libro: solo desde el cache de guardados. Si no esta, va a
  // la red; sin conexion falla y el lector muestra el aviso correspondiente.
  if (/^\/api\/books\/\d+\/file$/.test(url.pathname)) {
    e.respondWith(
      caches.open(BOOKS_CACHE)
        .then(cache => cache.match(req, { ignoreSearch: true }))
        .then(hit => hit || fetch(req))
    );
    return;
  }

  // Estaticos: cache-first por URL EXACTA (con el ?v=). Antes se buscaba
  // ignorando el ?v=, y despues de un deploy la primera apertura recibia los
  // archivos viejos aunque el HTML nuevo pidiera los nuevos; la version nueva
  // recien se veia en otra apertura, si iOS habia dejado terminar al SW nuevo.
  // Ahora un ?v= que no esta se baja (y queda guardado); sin conexion, sirve
  // la copia que haya de ese archivo.
  if (url.pathname.startsWith("/static/")) {
    e.respondWith(staticFirst(req));
    return;
  }

  // Progreso de lectura: solo red, nunca cache. La copia local la lleva
  // progress.js; si aca se sirviera un GET cacheado, sin conexion el lector
  // abriria en la pagina de la ultima vez que hubo internet.
  if (/^\/api\/books\/\d+\/progress$/.test(url.pathname)) return;

  // Portadas y datos de la biblioteca: network-first con fallback.
  if (url.pathname.startsWith("/api/")) {
    e.respondWith(networkFirst(req, DATA_CACHE));
    return;
  }

  // Navegacion (biblioteca y lector).
  if (req.mode === "navigate") {
    e.respondWith(navigationWithFallback(req, url));
    return;
  }
});

// Sin conexion, una pagina que nunca se visito no esta en el cache. Para el
// lector cualquier /read/<id> cacheado sirve: reader.js saca el id de la URL,
// no del HTML. Para el resto se cae a la biblioteca.
// Safari no acepta para una navegacion una respuesta que vino de un
// redirect (p. ej. "/" guardado cuando mandaba al login): se rearma limpia.
function sinRedirect(res) {
  if (!res || !res.redirected) return res;
  return res.blob().then(b => new Response(b, { status: res.status, statusText: res.statusText, headers: res.headers }));
}

// Navegacion: red primero. Si falla se reintenta una vez (Tailscale en iOS
// despierta el tunel con el primer pedido, que a veces falla), despues la
// copia guardada, y si no hay ninguna, una pagina propia con "Reintentar".
// Nunca se deja caer el error: Safari mostraria su pantalla de error, que en
// la app instalada no tiene salida.
async function navigationWithFallback(req, url) {
  for (let intento = 0; intento < 2; intento++) {
    try {
      const res = await fetch(req);
      if (res && res.ok && !res.redirected) (await caches.open(DATA_CACHE)).put(req, res.clone());
      return res;
    } catch (err) {
      if (intento === 0) await new Promise(r => setTimeout(r, 900));
    }
  }
  const cache = await caches.open(DATA_CACHE);
  let hit = await cache.match(req, { ignoreSearch: true });
  if (!hit && url.pathname.startsWith("/read/")) {
    const anyReader = (await cache.keys()).find(k => new URL(k.url).pathname.startsWith("/read/"));
    if (anyReader) hit = await cache.match(anyReader);
  }
  if (!hit) hit = await cache.match("/", { ignoreSearch: true });
  if (hit) return sinRedirect(hit);
  return new Response(SIN_CONEXION, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

const SIN_CONEXION = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0d0d0d"><title>Bookshelf</title>
<style>html,body{height:100%;margin:0;background:#0d0d0d;color:#e8e8e8;font:15px -apple-system,system-ui,sans-serif}
body{display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;box-sizing:border-box}
p{color:#9a9a9a;line-height:1.5;margin:.4rem 0 1.4rem}h1{font-size:1.1rem;margin:0}
button{background:#7c6ff7;color:#fff;border:0;border-radius:999px;padding:.7rem 1.6rem;font:inherit;font-weight:600}</style></head>
<body><div><h1>No se pudo conectar con Bookshelf</h1>
<p>Fijate que Tailscale este conectado y volve a intentar.</p>
<button onclick="location.reload()">Reintentar</button></div></body></html>`;
