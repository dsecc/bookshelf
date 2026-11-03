
// Si la sesion expira, cualquier llamada a la API vuelve 401 -> mandar a /login
(function () {
  const _fetch = window.fetch;
  window.fetch = function () {
    return _fetch.apply(this, arguments).then((res) => {
      if (res.status === 401) window.location.href = "/login";
      return res;
    });
  };
})();

const deviceId = localStorage.getItem("bs_device_id") || (() => {
  const id = Math.random().toString(36).slice(2);
  localStorage.setItem("bs_device_id", id);
  return id;
})();

let collections = [], books = [], recentBooks = [], activeColId = null, pendingFiles = [];
let notifications = [], activeShareId = null;
// Vista "Sin conexion": el cache del service worker es la fuente de verdad de
// que libros estan guardados (no se duplica el estado en ningun lado).
let offlineView = false, offlineIds = new Set();
// Vista "Papelera": books son los libros eliminados (GET /api/trash).
let trashView = false;
// Colecciones abiertas que el usuario plego tocandolas de nuevo.
let collapsedCols = new Set();

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  // refresh() va aparte: sin conexion sus fetch pueden fallar, y si eso corta
  // el init la UI queda sin ningun handler enganchado (nada clickeable).
  try { await refresh(); } catch (e) { console.error("refresh error:", e); }
  hideSplash();
  try {
    bindEvents();
    initColToggle();
    registerSW();
    initBottomNav();
    loadNotifications();
  } catch(e) {
    console.error("init error:", e);
  }
}

// ── Pantalla de inicio ───────────────────────────────────────────────────────
// Se va cuando la biblioteca ya esta armada: libros dibujados y las primeras
// tapas cargadas (con tope, para no quedar esperando una tapa lenta). Se
// muestra un minimo para que el logo no sea un parpadeo.
const SPLASH_MIN = 700, SPLASH_MAX_TAPAS = 1600;
async function hideSplash() {
  const sp = document.getElementById("splash");
  if (!sp || sp.hidden) return;
  const tapas = [...document.querySelectorAll("#booksContainer .book-cover img")].slice(0, 9)
    .map(img => img.complete ? null : new Promise(r => { img.addEventListener("load", r, { once: true }); img.addEventListener("error", r, { once: true }); }))
    .filter(Boolean);
  await Promise.race([Promise.all(tapas), new Promise(r => setTimeout(r, SPLASH_MAX_TAPAS))]);
  const falta = SPLASH_MIN - performance.now();
  if (falta > 0) await new Promise(r => setTimeout(r, falta));
  sp.classList.add("fuera");
  setTimeout(() => sp.remove(), 520);
}

// GET de JSON que no explota sin conexion: devuelve el fallback.
async function fetchJSON(url, fallback) {
  try {
    const res = await fetch(url);
    if (!res.ok) return fallback;
    return await res.json();
  } catch (e) {
    return fallback;
  }
}

// Carga colecciones + libros juntos, luego renderiza todo
async function refresh() {
  offlineView = false;
  await loadOfflineIds(); // para el indicador de "guardado" en las tarjetas
  // Sin conexion cada fetch puede fallar: se resuelve con lo que haya (el
  // service worker devuelve la ultima copia cacheada si la tiene) en vez de
  // tirar abajo todo el render.
  const [cols, bks, recent] = await Promise.all([
    fetchJSON("/api/collections", collections),
    trashView ? fetchJSON("/api/trash", books)
              : fetchJSON("/api/books" + (activeColId != null ? "?collection_id=" + activeColId : ""), books),
    fetchJSON("/api/books/recent?limit=10", recentBooks)
  ]);
  collections = cols;
  books = bks;
  recentBooks = recent;
  renderSidebar();
  renderBooks();
  populateCollectionSelects();
  updateBookCount();
}

// ── Colecciones (carpetas) ───────────────────────────────────────────────────
// Son un arbol: parent_id apunta a la carpeta de arriba. Al abrir una se ven
// sus libros y los de todas sus subcarpetas (el servidor ya los manda asi).
const colById = id => collections.find(c => c.id === id);
const childrenOf = id => colTree(collections).filter(x => x.c.parent_id === id).map(x => x.c);
const topLevel = () => colTree(collections).filter(x => x.depth === 0).map(x => x.c);

// Ids desde el primer nivel hasta id, incluido.
function ancestorsOf(id) {
  const out = [];
  for (let c = colById(id); c; c = c.parent_id != null ? colById(c.parent_id) : null) out.unshift(c.id);
  return out;
}
const colTrail = id => ancestorsOf(id).map(i => colById(i).name).join(" › ");

// Sale de Sin conexion / Papelera y muestra una coleccion.
async function openCollection(id) {
  offlineView = false; trashView = false;
  activeColId = id;
  collapsedCols.delete(id);
  document.getElementById("topbarTitle").textContent = colTrail(id);
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  setView("biblioteca");
  renderSidebar();
  renderLibTopNav();
  books = await fetchJSON("/api/books?collection_id=" + id, []);
  renderBooks();
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
// Solo el primer nivel; al abrir una coleccion aparecen sus hijas, unidas por
// un trazo curvo (como Obsidian), y las nietas recien al abrir la hija. O sea:
// queda desplegado el camino hasta la coleccion abierta.
function renderSidebar() {
  const list = document.getElementById("colList");
  // Lo que estaba desplegado antes: lo que se abre ahora se anima abriendose,
  // y lo que se cerro se reengancha un momento para animarlo cerrandose.
  const antes = new Map();
  list.querySelectorAll(".col-children:not(.closing)").forEach(ul => antes.set(Number(ul.dataset.parent), ul));
  const primera = !list.dataset.pintada; // al cargar la pagina no se anima nada
  list.dataset.pintada = "1";
  // Las animaciones corren al final: necesitan medir el bloque ya en pagina.
  const animar = [];
  list.innerHTML = "";
  const open = new Set(activeColId != null ? ancestorsOf(activeColId) : []);
  const EDIT_ICO = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';

  const build = (ul, cols) => cols.forEach(c => {
    const kids = childrenOf(c.id);
    const expanded = kids.length && open.has(c.id) && !collapsedCols.has(c.id);
    const li = document.createElement("li");
    li.className = "col-node tree-node";
    const row = document.createElement("div");
    row.className = "col-item tree-row" + (activeColId === c.id ? " active" : "") +
      (kids.length ? " has-kids" : "") + (expanded ? " expanded" : "");

    const span = document.createElement("span");
    span.className = "col-name";
    span.textContent = c.name;
    if (c.is_temp) span.title = "Lo que entra aca se va a la papelera a los 30 dias";
    row.appendChild(span);

    const badge = document.createElement("span");
    badge.className = "col-count";
    badge.textContent = c.book_count || 0;
    row.appendChild(badge);

    // La raiz y Temporal no se renombran: son las carpetas fijas.
    if (!c.is_root && !c.is_temp) {
      const editBtn = document.createElement("button");
      editBtn.className = "col-edit";
      editBtn.title = "Renombrar coleccion";
      editBtn.innerHTML = EDIT_ICO;
      editBtn.addEventListener("click", e => { e.stopPropagation(); openRenameCol(c.id, c.name); });
      row.appendChild(editBtn);
    }

    row.addEventListener("click", () => {
      // Tocar la que ya esta abierta pliega (o despliega) sus subcarpetas.
      if (activeColId === c.id && !offlineView && !trashView && kids.length) {
        if (collapsedCols.has(c.id)) collapsedCols.delete(c.id); else collapsedCols.add(c.id);
        renderSidebar();
        return;
      }
      openCollection(c.id);
    });
    li.appendChild(row);

    if (expanded) {
      const sub = document.createElement("ul");
      sub.className = "col-children tree-children";
      sub.dataset.parent = c.id;
      build(sub, kids);
      li.appendChild(sub);
      if (!primera && !antes.has(c.id)) animar.push(() => treeOpen(sub));
    } else if (antes.has(c.id)) {
      const viejo = antes.get(c.id);
      viejo.classList.add("closing");
      li.appendChild(viejo);
      animar.push(() => treeClose(viejo));
    }
    ul.appendChild(li);
  });
  build(list, topLevel());
  animar.forEach(f => f());

  const tc = document.getElementById("navTrashCount");
  const n = collections.length ? collections[0].trash_count || 0 : 0;
  if (tc) tc.textContent = n ? n : "";
}

function initColToggle() {
  const header = document.getElementById("colToggle");
  const list = document.getElementById("colList");
  header.classList.add("open");
  list.classList.add("open");
  header.addEventListener("click", () => {
    header.classList.toggle("open");
    list.classList.toggle("open");
  });
}

// ── Libros guardados sin conexion ────────────────────────────────────────────
// Se leen directo del cache que llena el lector con "Guardar sin conexion".
async function loadOfflineIds() {
  offlineIds = new Set();
  if (!("caches" in window)) return offlineIds;
  try {
    const cache = await caches.open("bookshelf-books-v1");
    const keys = await cache.keys();
    keys.forEach(req => {
      const m = req.url.match(/\/api\/books\/(\d+)\/file/);
      if (m) offlineIds.add(parseInt(m[1], 10));
    });
  } catch (e) { /* sin soporte de cache: queda vacio */ }
  return offlineIds;
}

async function showOfflineView() {
  offlineView = true; trashView = false;
  activeColId = null;
  renderSidebar();
  setNavActive("navOffline");
  setView("biblioteca");
  document.getElementById("topbarTitle").textContent = "Sin conexion";
  await loadOfflineIds();
  // Si no hay red, books puede venir del cache del service worker.
  books = await fetchJSON("/api/books", books);
  renderBooks();
}

// ── Papelera ──────────────────────────────────────────────────────────────────
// Lo eliminado (desde el lector, o lo que vencio en Temporal) queda 30 dias.
// Las tarjetas no abren el lector: abren Restaurar / Eliminar definitivamente.
async function showTrashView() {
  offlineView = false; trashView = true;
  activeColId = null;
  setNavActive("navTrash");
  setView("biblioteca");
  renderSidebar();
  document.getElementById("topbarTitle").textContent = "Papelera";
  books = await fetchJSON("/api/trash", []);
  renderBooks();
}

// Dias que faltan hasta una fecha UTC de SQLite ("2026-12-03 04:50:59").
function daysLeft(sqlDate) {
  const ms = Date.parse(sqlDate.replace(" ", "T") + "Z") - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}
const daysText = n => n === 0 ? "hoy" : n === 1 ? "1 dia" : n + " dias";

let trashItem = null;
function openTrashItem(book) {
  trashItem = book;
  const meta = "Estaba en " + book.original_collection + ". Se borra en " + daysText(daysLeft(book.trash_expires_at)) + ".";
  if (window.innerWidth <= 640) {
    const ICO_BACK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';
    const ICO_DEL = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    openNavSheet(body => {
      const head = document.createElement("div");
      head.className = "nav-sheet-title";
      head.appendChild(Object.assign(document.createElement("span"), { textContent: book.title }));
      body.appendChild(head);
      body.appendChild(Object.assign(document.createElement("div"), { className: "nav-sheet-note", textContent: meta }));
      body.appendChild(navSheetRow({ label: "Restaurar", icon: ICO_BACK, onClick: () => { closeNavSheet(); restoreTrashItem(); } }));
      body.appendChild(Object.assign(document.createElement("div"), { className: "nav-sheet-sep" }));
      const del = navSheetRow({ label: "Eliminar definitivamente", icon: ICO_DEL, onClick: () => { closeNavSheet(); purgeTrashItem(); } });
      del.classList.add("danger");
      body.appendChild(del);
    });
  } else {
    document.getElementById("trashItemTitle").textContent = book.title;
    document.getElementById("trashItemMeta").textContent = meta;
    openModal("modalTrashItem");
  }
}

async function restoreTrashItem() {
  if (!trashItem) return;
  const res = await fetch("/api/trash/" + trashItem.id + "/restore", { method: "POST" });
  closeModal("modalTrashItem");
  if (!res.ok) { toast("No se pudo restaurar"); return; }
  const data = await res.json();
  toast("Restaurado en " + data.collection);
  await refresh();
}

async function purgeTrashItem() {
  if (!trashItem) return;
  if (!confirm("¿Eliminar \"" + trashItem.title + "\" para siempre? No se puede deshacer.")) return;
  const res = await fetch("/api/trash/" + trashItem.id, { method: "DELETE" });
  closeModal("modalTrashItem");
  toast(res.ok ? "Eliminado definitivamente" : "No se pudo eliminar");
  await refresh();
}

async function emptyTrash() {
  const n = books.length;
  if (!n || !confirm("¿Eliminar para siempre " + (n === 1 ? "el libro" : "los " + n + " libros") + " de la papelera? No se puede deshacer.")) return;
  const res = await fetch("/api/trash", { method: "DELETE" });
  toast(res.ok ? "Papelera vaciada" : "No se pudo vaciar la papelera");
  await refresh();
}

// ── Encabezado de la vista ────────────────────────────────────────────────────
// En el celu no hay topbar ni sidebar: el nombre de la coleccion, la ruta para
// volver hacia arriba y las subcarpetas (pastillas) van arriba de la grilla.
// En desktop no se ve (lo hacen la topbar y el sidebar), salvo el de la
// papelera, que tiene el boton de vaciar.
function makeViewHead() {
  const head = document.createElement("div");
  if (trashView) {
    head.className = "view-head trash-head";
    head.innerHTML = "<p class='view-head-note'>Lo eliminado se borra solo a los 30 dias. Hasta entonces se puede restaurar.</p>";
    if (books.length) {
      const btn = document.createElement("button");
      btn.className = "btn-danger";
      btn.textContent = "Vaciar papelera";
      btn.onclick = emptyTrash;
      head.appendChild(btn);
    }
    return head;
  }
  if (activeColId == null || offlineView) return null;
  const c = colById(activeColId);
  if (!c) return null;
  // El nombre ya lo dice la topbar; aca solo lo que agrega algo (Temporal).
  if (!c.is_temp) return null;
  head.className = "view-head col-head";
  head.appendChild(Object.assign(document.createElement("p"), {
    className: "view-head-note", textContent: "Lo que dejes aca se va a la papelera a los 30 dias." }));

  return head;
}

// ── Topbar flotante (celu): donde estas ──────────────────────────────────────
// Reemplaza al logo de arriba. Siempre a la vista en la biblioteca, con la
// ruta como en el disco: "/" es la raiz (la biblioteca general), y adentro
// "/ Ciberseguridad / Malware". Las vistas especiales son un tramo mas
// ("/ Papelera", "/ Ajustes"). Cada tramo lleva ahi; la actual, resaltada.
// Solo donde estas, no adonde podes ir (para eso esta la hoja de colecciones).
function irARaiz() { const b = document.getElementById("bnBiblioteca"); if (b) b.click(); }
function renderLibTopNav() {
  const bar = document.getElementById("libTopNav");
  const box = document.getElementById("libTopNavScroll");
  if (!bar) return;
  const vista = vistaActual();
  const tramos = [];  // [texto, onClick | null]
  if (vista === "settings") tramos.push(["Ajustes", null]);
  else if (vista === "about") tramos.push(["Informacion", null]);
  else if (trashView) tramos.push(["Papelera", null]);
  else if (offlineView) tramos.push(["Sin conexion", null]);
  else if (activeColId != null && colById(activeColId)) {
    const camino = ancestorsOf(activeColId);
    camino.forEach((id, i) => tramos.push([colById(id).name, i < camino.length - 1 ? () => openCollection(id) : null]));
  }
  bar.hidden = false;
  document.body.classList.add("con-topnav");
  box.innerHTML = "";
  const raiz = document.createElement("button");
  raiz.className = "ltn-crumb ltn-root" + (tramos.length ? "" : " current");
  raiz.textContent = "/";
  raiz.title = "Biblioteca";
  raiz.setAttribute("aria-label", "Biblioteca");
  if (tramos.length) raiz.onclick = irARaiz;
  box.appendChild(raiz);
  let actual = tramos.length ? null : raiz;
  tramos.forEach(([txt, fn], i) => {
    if (i) box.appendChild(Object.assign(document.createElement("span"), { className: "ltn-slash", textContent: "/" }));
    const b = document.createElement("button");
    b.className = "ltn-crumb" + (fn ? "" : " current");
    b.textContent = txt;
    if (fn) b.onclick = fn; else { b.setAttribute("aria-current", "page"); actual = b; }
    box.appendChild(b);
  });
  // La pildora mide lo que muestra (crece o se achica animada, ver main.css).
  // Si la ruta no entra, llega al maximo y se desliza lo justo para que se vea
  // la actual.
  const ultimo = box.lastElementChild;
  const pad = parseFloat(getComputedStyle(box).paddingLeft) || 0;
  const necesita = Math.ceil(ultimo.offsetLeft - box.firstElementChild.offsetLeft + ultimo.offsetWidth + pad * 2 + 2);
  const maximo = window.innerWidth - 2 * (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-bar-side")) || 16);
  bar.style.width = Math.max(necesita, bar.offsetHeight) + "px";
  bar.classList.toggle("desborda", necesita > maximo);
  requestAnimationFrame(() => {
    const fin = actual ? actual.offsetLeft - box.firstElementChild.offsetLeft + actual.offsetWidth + pad + 16 : 0;
    box.scrollLeft = Math.max(0, fin - box.clientWidth);
  });
}

// ── Books ─────────────────────────────────────────────────────────────────────
function renderBooks(filter) {
  renderLibTopNav();
  filter = (filter || "").toLowerCase();
  const container = document.getElementById("booksContainer");
  const empty = document.getElementById("emptyState");

  if (!container) { console.error("booksContainer no encontrado"); return; }

  const source = offlineView ? books.filter(b => offlineIds.has(b.id)) : books;
  const filtered = source.filter(b => b.title.toLowerCase().includes(filter));

  if (!filtered.length) {
    // El encabezado se muestra igual: una subcarpeta vacia tiene que dejar
    // volver hacia arriba, y la papelera vacia dice que esta vacia.
    animateOut(container, () => {
      container.innerHTML = "";
      const head = makeViewHead();
      if (head) container.appendChild(head);
      animateIn(container);
    });
    const txt = document.getElementById("emptyStateText");
    const btn = document.getElementById("btnUploadEmpty");
    if (txt) txt.textContent = offlineView ? "No guardaste ningun libro para leer sin conexion"
      : trashView ? "La papelera esta vacia"
      : filter ? "Ningun libro coincide con la busqueda"
      : activeColId != null ? "Esta coleccion esta vacia"
      : "No hay libros todavia";
    if (btn) btn.style.display = (offlineView || trashView) ? "none" : "";
    empty.style.display = "flex";
    return;
  }
  empty.style.display = "none";

  // Capturar el render en una funcion y ejecutar con animacion
  function doPopulate() {
    container.innerHTML = "";

  if (activeColId == null && !offlineView && !trashView) {
    // Seccion Ultimos leidos
    if (recentBooks.length > 0 && !filter) {
      const rh = document.createElement("p");
      rh.className = "section-title"; rh.textContent = "Ultimos leidos";
      container.appendChild(rh);
      const rrow = document.createElement("div"); rrow.className = "books-row";
      recentBooks.forEach(b => rrow.appendChild(makeCard(b)));
      container.appendChild(rrow);
    }
    // Agrupar por coleccion de primer nivel, cada una en fila horizontal
    const byCol = {};
    const order = [];
    filtered.forEach(b => {
      const k = b.group_name || b.collection_name || "Sin coleccion";
      if (!byCol[k]) { byCol[k] = []; order.push(k); }
      byCol[k].push(b);
    });
    order.forEach(col => {
      const h = document.createElement("p");
      h.className = "section-title";
      h.textContent = col;
      container.appendChild(h);
      const row = document.createElement("div");
      row.className = "books-row";
      byCol[col].forEach(b => row.appendChild(makeCard(b)));
      container.appendChild(row);
    });
  } else {
    // Dentro de una coleccion (o Sin conexion, o Papelera) no hay filas por
    // coleccion que separar: se muestra todo en una grilla que ocupa el ancho
    // disponible. En una coleccion entran tambien sus subcarpetas, mezcladas.
    const head = makeViewHead();
    if (head) container.appendChild(head);
    const grid = document.createElement("div");
    grid.className = "books-grid";
    filtered.forEach(b => grid.appendChild(makeCard(b)));
    container.appendChild(grid);
  }
  } // fin doPopulate

  animateOut(container, function() {
    doPopulate();
    animateIn(container);
  });
}


function animateOut(el, cb) {
  el.style.transition = "opacity .18s ease, transform .18s ease";
  el.style.opacity = "0";
  el.style.transform = "translateY(6px)";
  setTimeout(cb, 180);
}

function animateIn(el) {
  el.style.transition = "none";
  el.style.opacity = "0";
  el.style.transform = "translateY(6px)";
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      el.style.transition = "opacity .25s ease, transform .25s ease";
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    });
  });
}

function makeCard(book) {
  const card = document.createElement("div");
  card.className = "book-card";

  const coverDiv = document.createElement("div");
  coverDiv.className = "book-cover";

  if (book.has_cover) {
    const img = document.createElement("img");
    img.alt = ""; img.loading = "lazy";
    img.onerror = function() {
      coverDiv.style.background = book.cover_color;
      coverDiv.innerHTML = "";
      coverDiv.appendChild(makePlaceholder(book.format));
      coverDiv.appendChild(makeOverlay(book));
    };
    img.src = "/api/books/" + book.id + "/cover";
    coverDiv.appendChild(img);
  } else {
    coverDiv.style.background = book.cover_color;
    coverDiv.appendChild(makePlaceholder(book.format));
  }

  // Indicador de "disponible sin conexion"
  if (offlineIds.has(book.id)) {
    const badge = document.createElement("div");
    badge.className = "offline-badge";
    badge.title = "Disponible sin conexion";
    badge.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 14.9A5 5 0 0 1 7 6a6 6 0 0 1 11.6 2A4.5 4.5 0 0 1 20 15"/><polyline points="9 15 11 17 15 12"/></svg>';
    coverDiv.appendChild(badge);
  }

  // Cuanto le queda: en la papelera hasta borrarse, en Temporal hasta irse
  // a la papelera.
  const vence = book.trash_expires_at || book.temp_expires_at;
  if (vence) {
    const n = daysLeft(vence);
    const badge = document.createElement("div");
    badge.className = "expire-badge" + (n <= 3 ? " soon" : "");
    badge.title = book.trash_expires_at ? "Se borra en " + daysText(n) : "Pasa a la papelera en " + daysText(n);
    badge.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
    badge.appendChild(document.createTextNode(n === 0 ? "hoy" : n + " d"));
    coverDiv.appendChild(badge);
  }

  coverDiv.appendChild(makeOverlay(book));
  card.appendChild(coverDiv);
  card.addEventListener("click", () => {
    if (book.trash_expires_at) openTrashItem(book);
    else window.location.href = "/read/" + book.id;
  });
  return card;
}

function makeOverlay(book) {
  const overlay = document.createElement("div");
  overlay.className = "book-overlay";

  // Titulo
  const title = document.createElement("div");
  title.className = "overlay-title";
  title.textContent = book.title;
  overlay.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "overlay-meta";

  // Tipo de archivo
  const rowFmt = document.createElement("div");
  rowFmt.className = "overlay-row";
  rowFmt.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
    '<span class="overlay-badge">' + book.format + '</span>';
  meta.appendChild(rowFmt);

  // Ultima vez abierto + paginas (se cargan async)
  const rowDate = document.createElement("div");
  rowDate.className = "overlay-row";
  rowDate.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span class="overlay-last-read">-</span>';
  meta.appendChild(rowDate);

  const rowPages = document.createElement("div");
  rowPages.className = "overlay-row";
  rowPages.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg><span class="overlay-pages">-</span>';
  meta.appendChild(rowPages);

  // Barra de progreso
  const progBar = document.createElement("div");
  progBar.className = "overlay-progress-bar";
  const progFill = document.createElement("div");
  progFill.className = "overlay-progress-fill";
  progFill.style.width = "0%";
  progBar.appendChild(progFill);
  meta.appendChild(progBar);

  overlay.appendChild(meta);

  // Cargar datos async cuando el hover ocurre (una sola vez)
  let loaded = false;
  const coverDiv = overlay.parentElement || { addEventListener: ()=>{} };

  const totalPages = book.page_count || 0;
  // Mostrar total de paginas inmediatamente
  if (totalPages > 0) rowPages.querySelector(".overlay-pages").textContent = totalPages + " pags";
  // Fecha si viene del endpoint recent
  if (book.last_read) rowDate.querySelector(".overlay-last-read").textContent = formatDate(book.last_read);

  // Cargar progreso inmediatamente (no esperar hover — en mobile no hay hover).
  // Lo mejor entre la copia local y lo que trajo la lista (el ultimo lugar
  // leido en cualquier dispositivo), sin un pedido por tarjeta.
  Promise.resolve(Progress.peek(book.id, book.progress))
    .then(res => {
      const p = (res && res.data) || {};
      if (res && res.ts) rowDate.querySelector(".overlay-last-read").textContent = formatDate(new Date(res.ts).toISOString().slice(0, 19));
      else if (!book.last_read) rowDate.querySelector(".overlay-last-read").textContent = "Nunca abierto";

      const total = (p.total && p.total > 1) ? p.total : totalPages;
      if (p.page && total) {
        rowPages.querySelector(".overlay-pages").textContent = "Pag " + p.page + " / " + total;
        progFill.style.width = Math.round((p.page / total) * 100) + "%";
      } else if (p.percentage != null) {
        const pct = Math.round(p.percentage * 100);
        progFill.style.width = pct + "%";
        rowPages.querySelector(".overlay-pages").textContent = pct + "% leido";
      }
    }).catch(() => {});

  return overlay;
}

function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso.replace(" ", "T") + "Z");
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return "Hace un momento";
  if (diff < 3600) return "Hace " + Math.floor(diff/60) + " min";
  if (diff < 86400) return "Hace " + Math.floor(diff/3600) + " h";
  if (diff < 86400*7) return "Hace " + Math.floor(diff/86400) + " dias";
  return d.toLocaleDateString("es-AR", { day:"numeric", month:"short" });
}

function makePlaceholder(fmt) {
  const div = document.createElement("div");
  div.className = "book-cover-placeholder";
  div.innerHTML =
    "<svg width='30' height='30' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5'>" +
    "<path d='M4 19.5A2.5 2.5 0 0 1 6.5 17H20'/>" +
    "<path d='M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'/></svg>" +
    "<span class='fmt'>" + fmt + "</span>";
  return div;
}

// ── Views ─────────────────────────────────────────────────────────────────────


var renamingColId = null;

function openRenameCol(id, currentName) {
  renamingColId = id;
  document.getElementById("renameColInput").value = currentName;
  openModal("modalRenameCol");
  setTimeout(() => {
    var inp = document.getElementById("renameColInput");
    inp.focus(); inp.select();
  }, 80);
}

async function confirmRenameCol() {
  var name = document.getElementById("renameColInput").value.trim();
  if (!name || !renamingColId) return;
  var res = await fetch("/api/collections/" + renamingColId, {
    method: "PATCH",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ name: name })
  });
  if (res.ok) {
    closeModal("modalRenameCol");
    await refresh();
    toast("Coleccion renombrada");
  } else {
    var err = await res.json();
    toast(err.error || "Error al renombrar");
  }
}

function updateBookCount() {
  var el = document.getElementById('totalBooksCount');
  if (!el) return;
  // book_count es recursivo: se suman solo las de primer nivel.
  var total = collections.reduce(function(acc, c) { return acc + (c.parent_id == null ? c.book_count || 0 : 0); }, 0);
  el.textContent = total;
}

// Que vista se esta mostrando. No habia forma de preguntarlo: setView solo
// cambiaba displays. El panel "Mas" lo necesita para marcar la fila activa.
function vistaActual() {
  if (document.getElementById("viewAbout").style.display === "none" &&
      document.getElementById("viewSettings").style.display === "none") return "biblioteca";
  return document.getElementById("viewAbout").style.display !== "none" ? "about" : "settings";
}

function setView(view) {
  document.getElementById("viewBiblioteca").style.display = view === "biblioteca" ? "" : "none";
  document.getElementById("viewAbout").style.display     = view === "about"       ? "" : "none";
  document.getElementById("viewSettings").style.display  = view === "settings"    ? "" : "none";
  // La topbar dice donde estas: tambien en Ajustes e Informacion.
  if (view !== "biblioteca") renderLibTopNav();
}

function setNavActive(id) {
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document.querySelectorAll(".col-item").forEach(n => n.classList.remove("active"));
}

async function loadAbout() {
  const data = await (await fetch("/api/about")).json();
  const labels = {
    python:"Python", flask:"Flask", werkzeug:"Werkzeug",
    pymupdf:"PyMuPDF", pillow:"Pillow", sqlite:"SQLite",
    platform:"Sistema", uploads_dir:"Carpeta uploads",
    data_dir:"Carpeta data", db_path:"Base de datos", covers_dir:"Portadas"
  };
  document.getElementById("aboutContent").innerHTML = Object.entries(data).map(([k,v]) =>
    "<div class='about-card'><div class='about-card-label'>" + (labels[k]||k) +
    "</div><div class='about-card-value'>" + String(v).replace(/</g,"&lt;") + "</div></div>"
  ).join("");
}

// ── Events ────────────────────────────────────────────────────────────────────
function bindEvents() {
  document.getElementById("sidebarLogo").addEventListener("click", async () => { setNavActive("navBiblioteca"); setView("biblioteca"); document.getElementById("topbarTitle").textContent = "Biblioteca"; activeColId = null; trashView = false; await refresh(); });
  document.getElementById("navBiblioteca").addEventListener("click", async () => {
    setNavActive("navBiblioteca");
    setView("biblioteca");
    document.getElementById("topbarTitle").textContent = "Biblioteca";
    activeColId = null; trashView = false;
    await refresh();
  });
  document.getElementById("navOffline").addEventListener("click", showOfflineView);
  document.getElementById("navTrash").addEventListener("click", showTrashView);
  document.getElementById("btnTrashRestore").addEventListener("click", restoreTrashItem);
  document.getElementById("btnTrashPurge").addEventListener("click", purgeTrashItem);
  document.getElementById("btnRescan").addEventListener("click", rescanLibrary);
  document.getElementById("navAbout").addEventListener("click", () => {
    setNavActive("navAbout");
    setView("about");
    document.getElementById("topbarTitle").textContent = "About";
    loadAbout();
  });
  document.getElementById("navSettings").addEventListener("click", () => {
    setNavActive("navSettings");
    setView("settings");
    document.getElementById("topbarTitle").textContent = "Ajustes";
  });

  // Search expandible
  const btnSearch   = document.getElementById("btnSearch");
  const searchExpand = document.getElementById("searchExpand");
  const searchInput = document.getElementById("searchInput");

  btnSearch.addEventListener("click", function(e) {
    e.stopPropagation();
    const isOpen = searchExpand.classList.contains("open");
    if (isOpen) {
      searchExpand.classList.remove("open");
      searchInput.value = "";
      renderBooks("");
    } else {
      searchExpand.classList.add("open");
      setTimeout(() => searchInput.focus(), 310);
    }
  });

  searchInput.addEventListener("input", e => renderBooks(e.target.value));
  searchInput.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      searchExpand.classList.remove("open");
      searchInput.value = "";
      renderBooks("");
    }
  });

  document.addEventListener("click", e => {
    if (!e.target.closest(".search-wrap") && searchExpand.classList.contains("open")) {
      if (!searchInput.value) {
        searchExpand.classList.remove("open");
        renderBooks("");
      }
    }
  });

  // Boton subir — expandir label al hover ya lo hace CSS, no necesita JS
  

  // Upload
  document.getElementById("btnUpload").addEventListener("click",      () => openModal("modalUpload"));
  document.getElementById("btnUploadEmpty").addEventListener("click",  () => openModal("modalUpload"));
  document.getElementById("btnNewCol").addEventListener("click",       openNewColModal);

  const dz = document.getElementById("dropZone");
  const fi = document.getElementById("fileInput");
  dz.addEventListener("click",     () => fi.click());
  fi.addEventListener("change",    e  => { pendingFiles = Array.from(e.target.files); updateDropZoneLabel(); });
  dz.addEventListener("dragover",  e  => { e.preventDefault(); dz.classList.add("dragover"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("dragover"));
  dz.addEventListener("drop",      e  => {
    e.preventDefault(); dz.classList.remove("dragover");
    pendingFiles = Array.from(e.dataTransfer.files); updateDropZoneLabel();
  });

  document.getElementById("btnDoUpload").addEventListener("click",  doUpload);
  document.getElementById("btnCreateCol").addEventListener("click", createCollection);
  document.getElementById("newColName").addEventListener("keydown", e => { if (e.key === "Enter") createCollection(); });

  // Notificaciones
  document.getElementById("btnNotif").addEventListener("click", () => {
    loadNotifications();
    if (window.innerWidth <= 640) openNotifSheet();
    else openModal("modalNotif");
  });
  document.getElementById("shareCollectionSelect").addEventListener("change", e => {
    document.getElementById("shareNewColInput").style.display = (e.target.value === "__new__") ? "" : "none";
  });
  document.getElementById("btnAcceptShare").addEventListener("click", acceptShare);

  document.querySelectorAll(".modal-close").forEach(btn =>
    btn.addEventListener("click", () => {
      if (btn.dataset.modal === "modalShareDetail") markShareSeen();
      closeModal(btn.dataset.modal);
    })
  );
  document.querySelectorAll(".modal-overlay").forEach(o =>
    o.addEventListener("click", e => {
      if (e.target === o) {
        if (o.id === "modalShareDetail") markShareSeen();
        closeModal(o.id);
      }
    })
  );
}

function updateDropZoneLabel() {
  const lbl = document.getElementById("dropZoneLabel");
  if (!lbl) return;
  lbl.textContent = pendingFiles.length
    ? pendingFiles.length + " archivo(s): " + pendingFiles.map(f => f.name).join(", ")
    : "Arrastra archivos aca";
}

async function doUpload() {
  if (!pendingFiles.length) { toast("Selecciona al menos un archivo"); return; }
  const colId  = document.getElementById("uploadCollection").value;
  if (!colId) { toast("Elegi una coleccion antes de subir"); return; }
  const prog   = document.getElementById("uploadProgress");
  const fill   = document.getElementById("progressFill");
  const status = document.getElementById("uploadStatus");
  prog.style.display = "";
  const total = pendingFiles.length;
  for (let i = 0; i < total; i++) {
    status.textContent = "Subiendo " + (i+1) + "/" + total + ": " + pendingFiles[i].name;
    fill.style.width = Math.round((i/total)*100) + "%";
    const fd = new FormData();
    fd.append("file", pendingFiles[i]);
    fd.append("collection_id", colId);
    await fetch("/api/books/upload", { method: "POST", body: fd });
  }
  fill.style.width = "100%"; status.textContent = "Listo!";
  const cnt = total; pendingFiles = []; updateDropZoneLabel();
  await refresh();
  setTimeout(() => {
    closeModal("modalUpload");
    prog.style.display = "none"; fill.style.width = "0%";
    document.getElementById("fileInput").value = "";
  }, 600);
  toast(cnt + " libro(s) subido(s)");
}

// "Dentro de" arranca en la coleccion abierta: crear una subcarpeta es lo que
// uno quiere si ya esta adentro de una.
function openNewColModal() {
  const sel = document.getElementById("newColParent");
  const parents = collections.filter(c => !c.is_root);
  sel.innerHTML = "<option value=''>Ninguna (primer nivel)</option>" + colOptionsHTML(parents, null);
  const actual = colById(activeColId);
  sel.value = actual && !actual.is_root && !offlineView && !trashView ? String(actual.id) : "";
  openModal("modalNewCol");
}

async function createCollection() {
  const name = document.getElementById("newColName").value.trim();
  if (!name) return;
  const parent = document.getElementById("newColParent").value;
  const res = await fetch("/api/collections", {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ name, parent_id: parent ? parseInt(parent, 10) : null })
  });
  if (res.ok) {
    document.getElementById("newColName").value = "";
    await refresh(); closeModal("modalNewCol"); toast("Coleccion creada");
  } else {
    const err = await res.json(); toast(err.error || "Error");
  }
}

async function rescanLibrary() {
  const btn = document.getElementById("btnRescan");
  btn.disabled = true; btn.textContent = "Releyendo...";
  try {
    const res = await fetch("/api/library/rescan", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { toast(d.error || "No se pudo releer la biblioteca"); return; }
    const partes = [["nuevos", "nuevo", "nuevos"], ["movidos", "movido", "movidos"],
                    ["actualizados", "actualizado", "actualizados"], ["quitados", "quitado", "quitados"]]
      .filter(([k]) => d[k]).map(([k, uno, varios]) => d[k] + " " + (d[k] === 1 ? uno : varios));
    toast(partes.length ? "Biblioteca: " + partes.join(", ") : "Biblioteca al dia, sin cambios");
    await refresh();
  } catch {
    toast("Sin conexion: no se pudo releer");
  } finally {
    btn.disabled = false; btn.textContent = "Releer biblioteca";
  }
}

function populateCollectionSelects() {
  ["uploadCollection","infoCollection"].forEach(id => {
    const sel = document.getElementById(id); if (!sel) return;
    const placeholder = "<option value='' disabled selected>Elegi una coleccion...</option>";
    sel.innerHTML = placeholder + colOptionsHTML(collections, null);
  });
}

// ── Notificaciones (libros recibidos de otros usuarios) ─────────────────────
// "seen" es solo un flag para el contador de nuevas — una notificacion
// pendiente sigue siendo aceptable aunque ya se haya visto, hasta que expire
// (7 dias desde que se recibio).
async function loadNotifications() {
  try {
    const res = await fetch("/api/notifications");
    notifications = await res.json();
  } catch (e) { return; }
  const unseenCount = notifications.filter(n => n.status === "pending" && !n.seen).length;
  const badge = document.getElementById("notifBadge");
  if (unseenCount > 0) { badge.textContent = unseenCount; badge.style.display = ""; }
  else { badge.style.display = "none"; }
  renderNotifList();
}

function renderNotifList() {
  const list = document.getElementById("notifList");
  const empty = document.getElementById("notifEmpty");
  if (!list) return;
  list.innerHTML = "";
  if (!notifications.length) { empty.style.display = ""; return; }
  empty.style.display = "none";
  notifications.forEach(n => {
    const available = !!n.book_title;
    const clickable = n.status === "pending" && available;
    const row = document.createElement("div");
    row.className = "notif-row" + (clickable && !n.seen ? " unread" : "");
    const title = n.book_title || "Libro eliminado";
    let statusHtml;
    if (n.status === "accepted") statusHtml = "<span class='notif-row-status'>Aceptado</span>";
    else if (!available) statusHtml = "<span class='notif-row-status'>Ya no disponible</span>";
    else if (!n.seen) statusHtml = "<span class='notif-row-badge'>Nuevo</span>";
    else statusHtml = "<span class='notif-row-status'>Pendiente</span>";
    row.innerHTML =
      "<div class='notif-row-info'>" +
        "<span class='notif-row-title'>" + title + "</span>" +
        "<span class='notif-row-meta'>De " + n.from_username + "</span>" +
      "</div>" + statusHtml;
    if (clickable) {
      row.style.cursor = "pointer";
      row.addEventListener("click", () => openShareDetail(n));
    }
    list.appendChild(row);
  });
}

function openShareDetail(n) {
  activeShareId = n.id;
  const available = !!n.book_title;
  document.getElementById("shareBookTitle").textContent = n.book_title || "Libro eliminado";
  document.getElementById("shareFromUser").textContent = "Enviado por " + n.from_username;
  document.getElementById("shareCoverWrap").innerHTML = (available && n.book_has_cover)
    ? "<img src='/api/notifications/" + n.id + "/cover'>" : "";
  document.getElementById("shareUnavailableMsg").style.display = available ? "none" : "";
  document.getElementById("shareColGroup").style.display = available ? "" : "none";
  document.getElementById("btnAcceptShare").style.display = available ? "" : "none";

  const sel = document.getElementById("shareCollectionSelect");
  const placeholder = "<option value='' disabled selected>Elegi una coleccion...</option>";
  sel.innerHTML = placeholder + colOptionsHTML(collections, null) + "<option value='__new__'>+ Nueva coleccion</option>";
  document.getElementById("shareNewColInput").style.display = "none";
  document.getElementById("shareNewColInput").value = "";

  closeModal("modalNotif");
  openModal("modalShareDetail");
}

async function acceptShare() {
  const sel = document.getElementById("shareCollectionSelect");
  const newColInput = document.getElementById("shareNewColInput");
  const body = {};
  if (sel.value === "__new__") {
    const name = newColInput.value.trim();
    if (!name) { toast("Poné un nombre para la coleccion"); return; }
    body.new_collection_name = name;
  } else if (sel.value) {
    body.collection_id = sel.value;
  } else {
    toast("Elegi una coleccion antes de aceptar");
    return;
  }
  const res = await fetch("/api/notifications/" + activeShareId + "/accept", {
    method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body)
  });
  const data = await res.json();
  if (res.ok) {
    toast("Libro agregado a tu biblioteca");
    activeShareId = null;
    closeModal("modalShareDetail");
    await refresh();
  } else {
    toast(data.error || "Error");
    if (res.status === 410) { activeShareId = null; closeModal("modalShareDetail"); }
  }
  await loadNotifications();
}

// Se llama al cerrar el modal de "libro recibido" sin aceptar (X o click afuera):
// solo marca que ya se vio (para el contador), sigue pudiendose aceptar despues.
async function markShareSeen() {
  if (!activeShareId) return;
  const id = activeShareId;
  activeShareId = null;
  await fetch("/api/notifications/" + id + "/seen", { method: "POST" });
  await loadNotifications();
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).style.display = "flex";
  if (id === "modalUpload") {
    const sel = document.getElementById("uploadCollection");
    if (sel) sel.value = "";
  }
}
function closeModal(id) {
  document.getElementById(id).style.display = "none";
  // En mobile el contenido de "Subir" vive dentro del panel que crece desde la
  // pildora, no del modal: doUpload cierra por aca al terminar, asi que el
  // panel tiene que enterarse. Devolver los nodos lo hace el onClose del panel.
  if (id === "modalUpload" && document.getElementById("navSheet")) closeNavSheet();
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2800);
}

function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  // Desde /sw.js (raiz) el alcance es toda la app; desde /static/js/ solo
  // podria controlar esa carpeta y el modo sin conexion no funcionaria.
  navigator.serviceWorker.register("/sw.js").catch(() => {});
  // Limpiar registros viejos con alcance /static/js/ (version anterior).
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => { if (r.scope.indexOf("/static/js/") !== -1) r.unregister(); });
  }).catch(() => {});
}

// ── Bottom nav mobile ─────────────────────────────────────────────────────────
function initBottomNav() {
  const isMobile = () => window.innerWidth <= 640;

  // ── Resaltado deslizante ────────────────────────────────────────────────
  // Se posiciona leyendo cual .bn-item tiene .active, en vez de que cada lugar
  // que cambia de seccion tenga que acordarse de moverlo tambien: la clase se
  // pone y se saca desde media docena de sitios distintos. Un MutationObserver
  // sobre la barra los cubre a todos, incluidos los que aun no existen.
  function syncNavIndicator() {
    const ind = document.getElementById("bnIndicator");
    if (!ind) return;
    const items = [...document.querySelectorAll(".bn-item")];
    const i = items.findIndex(b => b.classList.contains("active"));
    // Sin seccion activa (p. ej. al abrir una coleccion suelta) el resaltado se
    // esconde en vez de quedar apuntando a cualquier lado.
    ind.style.opacity = i < 0 ? "0" : "1";
    if (i < 0 || !items.length) return;
    ind.style.left = "calc(" + (i / items.length) * 100 + "% + 6px)";
    ind.style.width = "calc(" + 100 / items.length + "% - 12px)";
  }

  initPasswordForm();

  const nav = document.getElementById("bottomNav");
  if (nav) {
    new MutationObserver(syncNavIndicator)
      .observe(nav, { attributes: true, attributeFilter: ["class"], subtree: true });
    syncNavIndicator();
    window.addEventListener("resize", syncNavIndicator);
  }

  function setActive(id) {
    document.querySelectorAll(".bn-item").forEach(b => b.classList.remove("active"));
    const el = document.getElementById(id);
    if (el) el.classList.add("active");
  }

  const bnBib = document.getElementById("bnBiblioteca");
  const bnCol = document.getElementById("bnColecciones");
  const bnUp  = document.getElementById("bnUploadMobile");
  const bnBus = document.getElementById("bnSearchMobile");
  const bnMas = document.getElementById("bnMore");

  if (!bnBib) return;

  bnBib.addEventListener("click", async () => {
    setActive("bnBiblioteca");
    setNavActive("navBiblioteca");
    setView("biblioteca");
    document.getElementById("topbarTitle").textContent = "Biblioteca";
    activeColId = null; trashView = false;
    await refresh();
  });

  bnCol.addEventListener("click", () => {
    setActive("bnColecciones");
    // En mobile abrir un sheet de colecciones
    openMobileColSheet();
  });

  bnUp.addEventListener("click", () => {
    openUploadSheet();
  });

  bnBus.addEventListener("click", () => toggleLibSearch());
  bnMas.addEventListener("click", () => openMoreSheet());
}

// ── Buscador de la biblioteca ────────────────────────────────────────────────
// Misma barra que el lector (.nav-search): sale de atras de la pildora. El
// input real se MUEVE aca desde la topbar y vuelve al cerrar, asi el handler
// de "input" que filtra los libros sigue siendo el mismo.
function toggleLibSearch(forzar) {
  const bar = document.getElementById("libSearchBar");
  const slot = document.getElementById("libSearchSlot");
  const input = document.getElementById("searchInput");
  if (!bar || !slot || !input) return;
  const abrir = forzar === undefined ? !bar.classList.contains("open") : forzar;

  if (abrir) {
    closeNavSheet();
    slot.appendChild(input);
    bar.classList.add("open");
    setTimeout(() => input.focus(), 120);
  } else {
    bar.classList.remove("open");
    // Solo re-renderizar si habia algo escrito: cerrar el buscador vacio no
    // tiene por que repintar la grilla entera, que se veia como una recarga.
    const habia = input.value.trim() !== "";
    input.value = "";
    if (habia) renderBooks("");
    input.blur();
    // Devolverlo a la topbar recien cuando termino de salir, para que no se
    // vea desaparecer del medio de la barra.
    setTimeout(() => {
      const wrap = document.getElementById("searchExpand");
      if (wrap && input.parentNode === slot) wrap.appendChild(input);
    }, 340);
  }
}

// ── Panel "Mas" de la biblioteca ─────────────────────────────────────────────
// Recibe lo que dejo de tener la topbar (notificaciones, cerrar sesion) y lo
// que salio de la barra (About, Ajustes): son consultas ocasionales, no algo
// que uno haga a cada rato.
function openMoreSheet() {
  const ICO = {
    notif: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    info:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    set:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9V12z"/></svg>',
    out:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  };
  const s = openNavSheet(body => {

    // Notificaciones: el contador del boton original se replica como detalle.
    const badge = document.getElementById("notifBadge");
    const sinVer = badge && badge.style.display !== "none" ? badge.textContent.trim() : null;
    body.appendChild(navSheetRow({
      label: "Notificaciones", icon: ICO.notif, detail: sinVer, active: !!sinVer,
      onClick: () => { s.close(); setTimeout(() => document.getElementById("btnNotif").click(), NAV_SHEET_CLOSE_MS); },
    }));

    body.appendChild(navSheetRow({
      label: "Informacion", icon: ICO.info, active: vistaActual() === "about",
      onClick: () => {
        s.close();
        document.querySelectorAll(".bn-item").forEach(b => b.classList.remove("active"));
        setNavActive("navAbout"); setView("about"); loadAbout();
      },
    }));

    body.appendChild(navSheetRow({
      label: "Ajustes", icon: ICO.set, active: vistaActual() === "settings",
      onClick: () => {
        s.close();
        document.querySelectorAll(".bn-item").forEach(b => b.classList.remove("active"));
        setNavActive("navSettings"); setView("settings");
      },
    }));

    body.appendChild(Object.assign(document.createElement("div"), { className: "nav-sheet-sep" }));
    body.appendChild(navSheetRow({
      label: "Cerrar sesion", icon: ICO.out,
      onClick: () => { window.location.href = "/logout"; },
    }));
  });
}

// ── Notificaciones en panel ──────────────────────────────────────────────────
// Mismo criterio que el resto en mobile: crece desde la pildora en vez de
// aparecer como una hoja desde abajo. Se mueven los nodos del modal adentro y
// se devuelven al cerrar, asi loadNotifications() sigue pintando sobre los
// mismos elementos y los handlers de cada notificacion no se tocan.
function openNotifSheet() {
  const inner  = document.querySelector("#modalNotif .modal");
  const header = inner.querySelector(".modal-header");
  const movidos = [...inner.children].filter(el => el !== header);

  openNavSheet(body => {
    const head = document.createElement("div");
    head.className = "nav-sheet-title";
    head.innerHTML = "<span>Notificaciones</span>";
    body.appendChild(head);
    movidos.forEach(el => body.appendChild(el));
  }, () => {
    movidos.forEach(el => inner.appendChild(el));
  });
}

// ── Cambio de contrasena ─────────────────────────────────────────────────────
function initPasswordForm() {
  const form = document.getElementById("formPassword");
  if (!form) return;
  const err = document.getElementById("pwError");
  const btn = document.getElementById("btnCambiarPw");

  const mostrar = (msg, ok) => {
    err.textContent = msg;
    err.className = ok ? "ajuste-ok" : "ajuste-error";
    err.style.display = msg ? "" : "none";
  };

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const actual  = document.getElementById("pwActual").value;
    const nueva   = document.getElementById("pwNueva").value;
    const repetir = document.getElementById("pwRepetir").value;

    // Se valida aca lo que se puede para no ir al servidor al pedo; el resto
    // (que la actual sea correcta) solo lo puede decir el servidor.
    if (nueva !== repetir)  return mostrar("Las dos contrasenas nuevas no coinciden");
    if (nueva.length < 6)   return mostrar("La contrasena nueva debe tener al menos 6 caracteres");

    btn.disabled = true;
    mostrar("");
    try {
      const res = await fetch("/api/me/password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current: actual, new: nueva }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        form.reset();
        mostrar("Contrasena actualizada", true);
        toast("Contrasena actualizada");
      } else {
        mostrar(data.error || "No se pudo cambiar la contrasena");
      }
    } catch {
      mostrar("Sin conexion: no se pudo cambiar la contrasena");
    } finally {
      btn.disabled = false;
    }
  });
}


// Subir: mismo panel. En vez de duplicar el formulario, se MUEVEN los nodos
// del modal adentro y se devuelven al cerrar — asi los handlers enganchados por
// id (dropZone, fileInput, btnDoUpload, el progreso) siguen funcionando tal
// cual, y en desktop el modal queda intacto.
function openUploadSheet() {
  const inner  = document.querySelector("#modalUpload .modal");
  const header = inner.querySelector(".modal-header");
  const movidos = [...inner.children].filter(el => el !== header);
  const sel = document.getElementById("uploadCollection");
  // A donde va: arranca en la coleccion donde se esta parado (o la raiz). El
  // select nativo queda escondido y el arbol lo mantiene al dia (doUpload lo
  // sigue leyendo de ahi).
  const raiz = collections.find(c => c.is_root);
  const actual = !offlineView && !trashView && colById(activeColId) ? activeColId : (raiz && raiz.id);
  if (sel) sel.value = actual != null ? String(actual) : "";
  const picker = colPicker({ collections, selected: actual, onChange: id => { if (sel) sel.value = String(id); } });

  openNavSheet(body => {
    const head = document.createElement("div");
    head.className = "nav-sheet-title";
    head.innerHTML = "<span>Subir libro</span>";
    body.appendChild(head);
    movidos.forEach(el => body.appendChild(el));
    const boton = document.getElementById("btnDoUpload");
    body.insertBefore(Object.assign(document.createElement("div"), { className: "nav-sheet-section", textContent: "Coleccion" }), boton);
    body.insertBefore(picker.el, boton);
  }, () => {
    // Siguen referenciados aunque el panel ya no este en el DOM.
    movidos.forEach(el => inner.appendChild(el));
  });
}

// Colecciones: panel que crece desde la pildora (ver openNavSheet). Las
// colecciones van en arbol con el mismo trazo curvo que el sidebar: tocar el
// nombre abre la coleccion (y cierra el panel); la flechita de al lado
// despliega sus subcarpetas sin cerrarlo.
function openMobileColSheet() {
  const ICO_ALL = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>';
  const ICO_OFF = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h.01"/><path d="M8.5 16.4a5 5 0 0 1 7 0"/><path d="M5 12.9a10 10 0 0 1 14 0"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';
  const ICO_TRASH = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
  const ICO_COL = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
  const ICO_TEMP = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
  const ICO_CHEV = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 6 15 12 9 18"/></svg>';

  // Arranca desplegado el camino hasta la coleccion abierta.
  const abiertas = new Set(activeColId != null && !offlineView && !trashView ? ancestorsOf(activeColId) : []);
  const salirDeEspeciales = () => document.querySelectorAll(".bn-item").forEach(b => b.classList.remove("active"));

  const s = openNavSheet(body => {
    const head = document.createElement("div");
    head.className = "nav-sheet-title";
    head.innerHTML = "<span>Colecciones</span>";
    const nueva = document.createElement("button");
    nueva.textContent = "+ Nueva";
    nueva.style.cssText = "background:var(--accent);color:#fff;border:none;border-radius:999px;padding:.35rem .8rem;font-size:.78rem;cursor:pointer";
    nueva.onclick = () => { closeNavSheet(); setTimeout(openNewColModal, NAV_SHEET_CLOSE_MS); };
    head.appendChild(nueva);
    body.appendChild(head);

    body.appendChild(navSheetRow({
      label: "Todos los libros", icon: ICO_ALL,
      active: !offlineView && !trashView && activeColId === null,
      onClick: async () => {
        s.close();
        offlineView = false; trashView = false; activeColId = null;
        document.getElementById("topbarTitle").textContent = "Biblioteca";
        setNavActive("navBiblioteca");
        setView("biblioteca");
        const bib = document.getElementById("bnBiblioteca");
        if (bib) bib.click();
      },
    }));

    // "Sin conexion" no entra en los 5 slots de la barra, asi que vive aca.
    body.appendChild(navSheetRow({
      label: "Sin conexion", icon: ICO_OFF, active: offlineView,
      onClick: async () => { s.close(); salirDeEspeciales(); await showOfflineView(); },
    }));
    const n = collections.length ? collections[0].trash_count || 0 : 0;
    body.appendChild(navSheetRow({
      label: "Papelera", icon: ICO_TRASH, active: trashView, detail: n ? String(n) : undefined,
      onClick: async () => { s.close(); salirDeEspeciales(); await showTrashView(); },
    }));

    if (collections.length) body.appendChild(Object.assign(document.createElement("div"), { className: "nav-sheet-sep" }));

    const tree = document.createElement("div");
    tree.className = "nav-tree";
    body.appendChild(tree);

    const build = (parent, cols) => cols.forEach(c => {
      const kids = childrenOf(c.id);
      const node = document.createElement("div");
      node.className = "tree-node";
      const rowWrap = document.createElement("div");
      rowWrap.className = "tree-row";
      const row = navSheetRow({
        label: c.name, icon: c.is_temp ? ICO_TEMP : ICO_COL, detail: String(c.book_count || 0),
        active: !offlineView && !trashView && activeColId === c.id,
        onClick: () => { s.close(); salirDeEspeciales(); openCollection(c.id); },
      });
      rowWrap.appendChild(row);
      const hijas = () => {
        const sub = document.createElement("div");
        sub.className = "tree-children";
        build(sub, kids);
        return sub;
      };
      if (kids.length) {
        const chev = document.createElement("button");
        const pintarChev = () => {
          chev.className = "tree-chev" + (abiertas.has(c.id) ? " open" : "");
          chev.setAttribute("aria-label", (abiertas.has(c.id) ? "Plegar " : "Desplegar ") + c.name);
        };
        pintarChev();
        chev.innerHTML = ICO_CHEV;
        // Solo cambia esta carpeta, animada: rehacer el arbol lo haria saltar.
        chev.onclick = () => {
          if (abiertas.has(c.id)) {
            abiertas.delete(c.id);
            const sub = node.querySelector(":scope > .tree-children:not(.closing)");
            if (sub) { sub.classList.add("closing"); treeClose(sub); }
          } else {
            abiertas.add(c.id);
            const sub = hijas();
            node.appendChild(sub);
            treeOpen(sub);
          }
          pintarChev();
        };
        rowWrap.appendChild(chev);
      }
      node.appendChild(rowWrap);
      if (kids.length && abiertas.has(c.id)) node.appendChild(hijas());
      parent.appendChild(node);
    });
    build(tree, topLevel());
  });
}

// Auto-init bottom nav
function _originalInit() {}
init();

// Scroll horizontal con mouse wheel sobre las filas
document.addEventListener('wheel', function(e) {
  const row = e.target.closest('.books-row');
  if (!row) return;
  if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return; // ya es scroll horizontal
  e.preventDefault();
  row.scrollBy({ left: e.deltaY * 2.5, behavior: 'smooth' });
}, { passive: false });

// Scroll sidebar -> content con inercia suave
(function() {
  var velocity = 0;
  var rafId = null;
  var lastTime = 0;

  function getContent() { return document.querySelector('.content'); }

  function animate(now) {
    var c = getContent(); if (!c) return;
    if (!lastTime) lastTime = now;
    var dt = Math.min(now - lastTime, 50);
    lastTime = now;
    velocity *= Math.pow(0.92, dt / 16);
    c.scrollTop += velocity * (dt / 16);
    if (Math.abs(velocity) > 0.2) {
      rafId = requestAnimationFrame(animate);
    } else { velocity = 0; rafId = null; lastTime = 0; }
  }

  document.addEventListener('DOMContentLoaded', function() {
    var sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      sidebar.addEventListener('wheel', function(e) {
        e.preventDefault();
        velocity += e.deltaY * 0.35;
        velocity = Math.max(-40, Math.min(40, velocity));
        if (!rafId) { lastTime = 0; rafId = requestAnimationFrame(animate); }
      }, { passive: false });
    }

    // Fade-out suave antes de cerrar sesion
    document.querySelectorAll('a[href="/logout"]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        document.body.classList.add('logging-out');
        setTimeout(function () { window.location.href = link.href; }, 220);
      });
    });
  });
})();
