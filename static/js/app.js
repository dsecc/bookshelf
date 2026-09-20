
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

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  // refresh() va aparte: sin conexion sus fetch pueden fallar, y si eso corta
  // el init la UI queda sin ningun handler enganchado (nada clickeable).
  try { await refresh(); } catch (e) { console.error("refresh error:", e); }
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
    fetchJSON("/api/books" + (activeColId != null ? "?collection_id=" + activeColId : ""), books),
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

// ── Sidebar ───────────────────────────────────────────────────────────────────
function renderSidebar() {
  const list = document.getElementById("colList");
  list.innerHTML = "";
  collections.forEach(c => {
    const li = document.createElement("li");
    li.className = "col-item" + (activeColId === c.id ? " active" : "");

    const span = document.createElement("span");
    span.textContent = c.name;
    span.style.flex = "1";

    const badge = document.createElement("span");
    badge.className = "col-count";
    badge.textContent = c.book_count || 0;

    const editBtn = document.createElement("button");
    editBtn.className = "col-edit";
    editBtn.title = "Renombrar coleccion";
    editBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    editBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      openRenameCol(c.id, c.name);
    });

    li.appendChild(span);
    li.appendChild(badge);
    li.appendChild(editBtn);

    li.addEventListener("click", async () => {
      offlineView = false;
      activeColId = c.id;
      document.getElementById("topbarTitle").textContent = c.name;
      document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
      document.querySelectorAll(".col-item").forEach(n => n.classList.remove("active"));
      li.classList.add("active");
      setView("biblioteca");
      const res = await fetch("/api/books?collection_id=" + c.id);
      books = await res.json();
      renderBooks();
    });
    list.appendChild(li);
  });
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
  offlineView = true;
  activeColId = null;
  setNavActive("navOffline");
  setView("biblioteca");
  document.getElementById("topbarTitle").textContent = "Sin conexion";
  await loadOfflineIds();
  // Si no hay red, books puede venir del cache del service worker.
  books = await fetchJSON("/api/books", books);
  renderBooks();
}

// ── Books ─────────────────────────────────────────────────────────────────────
function renderBooks(filter) {
  filter = (filter || "").toLowerCase();
  const container = document.getElementById("booksContainer");
  const empty = document.getElementById("emptyState");

  if (!container) { console.error("booksContainer no encontrado"); return; }

  const source = offlineView ? books.filter(b => offlineIds.has(b.id)) : books;
  const filtered = source.filter(b => b.title.toLowerCase().includes(filter));

  if (!filtered.length) {
    animateOut(container, () => { container.innerHTML = ""; });
    const txt = document.getElementById("emptyStateText");
    const btn = document.getElementById("btnUploadEmpty");
    if (txt) txt.textContent = offlineView
      ? "No guardaste ningun libro para leer sin conexion"
      : "No hay libros todavia";
    if (btn) btn.style.display = offlineView ? "none" : "";
    empty.style.display = "flex";
    return;
  }
  empty.style.display = "none";

  // Capturar el render en una funcion y ejecutar con animacion
  function doPopulate() {
    container.innerHTML = "";

  if (activeColId == null && !offlineView) {
    // Seccion Ultimos leidos
    if (recentBooks.length > 0 && !filter) {
      const rh = document.createElement("p");
      rh.className = "section-title"; rh.textContent = "Ultimos leidos";
      container.appendChild(rh);
      const rrow = document.createElement("div"); rrow.className = "books-row";
      recentBooks.forEach(b => rrow.appendChild(makeCard(b)));
      container.appendChild(rrow);
    }
    // Agrupar por coleccion, cada una en fila horizontal
    const byCol = {};
    const order = [];
    filtered.forEach(b => {
      const k = b.collection_name || "Sin coleccion";
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
    const row = document.createElement("div");
    row.className = "books-row";
    filtered.forEach(b => row.appendChild(makeCard(b)));
    container.appendChild(row);
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

  coverDiv.appendChild(makeOverlay(book));
  card.appendChild(coverDiv);
  card.addEventListener("click", () => { window.location.href = "/read/" + book.id; });
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

  // Cargar progreso inmediatamente (no esperar hover — en mobile no hay hover)
  const dev = localStorage.getItem("bs_device_id") || "default";
  fetch("/api/books/" + book.id + "/progress?device_id=" + dev)
    .then(r => r.json())
    .then(p => {
      if (p.updated_at) rowDate.querySelector(".overlay-last-read").textContent = formatDate(p.updated_at);
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
  // Total real desde todas las colecciones
  var total = collections.reduce(function(acc, c) { return acc + (c.book_count || 0); }, 0);
  el.textContent = total;
}

function setView(view) {
  document.getElementById("viewBiblioteca").style.display = view === "biblioteca" ? "" : "none";
  document.getElementById("viewAbout").style.display     = view === "about"       ? "" : "none";
  document.getElementById("viewSettings").style.display  = view === "settings"    ? "" : "none";
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
  document.getElementById("sidebarLogo").addEventListener("click", async () => { setNavActive("navBiblioteca"); setView("biblioteca"); document.getElementById("topbarTitle").textContent = "Biblioteca"; activeColId = null; await refresh(); });
  document.getElementById("navBiblioteca").addEventListener("click", async () => {
    setNavActive("navBiblioteca");
    setView("biblioteca");
    document.getElementById("topbarTitle").textContent = "Biblioteca";
    activeColId = null;
    await refresh();
  });
  document.getElementById("navOffline").addEventListener("click", showOfflineView);
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
  document.getElementById("btnNewCol").addEventListener("click",       () => openModal("modalNewCol"));

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
    openModal("modalNotif");
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

async function createCollection() {
  const name = document.getElementById("newColName").value.trim();
  if (!name) return;
  const res = await fetch("/api/collections", {
    method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({name})
  });
  if (res.ok) {
    document.getElementById("newColName").value = "";
    await refresh(); closeModal("modalNewCol"); toast("Coleccion creada");
  } else {
    const err = await res.json(); toast(err.error || "Error");
  }
}

function populateCollectionSelects() {
  ["uploadCollection","infoCollection"].forEach(id => {
    const sel = document.getElementById(id); if (!sel) return;
    const placeholder = "<option value='' disabled selected>Elegi una coleccion...</option>";
    sel.innerHTML = placeholder + collections.map(c =>
      "<option value='" + c.id + "'>" + c.name + "</option>"
    ).join("");
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
  sel.innerHTML = placeholder + collections.map(c =>
    "<option value='" + c.id + "'>" + c.name + "</option>"
  ).join("") + "<option value='__new__'>+ Nueva coleccion</option>";
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
  const bnAb  = document.getElementById("bnAbout");
  const bnSet = document.getElementById("bnSettings");

  if (!bnBib) return;

  bnBib.addEventListener("click", async () => {
    setActive("bnBiblioteca");
    setNavActive("navBiblioteca");
    setView("biblioteca");
    document.getElementById("topbarTitle").textContent = "Biblioteca";
    activeColId = null;
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

  bnAb.addEventListener("click", () => {
    setActive("bnAbout");
    setNavActive("navAbout");
    setView("about");
    document.getElementById("topbarTitle").textContent = "About";
    loadAbout();
  });

  bnSet.addEventListener("click", () => {
    setActive("bnSettings");
    setNavActive("navSettings");
    setView("settings");
    document.getElementById("topbarTitle").textContent = "Ajustes";
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
  if (sel) sel.value = "";

  openNavSheet(body => {
    const head = document.createElement("div");
    head.className = "nav-sheet-title";
    head.innerHTML = "<span>Subir libro</span>";
    body.appendChild(head);
    movidos.forEach(el => body.appendChild(el));
  }, () => {
    // Siguen referenciados aunque el panel ya no este en el DOM.
    movidos.forEach(el => inner.appendChild(el));
  });
}

// Colecciones: panel que crece desde la pildora (ver openNavSheet).
function openMobileColSheet() {
  const ICO_ALL = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>';
  const ICO_OFF = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h.01"/><path d="M8.5 16.4a5 5 0 0 1 7 0"/><path d="M5 12.9a10 10 0 0 1 14 0"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';
  const ICO_COL = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';

  const s = openNavSheet(body => {
    const head = document.createElement("div");
    head.className = "nav-sheet-title";
    head.innerHTML = "<span>Colecciones</span>";
    const nueva = document.createElement("button");
    nueva.textContent = "+ Nueva";
    nueva.style.cssText = "background:var(--accent);color:#fff;border:none;border-radius:999px;padding:.35rem .8rem;font-size:.78rem;cursor:pointer";
    nueva.onclick = () => { closeNavSheet(); setTimeout(() => openModal("modalNewCol"), NAV_SHEET_CLOSE_MS); };
    head.appendChild(nueva);
    body.appendChild(head);

    body.appendChild(navSheetRow({
      label: "Todos los libros", icon: ICO_ALL,
      active: !offlineView && activeColId === null,
      onClick: async () => {
        s.close();
        offlineView = false; activeColId = null;
        document.getElementById("topbarTitle").textContent = "Biblioteca";
        setNavActive("navBiblioteca");
        setView("biblioteca");
        const bib = document.getElementById("bnBiblioteca");
        if (bib) bib.click();
        const res = await fetch("/api/books");
        books = await res.json();
        renderBooks();
      },
    }));

    // "Sin conexion" no entra en los 5 slots de la barra, asi que vive aca.
    body.appendChild(navSheetRow({
      label: "Sin conexion", icon: ICO_OFF, active: offlineView,
      onClick: async () => {
        s.close();
        document.querySelectorAll(".bn-item").forEach(b => b.classList.remove("active"));
        await showOfflineView();
      },
    }));

    if (collections.length) body.appendChild(Object.assign(document.createElement("div"), { className: "nav-sheet-sep" }));

    collections.forEach(c => {
      body.appendChild(navSheetRow({
        label: c.name, icon: ICO_COL, detail: String(c.book_count || 0),
        active: !offlineView && activeColId === c.id,
        onClick: async () => {
          s.close();
          offlineView = false; activeColId = c.id;
          document.getElementById("topbarTitle").textContent = c.name;
          setView("biblioteca");
          document.querySelectorAll(".bn-item").forEach(b => b.classList.remove("active"));
          const res = await fetch("/api/books?collection_id=" + c.id);
          books = await res.json();
          renderSidebar();
          renderBooks();
        },
      }));
    });
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
