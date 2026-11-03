// Progreso de lectura: local primero, servidor despues.
//
// Antes el progreso vivia solo en el servidor: cada cambio de pagina era un
// POST "dispara y olvida", y al abrir un libro se pedia por GET. Sin conexion
// (o con la conexion a medias de un gimnasio) los POST fallaban en silencio y
// se perdian, y el GET lo contestaba el service worker con la ultima copia
// cacheada — la de la ultima vez que se abrio el libro CON internet. Resultado:
// leias de la 70 a la 100 offline y al volver a entrar estabas en la 70.
//
// Ahora:
//  - Cada guardado se escribe al instante en localStorage (sincrono, no puede
//    fallar por la red) con una marca de tiempo y "synced: false".
//  - Un sincronizador empuja al servidor lo pendiente: con debounce mientras
//    se lee, de inmediato al salir de la pagina (keepalive, sobrevive a la
//    navegacion), al volver la conexion, al volver a la app y al abrir
//    cualquier pagina. Si falla, reintenta con backoff. Background Sync no
//    existe en iOS, por eso se hace a mano.
//  - Para leer, manda la copia local: el progreso es por dispositivo, asi que
//    nadie mas que este telefono puede tener una version mas nueva. El
//    servidor solo se consulta si no hay copia local (libro nunca abierto en
//    este dispositivo, o progreso anterior a este cambio).
//  - El servidor descarta un guardado mas viejo que el que ya tiene (compara
//    la marca de tiempo del cliente), asi un reintento atrasado nunca pisa uno
//    nuevo aunque lleguen desordenados.
const Progress = (() => {
  const PREFIX = "bs_prog_";
  const PUSH_DELAY = 3000;          // debounce mientras se lee
  const RETRY_MIN = 5000, RETRY_MAX = 60000;
  const FETCH_TIMEOUT = 4000;       // con conexion a medias un GET puede colgarse
  const LOCAL_WAIT = 1500;          // si ya hay copia local, no hacer esperar al abrir

  const deviceId = () => localStorage.getItem("bs_device_id") || "default";
  const url = bookId => "/api/books/" + bookId + "/progress?device_id=" + encodeURIComponent(deviceId());

  function read(bookId) {
    try { return JSON.parse(localStorage.getItem(PREFIX + bookId)); } catch { return null; }
  }
  function write(bookId, entry) {
    try { localStorage.setItem(PREFIX + bookId, JSON.stringify(entry)); return true; } catch { return false; }
  }
  function pendingIds() {
    const ids = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(PREFIX)) continue;
        const id = k.slice(PREFIX.length);
        const e = read(id);
        if (e && !e.synced) ids.push(id);
      }
    } catch {}
    return ids;
  }

  // ── Guardar ──────────────────────────────────────────────────────────────
  function save(bookId, data) {
    const prev = read(bookId);
    // Monotona por libro: si el reloj del telefono va para atras, el guardado
    // nuevo igual tiene que ganarle al anterior.
    const ts = Math.max(Date.now(), prev && prev.ts ? prev.ts + 1 : 0);
    write(bookId, { data, ts, synced: false });
    schedulePush(PUSH_DELAY);
  }

  // ── Leer ─────────────────────────────────────────────────────────────────
  // El progreso sigue al libro entre dispositivos: gana la posicion MAS
  // AVANZADA a la que se llego en cualquiera (un vistazo corto en otro
  // dispositivo no tira para atras lo leido). El servidor manda la mejor de
  // todas (?latest=1) y se compara con la copia local, que sigue siendo la
  // fuente de verdad sin conexion. Misma regla que best_progress en app.py.
  function position(d) {
    d = d || {};
    if (d.page != null) return Number(d.page) + Math.min(Math.max(Number(d.frac) || 0, -0.9999), 0.9999);
    return Number(d.percentage) || 0;
  }
  // a y b son { data, ts } o null. A igual posicion, la mas reciente.
  function pick(a, b) {
    if (!a) return b;
    if (!b) return a;
    const pa = position(a.data), pb = position(b.data);
    if (pa !== pb) return pb > pa ? b : a;
    return (b.ts || 0) > (a.ts || 0) ? b : a;
  }
  function fromServer(remote) {
    if (!remote) return null;
    const { updated_at, ts, ...data } = remote;
    return { data, ts: Number(ts) || serverTs(updated_at) };
  }

  // Devuelve { data, ts } o null. Con copia local se espera poco al servidor
  // (abre igual si la conexion es mala); sin copia, hasta FETCH_TIMEOUT.
  async function load(bookId) {
    const local = read(bookId);
    const mine = local ? { data: local.data || {}, ts: local.ts || 0 } : null;
    const remote = fromServer(await fetchRemote(bookId, local ? LOCAL_WAIT : FETCH_TIMEOUT));
    const best = pick(mine, remote);
    if (!best) return null;
    // Lo que llega del servidor queda como copia local ya sincronizada. Si
    // mientras esperabamos la red se guardo algo local, eso es mas nuevo.
    if (best === remote) {
      const now = read(bookId);
      if (!now || now.ts === (local && local.ts)) write(bookId, { data: remote.data, ts: remote.ts, synced: true });
    }
    return best;
  }

  // Para las tarjetas de la biblioteca: sin red. "hint" es el progreso que
  // ya vino con la lista de libros (/api/books lo trae, ver attach_progress).
  function peek(bookId, hint) {
    const local = read(bookId);
    return pick(local ? { data: local.data || {}, ts: local.ts || 0 } : null, fromServer(hint));
  }

  async function fetchRemote(bookId, timeout) {
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
    try {
      const res = await fetch(url(bookId) + "&latest=1", ctrl ? { signal: ctrl.signal } : undefined);
      if (!res.ok) return null;
      const body = await res.json();
      return body && Object.keys(body).length ? body : null;
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // "YYYY-MM-DD HH:MM:SS" de SQLite, en UTC.
  function serverTs(s) {
    if (!s) return 0;
    const t = Date.parse(String(s).replace(" ", "T") + "Z");
    return isNaN(t) ? 0 : t;
  }

  // ── Sincronizar ──────────────────────────────────────────────────────────
  let pushTimer = null, retryDelay = RETRY_MIN, flushing = null;

  function schedulePush(delay) {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => flush(), delay);
  }

  // Devuelve true si quedo sincronizado (o si ya no hay nada que mandar).
  async function pushOne(bookId, keepalive) {
    const e = read(bookId);
    if (!e || e.synced) return true;
    let res;
    try {
      res = await fetch(url(bookId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({}, e.data, { ts: e.ts })),
        keepalive: !!keepalive,
      });
    } catch {
      return false;   // sin red: queda pendiente
    }
    // 404: el libro ya no existe. No tiene sentido reintentar para siempre.
    if (res.status === 404) {
      try { localStorage.removeItem(PREFIX + bookId); } catch {}
      return true;
    }
    if (!res.ok) return false;
    // Solo se marca si no hubo otro guardado mientras viajaba el POST.
    const now = read(bookId);
    if (now && now.ts === e.ts) write(bookId, Object.assign(now, { synced: true }));
    return true;
  }

  // keepalive: para el flush al salir de la pagina. El navegador termina el
  // POST aunque la pagina ya se haya descargado.
  function flush(opts) {
    const keepalive = !!(opts && opts.keepalive);
    clearTimeout(pushTimer);
    if (keepalive) {
      // Al salir no se espera a un flush en curso: puede estar colgado de una
      // conexion mala y la pagina se va. Mandar de nuevo es inofensivo (el
      // servidor ignora lo que no sea mas nuevo).
      pendingIds().forEach(id => pushOne(id, true));
      return Promise.resolve();
    }
    if (flushing) return flushing;
    flushing = (async () => {
      let ok = true;
      for (const id of pendingIds()) {
        if (!(await pushOne(id, false))) ok = false;
      }
      return ok;
    })().then(ok => {
      flushing = null;
      if (ok) {
        retryDelay = RETRY_MIN;
        // Pudo haber guardados nuevos mientras se mandaban los anteriores.
        if (pendingIds().length) schedulePush(PUSH_DELAY);
      } else if (document.visibilityState === "visible") {
        schedulePush(retryDelay);
        retryDelay = Math.min(retryDelay * 2, RETRY_MAX);
      }
      return ok;
    });
    return flushing;
  }

  // ── Salir de la pagina ───────────────────────────────────────────────────
  // El lector registra aca la funcion que mide la posicion exacta: sus
  // guardados van con debounce, y si uno toca "volver" antes de que venza se
  // perderia el ultimo tramo leido.
  const captures = [];
  function onLeave(fn) { captures.push(fn); }

  function leave() {
    captures.forEach(fn => { try { fn(); } catch {} });
    flush({ keepalive: true });
  }

  // visibilitychange es el unico aviso confiable en iOS (cambiar de app,
  // bloquear la pantalla, cerrar desde el multitarea). pagehide cubre la
  // navegacion normal, como el boton de volver a la biblioteca.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") leave();
    else { retryDelay = RETRY_MIN; flush(); }
  });
  window.addEventListener("pagehide", leave);
  // navigator.onLine miente en iOS, por eso no se usa para decidir nada: solo
  // como aviso extra para reintentar antes.
  window.addEventListener("online", () => { retryDelay = RETRY_MIN; flush(); });

  // Al abrir cualquier pagina se manda lo que haya quedado de antes.
  if (pendingIds().length) setTimeout(() => flush(), 1000);

  return { save, load, peek, flush, onLeave, read };
})();
