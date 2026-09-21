// Service worker de Bookshelf.
//
// Estrategia:
//  - App shell (CSS/JS/iconos): precache en install, se sirve desde cache.
//  - Navegacion (/ y /read/<id>): network-first con fallback a cache.
//  - Datos (/api/books, /api/collections, portadas): network-first con
//    fallback a cache, para poder ver la biblioteca sin conexion.
//  - Archivos de libros (/api/books/<id>/file): NUNCA se cachean solos (pesan
//    demasiado). Solo se sirven desde cache si el usuario guardo ese libro
//    explicitamente con "Guardar sin conexion".

// Subir VERSION en cada cambio de un archivo del shell (CSS/JS): se sirven
// cache-first, asi que sin cambiar el nombre del cache los dispositivos que ya
// visitaron la app seguirian con los archivos viejos para siempre. Ademas el
// navegador solo detecta un service worker nuevo si el archivo cambio.
const VERSION = "v22";
const SHELL_CACHE = "bookshelf-shell-" + VERSION;
const DATA_CACHE  = "bookshelf-data-" + VERSION;
const BOOKS_CACHE = "bookshelf-books-v1"; // sin VERSION: los libros guardados
                                          // por el usuario sobreviven updates

const SHELL_ASSETS = [
  "/static/css/nav.css",
  "/static/css/main.css",
  "/static/css/reader.css",
  "/static/js/nav.js",
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

  // Estaticos: cache-first (son inmutables por el ?v=).
  if (url.pathname.startsWith("/static/")) {
    e.respondWith(cacheFirst(req, SHELL_CACHE));
    return;
  }

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
async function navigationWithFallback(req, url) {
  try {
    return await networkFirst(req, DATA_CACHE);
  } catch (err) {
    const cache = await caches.open(DATA_CACHE);
    if (url.pathname.startsWith("/read/")) {
      const keys = await cache.keys();
      const anyReader = keys.find(k => new URL(k.url).pathname.startsWith("/read/"));
      if (anyReader) {
        const hit = await cache.match(anyReader);
        if (hit) return hit;
      }
    }
    const home = await cache.match("/", { ignoreSearch: true });
    if (home) return home;
    throw err;
  }
}
