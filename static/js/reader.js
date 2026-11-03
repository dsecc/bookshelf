// Bookshelf Reader — completo
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

const bookId  = parseInt(window.location.pathname.split("/").pop());
const deviceId = localStorage.getItem("bs_device_id") || "default";
const DPR     = window.devicePixelRatio || 1;

let currentBook = null, collections = [];
let pdfDoc = null, pdfTotal = 1, pdfPage = 1;
let viewMode = "scroll", currentZoom = "auto";
let epubRendition = null;
let searchMatches = [], searchIdx = 0;
let isFullscreen = false;
const esMovil = () => window.innerWidth <= 640;

// ── Pildora del lector ───────────────────────────────────────────────────────
// Una sola barra abajo, en PC y en el celu (en la PC con todo: titulo, pagina
// y herramientas). Lo que no entra crece desde ella: info y ajustes,
// bookmarks, enviar, eliminar. Mismos iconos en las dos.
const _svg = (body, w) => '<svg width="' + (w || 18) + '" height="' + (w || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' + body + '</svg>';
const RN_ICO = {
  list:   _svg('<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>'),
  down:   _svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
  share:  _svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>'),
  send:   _svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/>'),
  user:   _svg('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  off:    _svg('<path d="M12 13v8"/><path d="M4 14.9A5 5 0 0 1 7 6a6 6 0 0 1 11.6 2A4.5 4.5 0 0 1 20 15"/><polyline points="8 17 12 21 16 17"/>'),
  offOk:  _svg('<path d="M4 14.9A5 5 0 0 1 7 6a6 6 0 0 1 11.6 2A4.5 4.5 0 0 1 20 15"/><polyline points="9 15 11 17 15 12"/>'),
  trash:  _svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
  folder: _svg('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'),
  clock:  _svg('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
  bm:     _svg('<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>'),
  bmPlus: _svg('<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/><path d="M12 7v6M9 10h6"/>'),
  pencil: _svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>', 16),
  scroll: _svg('<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 7h4M10 11h4M10 15h4"/>'),
  spread: _svg('<path d="M2 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2z"/><path d="M22 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z"/>'),
  chev:   _svg('<polyline points="9 6 15 12 9 18"/>', 16),
  fs:     _svg('<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>', 23),
  fsExit: _svg('<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>', 23),
  x:      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  check:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg>',
};

const _el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const _delegar = fn => () => { closeNavSheet(); setTimeout(fn, NAV_SHEET_CLOSE_MS); };

// ── Info y ajustes ───────────────────────────────────────────────────────────
// Crece desde la pildora. En la PC va en dos columnas (el libro a la izquierda,
// la coleccion a la derecha); en el celu, una debajo de la otra.
function openInfoSheet() {
  let quitarOffline = null;
  openNavSheet(body => {
    body.classList.add("info-sheet");
    const cols = _el("div", "info-cols");
    const izq = _el("div", "info-col");
    const der = _el("div", "info-col");
    cols.append(izq, der);

    // Titulo: texto con un lapicito. El lapiz lo vuelve campo; Enter o salir
    // del campo guarda, Escape cancela.
    const tit = _el("div", "info-title");
    const pintarTitulo = () => {
      tit.innerHTML = "";
      tit.appendChild(_el("span", "info-title-text", currentBook ? currentBook.title : ""));
      const lapiz = _el("button", "info-icon-btn");
      lapiz.innerHTML = RN_ICO.pencil;
      lapiz.title = "Cambiar el nombre";
      lapiz.setAttribute("aria-label", "Cambiar el nombre");
      lapiz.onclick = editarTitulo;
      tit.appendChild(lapiz);
    };
    const editarTitulo = () => {
      tit.innerHTML = "";
      const campo = _el("div", "nav-sheet-field info-title-edit");
      const inp = document.createElement("input");
      inp.value = currentBook.title;
      inp.setAttribute("aria-label", "Nombre del libro");
      const ok = _el("button");
      ok.innerHTML = RN_ICO.check;
      ok.setAttribute("aria-label", "Guardar nombre");
      let hecho = false;
      const guardar = async () => {
        if (hecho) return; hecho = true;
        await renameBook(inp.value);
        pintarTitulo();
      };
      inp.onkeydown = e => {
        if (e.key === "Enter") guardar();
        if (e.key === "Escape") { hecho = true; e.stopPropagation(); pintarTitulo(); }
      };
      // mousedown y no click: si no, el blur del campo guarda antes.
      ok.onmousedown = e => { e.preventDefault(); guardar(); };
      inp.onblur = guardar;
      campo.append(inp, ok);
      tit.appendChild(campo);
      inp.focus(); inp.select();
    };
    pintarTitulo();
    izq.appendChild(tit);

    // Modo de lectura: solo PDF, y solo en la PC (en el celu siempre scroll).
    if (pdfDoc && !esMovil()) {
      izq.appendChild(_el("div", "nav-sheet-section", "Lectura"));
      const seg = _el("div", "nav-sheet-seg info-modes");
      [["scroll", "Scroll", RN_ICO.scroll], ["spread", "Doble pagina", RN_ICO.spread]].forEach(([modo, label, ico]) => {
        const b = _el("button", "vm-btn" + (viewMode === modo ? " active" : ""));
        b.innerHTML = ico;
        b.appendChild(_el("span", null, label));
        b.onclick = async () => {
          if (viewMode === modo) return;
          seg.querySelectorAll(".vm-btn").forEach(x => x.classList.toggle("active", x === b));
          await setViewMode(modo);
        };
        seg.appendChild(b);
      });
      izq.appendChild(seg);
    }

    // Acciones
    izq.appendChild(_el("div", "nav-sheet-section", "Libro"));
    if ("caches" in window) {
      const fila = navSheetRow({ label: "Guardar sin conexion", icon: RN_ICO.off, detail: "", onClick: () => toggleOffline() });
      const est = fila.querySelector(".row-count");
      if (est) est.className = "row-state";
      const pintar = () => {
        fila.classList.toggle("active", _offline.saved);
        fila.querySelector("svg").outerHTML = _offline.saved ? RN_ICO.offOk : RN_ICO.off;
        fila.querySelector(".row-label").textContent = _offline.busy ? "Guardando..." : _offline.saved ? "Disponible sin conexion" : "Guardar sin conexion";
        fila.querySelector(".row-state").textContent = _offline.saved ? "Guardado" : "";
      };
      _offlineSubs.add(pintar);
      quitarOffline = () => _offlineSubs.delete(pintar);
      pintar();
      izq.appendChild(fila);
    }
    izq.appendChild(navSheetRow({ label: "Enviar a otro usuario", icon: RN_ICO.send, onClick: _delegar(openSendSheet) }));
    izq.appendChild(navSheetRow({ label: "Descargar", icon: RN_ICO.down, onClick: () => { closeNavSheet(); downloadBook(); } }));
    izq.appendChild(navSheetRow({ label: "Compartir", icon: RN_ICO.share, onClick: () => { closeNavSheet(); shareBook(); } }));
    izq.appendChild(_el("div", "nav-sheet-sep"));
    const del = navSheetRow({ label: "Eliminar libro", icon: RN_ICO.trash, onClick: _delegar(openDeleteSheet) });
    del.classList.add("danger");
    izq.appendChild(del);

    der.appendChild(_el("div", "nav-sheet-section", "Coleccion"));
    der.appendChild(buildColPicker());

    body.appendChild(cols);
  }, () => { if (quitarOffline) quitarOffline(); });
}

// Selector de coleccion con el arbol de la biblioteca: arranca desplegado solo
// el camino hasta donde esta el libro. Tocar una la elige y despliega sus
// subcarpetas (animado); Guardar mueve el libro.
function buildColPicker() {
  const wrap = _el("div", "col-picker");
  const tree = _el("div", "nav-tree");
  const pie = _el("div", "col-picker-foot");
  const btn = _el("button", "col-picker-save", "Mover aca");
  pie.appendChild(btn);

  const byId = id => collections.find(c => c.id === id);
  const hijas = id => colTree(collections).filter(x => x.c.parent_id === id).map(x => x.c);
  const camino = id => { const out = []; for (let c = byId(id); c; c = c.parent_id != null ? byId(c.parent_id) : null) out.unshift(c.id); return out; };
  const actual = currentBook.collection_id;
  const abiertas = new Set(camino(actual));
  let elegida = actual;

  const pintarPie = () => {
    const c = byId(elegida);
    const cambia = elegida !== actual;
    btn.disabled = !cambia;
    btn.textContent = cambia ? "Mover a " + (c ? c.name : "") : "Esta en " + ((byId(actual) || {}).name || "Sin coleccion");
  };

  const build = (parent, cols) => cols.forEach(c => {
    const kids = hijas(c.id);
    const node = _el("div", "tree-node");
    const rowWrap = _el("div", "tree-row");
    const row = navSheetRow({
      label: c.name, icon: c.is_temp ? RN_ICO.clock : RN_ICO.folder,
      detail: c.id === actual ? "actual" : undefined,
      active: c.id === elegida,
      onClick: () => {
        elegida = c.id;
        tree.querySelectorAll(".nav-sheet-row.active").forEach(r => r.classList.remove("active"));
        row.classList.add("active");
        // Elegir una con subcarpetas las despliega (si ya estaban, quedan).
        if (kids.length && !abiertas.has(c.id)) toggle();
        pintarPie();
      },
    });
    rowWrap.appendChild(row);
    const sub = () => { const s = _el("div", "tree-children"); build(s, kids); return s; };
    let chev = null;
    const toggle = () => {
      if (abiertas.has(c.id)) {
        abiertas.delete(c.id);
        const s = node.querySelector(":scope > .tree-children:not(.closing)");
        if (s) { s.classList.add("closing"); treeClose(s); }
      } else {
        abiertas.add(c.id);
        const s = sub(); node.appendChild(s); treeOpen(s);
      }
      if (chev) chev.classList.toggle("open", abiertas.has(c.id));
    };
    if (kids.length) {
      chev = _el("button", "tree-chev" + (abiertas.has(c.id) ? " open" : ""));
      chev.innerHTML = RN_ICO.chev;
      chev.setAttribute("aria-label", "Desplegar " + c.name);
      chev.onclick = toggle;
      rowWrap.appendChild(chev);
    }
    node.appendChild(rowWrap);
    if (kids.length && abiertas.has(c.id)) node.appendChild(sub());
    parent.appendChild(node);
  });
  build(tree, colTree(collections).filter(x => x.depth === 0).map(x => x.c));

  btn.onclick = async () => {
    if (elegida === actual) return;
    btn.disabled = true;
    const res = await fetch("/api/books/" + bookId, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection_id: elegida }),
    });
    if (!res.ok) { toast("No se pudo mover"); pintarPie(); return; }
    currentBook.collection_id = elegida;
    toast("Movido a " + byId(elegida).name);
    closeNavSheet();
  };
  pintarPie();
  wrap.append(tree, pie);
  return wrap;
}

// Enviar a otro usuario: la lista de usuarios en el panel, un toque envia.
async function openSendSheet() {
  let users;
  try { users = await (await fetch("/api/users")).json(); }
  catch { toast("Sin conexion: no se pueden cargar los usuarios"); return; }
  openNavSheet(body => {
    const head = _el("div", "nav-sheet-title");
    head.appendChild(_el("span", null, "Enviar a otro usuario"));
    body.appendChild(head);
    if (!users.length) { body.appendChild(_el("div", "nav-sheet-empty", "No hay otros usuarios todavia")); return; }
    users.forEach(u => body.appendChild(navSheetRow({
      label: u.username, icon: RN_ICO.user,
      onClick: async () => {
        closeNavSheet();
        const res = await fetch("/api/books/" + bookId + "/share", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to_user_id: u.id }),
        });
        const data = await res.json().catch(() => ({}));
        toast(res.ok ? "Enviado a " + u.username : (data.error || "No se pudo enviar"));
      },
    })));
  });
}

function openDeleteSheet() {
  openNavSheet(body => {
    const head = _el("div", "nav-sheet-title");
    head.appendChild(_el("span", null, "Eliminar libro"));
    body.appendChild(head);
    body.appendChild(_el("div", "nav-sheet-note", "Va a la papelera: ahi se puede restaurar durante 30 dias, despues se borra solo."));
    const si = navSheetRow({
      label: "Mover a la papelera", icon: RN_ICO.trash,
      onClick: async () => { await fetch("/api/books/" + bookId, { method: "DELETE" }); window.location.href = "/"; },
    });
    si.classList.add("danger");
    body.appendChild(si);
    body.appendChild(navSheetRow({ label: "Cancelar", icon: RN_ICO.x, onClick: () => closeNavSheet() }));
  });
}

function downloadBook() { window.open("/api/books/" + bookId + "/file?download=1"); }

async function shareBook() {
  const url = window.location.origin + "/read/" + bookId;
  if (navigator.share) { try { await navigator.share({ title: currentBook.title, url }); return; } catch {} }
  try { await navigator.clipboard.writeText(url); }
  catch { const ta = document.createElement("textarea"); ta.value = url; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
  toast("Link copiado");
}

// ── Bookmarks en mobile ──────────────────────────────────────────────────────
// El boton de la pildora abre un panel chico con las dos acciones. "Nuevo"
// saca una barra de escribir igual al buscador (de atras de la pildora, sube
// con el teclado); "Ver" abre la lista en el mismo panel que crece de la barra.
function openBookmarkMenu() {
  const delegar = fn => () => { closeNavSheet(); setTimeout(fn, NAV_SHEET_CLOSE_MS); };
  openNavSheet(body => {
    const head = document.createElement("div");
    head.className = "nav-sheet-title";
    head.innerHTML = "<span>Bookmarks</span>";
    body.appendChild(head);
    body.appendChild(navSheetRow({
      label: "Nuevo bookmark", icon: RN_ICO.bmPlus,
      detail: _bmLabel(_bmHere()) || undefined,
      onClick: delegar(() => toggleBookmarkBar(true)),
    }));
    body.appendChild(navSheetRow({
      label: "Ver bookmarks", icon: RN_ICO.list,
      detail: String(_bookmarks.length),
      onClick: delegar(openBookmarksSheet),
    }));
  });
}

function openBookmarksSheet() {
  openNavSheet(body => {
    const head = document.createElement("div");
    head.className = "nav-sheet-title";
    head.innerHTML = "<span>Bookmarks</span>";
    body.appendChild(head);

    const vacio = () => {
      const d = document.createElement("div");
      d.className = "nav-sheet-empty";
      d.textContent = "Todavia no hay bookmarks en este libro";
      body.appendChild(d);
    };
    if (!_bookmarks.length) vacio();

    _bookmarks.forEach(bm => {
      const pos = _bmPos(bm);
      // La fila es un <button>; el borrar no puede ir adentro (boton dentro de
      // boton es HTML invalido y Safari lo saca afuera), va al costado.
      const item = document.createElement("div");
      item.className = "nav-sheet-item";
      const fila = navSheetRow({
        label: bm.label || "Bookmark", icon: RN_ICO.bm,
        detail: _bmLabel(pos),
        active: !!pdfDoc && pos.page === pdfPage,
        onClick: () => { closeNavSheet(); irABookmark(pos); },
      });
      const del = document.createElement("button");
      del.className = "nav-sheet-del";
      del.setAttribute("aria-label", "Borrar bookmark");
      del.innerHTML = RN_ICO.x;
      del.onclick = async () => {
        await borrarBookmark(bm.id);
        item.remove();
        if (!_bookmarks.length) vacio();
      };
      item.appendChild(fila);
      item.appendChild(del);
      body.appendChild(item);
    });

    body.appendChild(Object.assign(document.createElement("div"), { className: "nav-sheet-sep" }));
    body.appendChild(navSheetRow({
      label: "Nuevo bookmark", icon: RN_ICO.bmPlus,
      onClick: () => { closeNavSheet(); setTimeout(() => toggleBookmarkBar(true), NAV_SHEET_CLOSE_MS); },
    }));
  });
}

function toggleBookmarkBar(forzar) {
  const bar = document.getElementById("bmBarReader");
  if (!bar) return;
  const abrir = forzar === undefined ? !bar.classList.contains("open") : forzar;
  const input = document.getElementById("bmBarInput");
  if (abrir) {
    toggleSearchBar(false);
    input.value = "";
    input.placeholder = pdfDoc ? "Bookmark en la pagina " + pdfPage
      : _text ? "Bookmark en el " + _bmLabel(_bmHere()) : "Nombre del bookmark";
  }
  bar.classList.toggle("open", abrir);
  if (abrir) input.focus(); else input.blur();
}

// ── Barra de busqueda ────────────────────────────────────────────────────────
// Sale de DETRAS de la pildora (una clase mueve su transform), en PC y en el
// celu: es la misma pieza.
function toggleSearchBar(forzar) {
  const bar = document.getElementById("searchBarReader");
  if (!bar) return;
  const abrir = forzar === undefined ? !bar.classList.contains("open") : forzar;
  if (abrir) { closeNavSheet(); toggleBookmarkBar(false); }
  bar.classList.toggle("open", abrir);
  if (abrir) document.getElementById("searchTextInput").focus();
  else       document.getElementById("searchTextInput").blur();
}

// ── El teclado no puede tapar la barra ───────────────────────────────────────
// visualViewport se encoge cuando aparece el teclado; la diferencia contra
// innerHeight es cuanto ocupa. Se publica como --kb-offset y la pildora, el
// panel y la busqueda lo suman a su separacion del borde.
function initKeyboardOffset() {
  const vv = window.visualViewport;
  if (!vv) return;
  const sync = () => {
    const tapado = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    // Umbral: cambios chicos son la barra de direcciones, no el teclado.
    document.documentElement.style.setProperty("--kb-offset", (tapado > 120 ? tapado : 0) + "px");
  };
  vv.addEventListener("resize", sync);
  vv.addEventListener("scroll", sync);
  sync();
}

// Esconder las pildoras para leer sin nada encima: la de abajo se va hacia
// abajo y la topbar flotante (si hay) hacia arriba, con la opacidad
// acompanando. En el celu lo dispara el doble tap; en la PC, el mouse quieto
// en pantalla completa.
let _rnHidden = false;
function setReaderNavHidden(ocultar) {
  if (ocultar === _rnHidden) return;
  _rnHidden = ocultar;
  if (ocultar) { closeNavSheet(); toggleSearchBar(false); toggleBookmarkBar(false); }
  const t = "transform .32s var(--nav-ease), opacity .24s var(--nav-ease)";
  const nav = document.getElementById("readerNav");
  if (nav) {
    nav.style.transition = t;
    nav.style.transform = ocultar ? "translateY(calc(100% + var(--nav-bar-bottom) + 16px))" : "";
    nav.style.opacity = ocultar ? "0" : "";
    nav.style.pointerEvents = ocultar ? "none" : "";
  }
  const top = document.getElementById("readerTopNav");
  if (top) {
    top.style.transition = t;
    top.style.transform = ocultar ? "translateY(calc(-100% - var(--top-nav-top) - 16px))" : "";
    top.style.opacity = ocultar ? "0" : "";
    top.style.pointerEvents = ocultar ? "none" : "";
  }
  document.body.classList.toggle("nav-oculta", ocultar);
}
function _toggleReaderNav() { setReaderNavHidden(!_rnHidden); }

// ── Paginador de la pildora (PC) ─────────────────────────────────────────────
// Uno solo para todos los modos: cada modo registra como ir a una pagina y
// avisa con pagerSet cuando cambia la actual.
let _pager = null;
function pagerUse(p) {
  _pager = p;
  const box = document.getElementById("rnPager");
  box.hidden = !p;
  if (!p) return;
  document.getElementById("rnPageInput").hidden = !!p.label;
  document.getElementById("rnZoom").hidden = !p.zoom;
  if (p.zoom) pagerZoomLabel();
}
function pagerSet(page, total) {
  const inp = document.getElementById("rnPageInput");
  if (document.activeElement !== inp) inp.value = page;
  inp.style.width = (String(total).length + 1.2) + "ch";
  document.getElementById("rnPageTotal").textContent = "/ " + total;
}
// Para los que no tienen paginas (EPUB): un texto en lugar del numero.
function pagerText(txt) { document.getElementById("rnPageTotal").textContent = txt; }

const ZOOM_STEPS = ["0.6", "0.75", "1", "1.25", "1.5", "2"];
function pagerZoomLabel() {
  document.getElementById("rnZoomLabel").textContent =
    currentZoom === "auto" ? "Auto" : Math.round(parseFloat(currentZoom) * 100) + "%";
}
function pagerZoom(dir) {
  if (!_pager || !_pager.zoom) return;
  let z;
  if (dir === 0) z = "auto";
  else {
    const cur = currentZoom === "auto" ? 1 : parseFloat(currentZoom);
    const i = ZOOM_STEPS.findIndex(s => parseFloat(s) >= cur - 0.001);
    const base = i < 0 ? ZOOM_STEPS.length - 1 : i;
    const j = dir > 0 ? (parseFloat(ZOOM_STEPS[base]) > cur + 0.001 ? base : base + 1) : base - 1;
    z = ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, j))];
  }
  currentZoom = z;
  pagerZoomLabel();
  _pager.zoom(z);
}

function initReaderNav() {
  const nav = document.getElementById("readerNav");
  if (!nav) return;
  document.getElementById("rnBack").onclick   = () => { window.location.href = "/"; };
  document.getElementById("rnSearch").onclick = () => toggleSearchBar();
  // Con la barra de bookmark abierta, el mismo boton la cierra. Si no: en el
  // celu, el menu de nuevo / ver; en la PC, directo la lista (que abajo tiene
  // "Nuevo bookmark"): un solo boton para las dos cosas.
  document.getElementById("rnBookmark").onclick = () => {
    const bmBar = document.getElementById("bmBarReader");
    if (bmBar && bmBar.classList.contains("open")) { toggleBookmarkBar(false); return; }
    toggleSearchBar(false);
    if (esMovil()) openBookmarkMenu(); else openBookmarksSheet();
  };
  document.getElementById("bmBarSave").onclick = () => saveBookmark(document.getElementById("bmBarInput").value);
  document.getElementById("bmBarInput").onkeydown = e => {
    if (e.key === "Enter") saveBookmark(e.target.value);
    if (e.key === "Escape") toggleBookmarkBar(false);
  };
  document.getElementById("rnMore").onclick       = () => openInfoSheet();
  document.getElementById("rnFullscreen").onclick = () => toggleFullscreen();

  // Paginador
  const inp = document.getElementById("rnPageInput");
  document.getElementById("rnPrev").onclick = () => _pager && _pager.step(-1);
  document.getElementById("rnNext").onclick = () => _pager && _pager.step(1);
  inp.onfocus = () => inp.select();
  inp.onkeydown = e => {
    if (e.key === "Enter") {
      const v = parseInt(inp.value, 10);
      if (_pager && v >= 1 && v <= pdfTotal) _pager.go(v);
      inp.blur();
    }
    if (e.key === "Escape") { inp.value = pdfPage; inp.blur(); }
  };
  inp.onblur = () => { inp.value = pdfPage; };
  document.getElementById("rnZoomOut").onclick   = () => pagerZoom(-1);
  document.getElementById("rnZoomIn").onclick    = () => pagerZoom(1);
  document.getElementById("rnZoomLabel").onclick = () => pagerZoom(0);
}

// Letra, tamaño y tema de los textos viven en la pildora (PC) o en la topbar
// flotante (celu): el mismo nodo se muda segun el ancho.
function placeTextCtl() {
  const ctl = document.getElementById("textCtl");
  const top = document.getElementById("readerTopNav");
  if (!ctl || ctl.hidden) { if (top) top.hidden = true; return; }
  if (esMovil()) {
    if (ctl.parentNode !== top) top.appendChild(ctl);
    top.hidden = false;
  } else {
    const centro = document.getElementById("rnCenter");
    if (ctl.parentNode !== centro) centro.appendChild(ctl);
    top.hidden = true;
  }
  document.body.classList.toggle("con-topnav", !top.hidden);
}
window.addEventListener("resize", placeTextCtl);

async function init() {
  try {
    const [bookRes, colRes] = await Promise.all([
      fetch("/api/books/" + bookId),
      fetch("/api/collections")
    ]);
    currentBook = await bookRes.json();
    collections = await colRes.json();
    // Desde v1.15 solo hay Scroll y Doble: un libro guardado en Pagina o
    // Libro abre en Scroll.
    viewMode = currentBook.view_mode === "spread" ? "spread" : "scroll";
    // En mobile se lee siempre en scroll. Si el libro quedo guardado en otro
    // modo desde la compu, aca se ignora: sin selector no habria como salir.
    // No se persiste, para que en desktop siga abriendo como lo dejaste.
    if (esMovil()) viewMode = "scroll";

    document.getElementById("readerTitle").textContent = currentBook.title;
    document.getElementById("readerTitle").title = currentBook.title;
    document.title = currentBook.title;

    // En mobile el lector arranca SIEMPRE a pantalla completa. Ademas de ser
    // lo que uno quiere al abrir un libro, evita el problema de fondo: entrar
    // o salir de fullscreen cambia el padding del contenedor (8px), y ese
    // cambio de ancho disparaba un re-render de todas las paginas que te movia
    // del punto donde estabas leyendo. Aplicandolo antes de medir, el ancho se
    // calcula una sola vez con el layout definitivo y no hay re-render nunca.
    if (window.innerWidth <= 640) {
      document.body.classList.add("reader-fullscreen");
      isFullscreen = true;
    }

    const fmt = currentBook.format.toUpperCase();
    if (fmt === "PDF") await initPDF();
    else if (fmt === "EPUB") initEPUB();
    else if (fmt === "TXT" || fmt === "MD") await initText(fmt);
    else initUnsupported();
  } catch (e) {
    // Tipicamente: sin conexion y este libro no se guardo para offline.
    console.error("No se pudo abrir el libro:", e);
    showLoadError();
  }
  // Siempre se enganchan los handlers, aunque el libro no haya cargado: si no,
  // ni el boton de volver funciona.
  bindAll();
  initReaderNav();
  initKeyboardOffset();
  loadBookmarks();
  refreshOfflineBtn();
  placeTextCtl();
  syncLupaBtn();
  updateFullscreenBtn();
}

// Pantalla de error legible en vez de un lector en blanco.
function showLoadError() {
  ["pdfScrollViewer","pdfPageViewer","pdfBookViewer","pdfSpreadViewer","epubViewer"]
    .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = "none"; });
  const v = document.getElementById("unsupportedViewer");
  if (!v) return;
  const msg = v.querySelector("p");
  if (msg) msg.textContent = navigator.onLine
    ? "No se pudo abrir este libro."
    : "Este libro no esta guardado para leer sin conexion.";
  const btn = document.getElementById("btnDownloadUnsupported");
  if (btn) { btn.textContent = "Volver a la biblioteca"; btn.onclick = () => { window.location.href = "/"; }; }
  v.style.display = "flex";
  const title = document.getElementById("readerTitle");
  if (title && title.textContent === "Cargando...") title.textContent = "No disponible";
}

// ── DPR-aware render ──────────────────────────────────────────────────────────
// "margin" es el margen visual que se le descuenta al contenedor. El modo
// scroll ya calcula su ancho exacto (computeAvailW descuenta el padding real)
// y pasa 0; los otros modos pasan el ancho crudo y usan el default de 32.
async function renderPageToCanvas(pageObj, canvas, containerW, containerH, forceScale, margin) {
  const vp0 = pageObj.getViewport({ scale: 1 });
  const m = (margin == null) ? 32 : margin;
  let scale;
  if (forceScale) {
    scale = forceScale;
  } else if (currentZoom !== "auto") {
    scale = parseFloat(currentZoom);
  } else {
    const availW = Math.max(containerW - m, 100);
    if (containerH && containerH > 100) {
      scale = Math.min(availW / vp0.width, (containerH - m) / vp0.height);
    } else {
      scale = availW / vp0.width;
    }
  }
  const vp = pageObj.getViewport({ scale: scale * DPR });
  canvas.width  = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  canvas.style.width  = Math.floor(vp0.width  * scale) + "px";
  canvas.style.height = Math.floor(vp0.height * scale) + "px";
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  await pageObj.render({ canvasContext: ctx, viewport: vp }).promise;
  return scale;
}

// ── View mode ─────────────────────────────────────────────────────────────────
// Scroll o Doble (solo PDF). El selector esta en Info y ajustes.
async function setViewMode(mode) {
  if (!pdfDoc || (mode !== "scroll" && mode !== "spread")) return;
  // Guardar donde se esta antes de rearmar: el modo nuevo abre en esa pagina.
  if (_capturePosition) _capturePosition();
  viewMode = mode;
  fetch("/api/books/" + bookId, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ view_mode: mode })
  }).catch(() => {});
  if (window._spreadFlipInst) { try { window._spreadFlipInst.destroy(); } catch(e){} window._spreadFlipInst = null; }
  ["pdfScrollViewer", "pdfSpreadViewer"].forEach(id => { document.getElementById(id).style.display = "none"; });
  // Solo el modo scroll usa el documento como scroller (en el celu).
  // initPDFScroll la vuelve a poner si corresponde.
  document.documentElement.classList.remove("doc-scroll");
  await initPDF();
  syncLupaBtn();
}


// ── Render PDF page con text layer (permite seleccion de texto) ───────────────
async function renderPageWithTextLayer(pageObj, canvas, containerW, containerH, forceScale, margin) {
  // Renderizar canvas normalmente
  const scale = await renderPageToCanvas(pageObj, canvas, containerW, containerH, forceScale, margin);

  // Agregar text layer si el canvas tiene un contenedor .pdf-page-container
  const container = canvas.parentElement;
  if (!container || !container.classList.contains("pdf-page-container")) return scale;

  // Remover text layer anterior
  const oldLayer = container.querySelector(".textLayer");
  if (oldLayer) oldLayer.remove();

  // Crear nuevo text layer
  const textLayerDiv = document.createElement("div");
  textLayerDiv.className = "textLayer";
  // Mismas dimensiones CSS que el canvas
  textLayerDiv.style.width  = canvas.style.width  || canvas.width  + "px";
  textLayerDiv.style.height = canvas.style.height || canvas.height + "px";
  // pdf.js posiciona cada palabra con calc(var(--scale-factor) * ...) —
  // sin esto, el text layer queda mal dimensionado (gigante) y tapa toda
  // la pantalla, bloqueando los clics en la topbar y el resto de la UI.
  textLayerDiv.style.setProperty("--scale-factor", scale);
  container.appendChild(textLayerDiv);

  // Renderizar texto
  try {
    const textContent = await pageObj.getTextContent();
    const vp = pageObj.getViewport({ scale: scale });
    pdfjsLib.renderTextLayer({
      textContentSource: textContent,
      container: textLayerDiv,
      viewport: vp,
      textDivs: []
    });
  } catch(e) {
    // Si falla silenciosamente, el canvas sigue funcionando
  }

  return scale;
}

// ── PDF init ──────────────────────────────────────────────────────────────────
async function initPDF() {
  // Worker local (misma version 3.11.174 que vendor/pdf.min.js) — asi el
  // lector funciona sin internet y sin depender de un CDN externo.
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/static/js/pdf.worker.min.js";
  if (!pdfDoc) {
    pdfDoc = await pdfjsLib.getDocument("/api/books/" + bookId + "/file").promise;
    pdfTotal = pdfDoc.numPages;
  }
  const prog = await fetchProgress();
  pdfPage = prog.page || 1;
  // Desplazamiento DENTRO de la pagina guardada. Sin esto el lector volvia
  // siempre al borde superior de la pagina, o sea un poco mas arriba de donde
  // uno habia dejado la lectura.
  _pdfOffset = Number(prog.offset) || 0;
  // La misma posicion como fraccion de la pagina: los pixeles dependen del
  // ancho de la pantalla, y el progreso ahora cruza entre celu y PC.
  _pdfFrac = prog.frac != null ? Number(prog.frac) : null;
  // Solo el modo scroll re-escala al cambiar el ancho; si se cambia a otro
  // modo hay que soltar el handler viejo para no redibujar un viewer oculto.
  _scrollRerender = null;
  _flipRebuild = null;
  _capturePosition = null;
  if (viewMode === "spread") await initPDFSpread();
  else await initPDFScroll();
}

let _pdfOffset = 0, _pdfFrac = null;

// Mide y guarda la posicion exacta en el modo scroll. Los guardados van con
// debounce; al salir del lector (volver, cambiar de app, bloquear) se llama
// directo para no perder el ultimo tramo leido.
let _capturePosition = null;
Progress.onLeave(() => { if (_capturePosition) _capturePosition(); });

// ── SCROLL MODE ───────────────────────────────────────────────────────────────

// Ancho real disponible para dibujar la hoja, descontando el padding del
// contenedor. En mobile se usa todo (la hoja va de borde a borde, que es el
// punto de leer en un telefono chico); en desktop se acota a un ancho de
// lectura, porque llenar un monitor ancho deja la pagina gigante y con
// muchisimo scroll por hoja.
function computeAvailW(wrap) {
  const cs = getComputedStyle(wrap);
  const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const inner = Math.max(wrap.clientWidth - pad, 200);
  return window.innerWidth <= 640 ? inner : Math.min(inner, 900);
}

// Lo setea initPDFScroll; lo usan el resize y el toggle de fullscreen para
// re-escalar las paginas ya dibujadas. Antes availW se calculaba una unica
// vez y rotar el telefono o entrar a fullscreen no cambiaba nada.
let _scrollRerender = null;
let _scrollResizeTimer = null;

function scheduleScrollRerender(delay) {
  clearTimeout(_scrollResizeTimer);
  _scrollResizeTimer = setTimeout(() => {
    if (_scrollRerender) _scrollRerender();
    else if (_flipRebuild) _flipRebuild();
  }, delay == null ? 200 : delay);
}

window.addEventListener("resize", () => scheduleScrollRerender());
window.addEventListener("orientationchange", () => scheduleScrollRerender(350));

async function initPDFScroll() {
  const viewer = document.getElementById("pdfScrollViewer");
  viewer.style.display = "flex";
  const wrap  = document.getElementById("pdfScrollWrap");
  wrap.innerHTML = "";

  // ── Que scrollea: el documento o el contenedor ──────────────────────────
  // En mobile scrollea el DOCUMENTO. iOS recorta el pintado de un contenedor
  // con overflow propio al viewport, que en una PWA standalone es mas corto
  // que la pantalla fisica y dejaba una franja negra abajo imposible de
  // cubrir. El scroller raiz se pinta de borde a borde. En desktop se sigue
  // usando el contenedor, que es lo que quiere el layout de dos columnas.
  const docScroll = window.matchMedia("(max-width: 640px)").matches;
  document.documentElement.classList.toggle("doc-scroll", docScroll);
  const S = {
    get top() { return docScroll ? window.scrollY : wrap.scrollTop; },
    set top(v) { if (docScroll) window.scrollTo(0, v); else wrap.scrollTop = v; },
    to(v, smooth) {
      const o = { top: v, behavior: smooth ? "smooth" : "auto" };
      if (docScroll) window.scrollTo(o); else wrap.scrollTo(o);
    },
    // root:null hace que el observer mida contra el viewport.
    get root() { return docScroll ? null : wrap; },
    // offsetTop es relativo al offsetParent; con el documento scrolleando ese
    // ancestro puede no ser el wrap, asi que se mide contra el viewport.
    offsetOf(el) {
      return docScroll
        ? el.getBoundingClientRect().top + window.scrollY
        : el.offsetTop;
    },
    get viewportH() { return docScroll ? window.innerHeight : wrap.clientHeight; },
  };

  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  let availW = computeAvailW(wrap);

  const wrappers = [], canvases = [];
  const done = new Set();

  // Alto estimado de cada pagina, a partir de la proporcion de la primera.
  // Es la pieza que faltaba: sin reservar el espacio los wrappers nacen con
  // alto 0, TODOS quedan apilados en la misma posicion y el IntersectionObserver
  // los da por visibles a la vez — o sea que se renderizaba el libro entero al
  // abrir, justo lo que la carga diferida queria evitar. Ademas cada pagina que
  // aparecia empujaba a las de abajo y movia la lectura de lugar.
  let altoEstimado = 0;
  try {
    const vp = (await pdfDoc.getPage(1)).getViewport({ scale: 1 });
    altoEstimado = Math.round(availW * vp.height / vp.width);
  } catch { altoEstimado = Math.round(availW * 1.414); }  // A4 como ultimo recurso

  for (let i = 0; i < pdfTotal; i++) {
    const w = document.createElement("div");
    w.style.cssText = "display:flex;justify-content:center;width:100%;flex-shrink:0;";
    if (altoEstimado > 0) w.style.minHeight = altoEstimado + "px";
    w.dataset.page = i + 1;
    const c = document.createElement("canvas");
    // La sombra la pone el CSS (#pdfScrollWrap canvas): inline le ganaria a la
    // regla que la saca en fullscreen.
    c.style.cssText = "display:block;";
    w.appendChild(c);
    wrap.appendChild(w);
    wrappers.push(w);
    canvases.push(c);
  }

  async function renderOne(i) {
    if (done.has(i)) return;
    done.add(i);
    const page = await pdfDoc.getPage(i + 1);
    const c = canvases[i];
    // Envolver en contenedor para text layer
    if (!wrappers[i].classList.contains("pdf-page-container")) {
      wrappers[i].classList.add("pdf-page-container");
    }
    await renderPageWithTextLayer(page, c, availW, 0, null, 0);
    // Ya hay canvas: el alto real reemplaza a la reserva.
    wrappers[i].style.minHeight = "";
    paintSearchHits(i + 1, c);
  }

  const startIdx = Math.max(0, pdfPage - 1);
  await renderOne(startIdx);
  // scrollIntoView tambien puede scrollear la ventana/documento entero (no
  // solo este contenedor), tapando la topbar arriba del viewport — se
  // setea el scroll directo sobre "wrap" para que quede contenido ahi.
  // Se suma el offset guardado: volver al punto exacto, no al borde de la hoja.
  const w0 = wrappers[startIdx];
  S.top = S.offsetOf(w0) + (_pdfFrac != null && w0 ? Math.round(_pdfFrac * w0.offsetHeight) : _pdfOffset);

  // Renderizar de a poco: solo las paginas que se acercan al viewport, no
  // el documento entero de una — con libros largos, renderizar todo al
  // abrir congelaba la UI y saturaba memoria/CPU.
  const renderObserver = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) renderOne(parseInt(e.target.dataset.page) - 1); });
  }, { root: S.root, rootMargin: "1200px 0px 1200px 0px" });
  wrappers.forEach(w => renderObserver.observe(w));

  // Re-escalar cuando cambia el ancho disponible: rotar el telefono, entrar
  // o salir de fullscreen, o redimensionar la ventana.
  _scrollRerender = async () => {
    const newW = computeAvailW(wrap);
    if (Math.abs(newW - availW) < 2) return;
    availW = newW;
    done.clear();
    const center = Math.max(0, pdfPage - 1);
    for (let i = Math.max(0, center - 1); i <= Math.min(pdfTotal - 1, center + 1); i++) {
      await renderOne(i);
    }
    S.top = S.offsetOf(wrappers[center]);
  };

  let saveTimer = null;
  // Cuanto de cada pagina se ve. Hace falta el registro COMPLETO: el observer
  // solo entrega las paginas que cambiaron de estado desde el aviso anterior,
  // y elegir "la mejor de esas" daba la pagina equivocada al saltar lejos —
  // la que uno queria no habia cambiado, asi que ni figuraba en la lista.
  const visible = new Map();
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => visible.set(parseInt(e.target.dataset.page), e.intersectionRatio));
    let best = null, bestR = 0;
    visible.forEach((ratio, pag) => { if (ratio > bestR) { bestR = ratio; best = pag; } });
    if (best && bestR > 0.2) {
      const p = best;
      if (p !== pdfPage) {
        pdfPage = p; pagerSet(p, pdfTotal);
        clearTimeout(saveTimer);
        saveTimer = setTimeout(guardarPosicion, 300);
      }
    }
  }, { root: S.root, threshold: [0.2, 0.5, 0.8] });
  wrappers.forEach(w => observer.observe(w));

  // Guarda pagina + cuanto se bajo DENTRO de esa pagina.
  function guardarPosicion() {
    const w = wrappers[pdfPage - 1];
    const off = w ? Math.round(S.top - S.offsetOf(w)) : 0;
    // Puede ser negativa: la pagina "actual" es la que mas se ve, y el borde
    // de arriba de la pantalla puede estar todavia en la anterior.
    const frac = w && w.offsetHeight ? Math.min(0.9999, Math.max(-0.9999, off / w.offsetHeight)) : 0;
    saveProgress({ page: pdfPage, total: pdfTotal, offset: off, frac: Math.round(frac * 10000) / 10000 });
  }
  // El observer solo avisa al CAMBIAR de pagina; sin esto, moverse dentro de
  // una pagina larga no quedaba guardado. Guardar es solo escribir en
  // localStorage (la red va aparte), por eso el debounce puede ser corto.
  let guardarTimer = null;
  (docScroll ? window : wrap).addEventListener("scroll", () => {
    clearTimeout(guardarTimer);
    guardarTimer = setTimeout(guardarPosicion, 300);
  }, { passive: true });
  _capturePosition = guardarPosicion;

  async function goPage(p) {
    if (p < 1 || p > pdfTotal) return;
    // Esperar el render ANTES de calcular el destino: la pagina pasa del alto
    // estimado al real al dibujarse, y sin esperar el salto se calculaba con el
    // layout viejo y caia una pagina mas abajo.
    await renderOne(p - 1);
    S.to(S.offsetOf(wrappers[p - 1]), true);
  }
  window._scrollRendered = () => wrappers.map((w, i) => done.has(i) ? { page: i + 1, canvas: canvases[i] } : null).filter(Boolean);
  pagerUse({
    step: d => goPage(pdfPage + d),
    go: goPage,
    // Cambiar el zoom redibuja solo alrededor de la pagina actual; el resto se
    // redibuja al acercarse (renderObserver).
    zoom: async () => {
      done.clear();
      const center = pdfPage - 1;
      for (let i = Math.max(0, center - 2); i <= Math.min(pdfTotal - 1, center + 2); i++) await renderOne(i);
      S.top = S.offsetOf(wrappers[center]);
    },
  });
  pagerSet(pdfPage, pdfTotal);
  window._scrollGoPage = goPage;
}

// ── Voltear hoja (modo Doble) ─────────────────────────────────────────────────
// StPageFlip muestra cada hoja al tamaño exacto del marco y, en reposo, sin
// ninguna transformacion: si el marco tiene la proporcion real del PDF y el
// canvas los pixeles reales de la pantalla, la hoja se ve 1:1. Antes el marco
// era A4 fijo y el canvas se estiraba para llenarlo (borroso y deformado en
// cualquier PDF que no fuera A4), y no se volvia a dibujar al cambiar la
// ventana o el zoom del navegador.

// Lo setean los modos de voltear hoja; scheduleScrollRerender lo llama al
// cambiar la ventana o entrar/salir de fullscreen.
let _flipRebuild = null;

async function flipPageSize(maxW, maxH) {
  const vp0 = (await pdfDoc.getPage(1)).getViewport({ scale: 1 });
  const ratio = vp0.height / vp0.width;
  const pageW = Math.floor(Math.min(maxW, maxH / ratio));
  return { pageW, pageH: Math.floor(pageW * ratio) };
}

// Dibuja la hoja entera dentro del marco sin deformarla: si una hoja tiene
// otra proporcion que la primera, queda centrada en vez de estirada.
async function renderFlipPage(page, pageW, pageH) {
  const vp0 = page.getViewport({ scale: 1 });
  const s = Math.min(pageW / vp0.width, pageH / vp0.height);
  const cssW = Math.floor(vp0.width * s), cssH = Math.floor(vp0.height * s);
  // En vivo y no la constante DPR: el zoom del navegador lo cambia.
  const dpr = window.devicePixelRatio || 1;
  const c = document.createElement("canvas");
  c.width  = Math.round(cssW * dpr);
  c.height = Math.round(cssH * dpr);
  c.style.cssText = "display:block;width:" + cssW + "px;height:" + cssH + "px;margin:" +
    Math.floor((pageH - cssH) / 2) + "px auto 0;";
  const vp = page.getViewport({ scale: c.width / vp0.width });
  await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
  return c;
}

// destroy() de StPageFlip saca del DOM el contenedor que se le paso, asi que
// para volver a armar el modo hay que crearlo de nuevo.
function freshFlipContainer(wrapId, id) {
  const old = document.getElementById(id);
  if (old) old.remove();
  const el = document.createElement("div");
  el.id = id;
  document.getElementById(wrapId).appendChild(el);
  return el;
}

// Rearma el modo solo si de verdad cambio el lugar disponible o la densidad
// de pixeles (el teclado o la barra de direcciones tambien disparan resize).
function flipRebuilder(wrap, init) {
  const key = () => wrap.clientWidth + "x" + wrap.clientHeight + "@" + (window.devicePixelRatio || 1);
  const built = key();
  return () => { if (key() !== built) init(); };
}

// ── SPREAD MODE (StPageFlip doble pagina) ────────────────────────────────────
async function initPDFSpread() {
  const viewer = document.getElementById("pdfSpreadViewer");
  viewer.style.display = "flex";
  const wrap = document.getElementById("spreadWrap");
  if (window._spreadFlipInst) { try { window._spreadFlipInst.destroy(); } catch(e){} window._spreadFlipInst = null; }

  // Esperar dimensiones reales
  await new Promise(r => setTimeout(r, 100));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  const W = Math.max(wrap.clientWidth  - 32, 400);
  // El alto ya descuenta la pildora (padding del visor, ver reader.css).
  const H = Math.max(wrap.clientHeight - 24, 300);
  const { pageW, pageH } = await flipPageSize(W / 2 - 4, H);

  const container = freshFlipContainer("spreadWrap", "bookPagesContainerSpread");
  container.style.cssText = "position:relative;width:" + pageW + "px;height:" + pageH + "px;";

  const pageDivs = [];
  const rendered = new Set();

  for (let i = 1; i <= pdfTotal; i++) {
    const div = document.createElement("div");
    div.className = "spread-page-item";
    div.style.cssText = "width:" + pageW + "px;height:" + pageH + "px;background:#f5f0e8;overflow:hidden;box-sizing:border-box;";
    div.dataset.page = i;
    container.appendChild(div);
    pageDivs.push(div);
  }

  // Render una pagina (sin loop de fondo para evitar freeze)
  async function renderOne(pageNum) {
    if (rendered.has(pageNum) || pageNum < 1 || pageNum > pdfTotal) return;
    rendered.add(pageNum);
    const div = pageDivs[pageNum - 1];
    try {
      const c = await renderFlipPage(await pdfDoc.getPage(pageNum), pageW, pageH);
      div.innerHTML = "";
      div.appendChild(c);
      paintSearchHits(pageNum, c);
    } catch(e) { console.warn("spread render error p" + pageNum, e); }
  }

  // Inicializar StPageFlip
  const pf = new St.PageFlip(container, {
    width:               pageW,
    height:              pageH,
    size:                "fixed",
    drawShadow:          true,
    flippingTime:        600,
    usePortrait:         false,
    startZIndex:         0,
    autoSize:            false,
    showCover:           true,
    mobileScrollSupport: false,
  });

  pf.loadFromHTML(container.querySelectorAll(".spread-page-item"));
  window._spreadFlipInst = pf;

  // Renderizar paginas iniciales (no bloqueante)
  const prog = await fetchProgress();
  pdfPage = prog.page || 1;

  // La tapa, y el par que se ve: la actual puede caer a la derecha del par,
  // y entonces la de la izquierda es la anterior (antes quedaba en blanco).
  const initialPages = [1, 2, pdfPage - 1, pdfPage, pdfPage + 1].filter((n, i, a) => n >= 1 && n <= pdfTotal && a.indexOf(n) === i);
  for (const n of initialPages) await renderOne(n);

  if (pdfPage > 1) pf.turnToPage(pdfPage - 1);

  pagerSet(pdfPage, pdfTotal);

  const alrededor = p => [p - 1, p, p + 1, p + 2, p + 3].filter(n => n >= 1 && n <= pdfTotal).forEach(n => renderOne(n));
  pf.on("flip", e => {
    pdfPage = e.data + 1;
    pagerSet(pdfPage, pdfTotal);
    saveProgress({ page: pdfPage, total: pdfTotal });
    alrededor(pdfPage);
  });
  // turnToPage no dispara "flip": se actualiza a mano.
  const goTo = n => {
    if (n < 1 || n > pdfTotal) return;
    pf.turnToPage(n - 1);
    pdfPage = n;
    pagerSet(pdfPage, pdfTotal);
    saveProgress({ page: pdfPage, total: pdfTotal });
    alrededor(n);
  };
  window._spreadFlip = dir => dir > 0 ? pf.flipNext() : pf.flipPrev();
  window._spreadGoPage = goTo;
  window._spreadRendered = () => pageDivs.map((d, i) => {
    const c = d.querySelector("canvas");
    return c ? { page: i + 1, canvas: c } : null;
  }).filter(Boolean);
  pagerUse({ step: d => window._spreadFlip(d), go: goTo });

  _flipRebuild = flipRebuilder(wrap, initPDFSpread);
}

// ── Letra, tamaño y tema (TXT, MD y EPUB) ─────────────────────────────────────
// Preferencias del dispositivo (no del libro): valen para todos los textos.
// Los controles viven en la pildora (PC) o en la topbar flotante (celu).
const TEXT_PREFS_KEY = "bs_text_prefs";
const TEXT_FONTS = [["serif", "Serif"], ["sans-serif", "Sans"], ["monospace", "Mono"]];
// Lo setea initText; lo usan los bookmarks.
let _text = null;

// onApply(prefs, keepPos) aplica al visor. keepPos: cambio la letra (el alto
// del texto cambia y hay que quedarse en el mismo lugar); cambiar el tema no.
function setupTextCtl(onApply) {
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(TEXT_PREFS_KEY)) || {}; } catch {}
  prefs = { font: prefs.font || "serif", size: prefs.size || 18, theme: prefs.theme || "dark" };
  function apply(keepPos) {
    document.documentElement.dataset.textTheme = prefs.theme;
    document.getElementById("textFont").textContent = TEXT_FONTS.find(f => f[0] === prefs.font)[1];
    document.getElementById("textSize").textContent = prefs.size;
    document.querySelectorAll(".text-theme").forEach(b => b.classList.toggle("active", b.dataset.theme === prefs.theme));
    try { localStorage.setItem(TEXT_PREFS_KEY, JSON.stringify(prefs)); } catch {}
    onApply(prefs, keepPos);
  }
  document.getElementById("textFont").onclick = () => {
    const i = TEXT_FONTS.findIndex(f => f[0] === prefs.font);
    prefs.font = TEXT_FONTS[(i + 1) % TEXT_FONTS.length][0]; apply(true);
  };
  document.getElementById("textSmaller").onclick = () => { prefs.size = Math.max(12, prefs.size - 2); apply(true); };
  document.getElementById("textBigger").onclick  = () => { prefs.size = Math.min(32, prefs.size + 2); apply(true); };
  document.querySelectorAll(".text-theme").forEach(b => b.onclick = () => { prefs.theme = b.dataset.theme; apply(false); });
  document.getElementById("textCtl").hidden = false;
  placeTextCtl();
  apply(false);
}

// ── EPUB ──────────────────────────────────────────────────────────────────────
const EPUB_THEMES = {
  dark:  { body: { background: "#0d0d0d", color: "#e2e2e2" } },
  sepia: { body: { background: "#f4ecd8", color: "#3b2a1a" } },
  light: { body: { background: "#ffffff", color: "#111111" } },
};
function initEPUB() {
  document.documentElement.classList.remove("doc-scroll");
  document.getElementById("epubViewer").style.display = "flex";
  // openAs: la URL no termina en .epub y epub.js la tomaba por un libro
  // descomprimido (pedia /file/META-INF/container.xml y no abria nunca).
  const book = ePub("/api/books/" + bookId + "/file", { openAs: "epub" });
  epubRendition = book.renderTo(document.getElementById("epubArea"), { width: "100%", height: "100%", spread: "none" });
  Object.entries(EPUB_THEMES).forEach(([k, v]) => epubRendition.themes.register(k, v));
  setupTextCtl(p => {
    epubRendition.themes.select(p.theme);
    epubRendition.themes.font(p.font);
    epubRendition.themes.fontSize(p.size + "px");
  });
  fetchProgress().then(p => { if (p.cfi) epubRendition.display(p.cfi); else epubRendition.display(); });
  document.getElementById("epubPrev").onclick = () => epubRendition.prev();
  document.getElementById("epubNext").onclick = () => epubRendition.next();
  // Un EPUB no tiene paginas fijas: la pildora muestra el porcentaje, que
  // necesita las "locations" (se calculan una vez, en segundo plano).
  pagerUse({ step: d => d > 0 ? epubRendition.next() : epubRendition.prev(), label: true });
  pagerText("");
  const pintarPct = loc => {
    if (!loc || !book.locations.length()) return;
    pagerText(Math.round(book.locations.percentageFromCfi(loc.start.cfi) * 100) + "%");
  };
  book.ready.then(() => book.locations.generate(1600)).then(() => pintarPct(epubRendition.currentLocation())).catch(() => {});
  epubRendition.on("relocated", loc => {
    pintarPct(loc);
    const pct = book.locations.length() ? book.locations.percentageFromCfi(loc.start.cfi) : loc.start.percentage;
    saveProgress({ cfi: loc.start.cfi, percentage: pct });
  });
}

// ── TXT / Markdown ────────────────────────────────────────────────────────────
// Se lee como una pagina: scroll continuo, sin paginas. El progreso es el
// porcentaje scrolleado, el mismo campo que usa el EPUB, asi la tarjeta de la
// biblioteca lo muestra sin cambios.
async function initText(fmt) {
  const viewer = document.getElementById("textViewer");
  const wrap   = document.getElementById("textWrap");
  const body   = document.getElementById("textBody");
  viewer.style.display = "flex";

  // Mismo criterio que el modo scroll del PDF: en mobile scrollea el
  // documento (ver initPDFScroll), en desktop el contenedor.
  const docScroll = window.matchMedia("(max-width: 640px)").matches;
  document.documentElement.classList.toggle("doc-scroll", docScroll);
  const scroller = docScroll ? window : wrap;
  const maxTop = () => docScroll
    ? document.documentElement.scrollHeight - window.innerHeight
    : wrap.scrollHeight - wrap.clientHeight;
  const pct  = () => { const m = maxTop(); return m > 0 ? Math.min(1, Math.max(0, (docScroll ? window.scrollY : wrap.scrollTop) / m)) : 0; };
  const goTo = p => { const y = Math.round(p * maxTop()); if (docScroll) window.scrollTo(0, y); else wrap.scrollTop = y; };

  const res = await fetch("/api/books/" + bookId + "/file");
  if (!res.ok) throw new Error("HTTP " + res.status);
  const buf = await res.arrayBuffer();
  // UTF-8 si es valido; si no, casi seguro es un .txt viejo de Windows.
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { text = new TextDecoder("windows-1252").decode(buf); }

  if (fmt === "MD") { body.classList.add("md"); body.innerHTML = MdLite.render(text); }
  else body.textContent = text;

  // keepPos: al cambiar la letra cambia el alto del texto; sin esto saltaria
  // a otra parte del libro.
  setupTextCtl((prefs, keepPos) => {
    const antes = keepPos ? pct() : null;
    body.style.fontFamily = prefs.font;
    body.style.fontSize = prefs.size + "px";
    if (antes != null) goTo(antes);
  });

  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const prog = await fetchProgress();
  if (prog.percentage) goTo(prog.percentage);

  const save = () => saveProgress({ percentage: Math.round(pct() * 10000) / 10000 });
  let t = null;
  scroller.addEventListener("scroll", () => { clearTimeout(t); t = setTimeout(save, 400); }, { passive: true });
  // Al salir del lector (volver, cambiar de app) se guarda sin esperar.
  _capturePosition = save;
  _text = { pct, goTo };
}

function initUnsupported() {
  document.documentElement.classList.remove("doc-scroll");
  document.getElementById("unsupportedViewer").style.display = "flex";
  document.getElementById("btnDownloadUnsupported").onclick = () => window.open("/api/books/" + bookId + "/file?download=1");
}

// ── Progress & Bookmarks ──────────────────────────────────────────────────────
// Local primero, servidor despues: ver progress.js. saveProgress no toca la
// red; la sincronizacion la maneja Progress con reintentos.
async function fetchProgress() {
  try { const p = await Progress.load(bookId); return (p && p.data) || {}; } catch { return {}; }
}
function saveProgress(data) {
  Progress.save(bookId, data);
}

// Lista en memoria: la usan el drawer de escritorio y los paneles de mobile.
let _bookmarks = [];
const _bmPos = bm => (typeof bm.position === "string" ? JSON.parse(bm.position) : bm.position) || {};
// En PDF la posicion es una pagina; en TXT/Markdown, un porcentaje.
const _bmLabel = pos => pos.page ? "Pag " + pos.page : pos.pct != null ? Math.round(pos.pct * 100) + "%" : "";
const _bmHere = () => pdfDoc ? { page: pdfPage } : _text ? { pct: Math.round(_text.pct() * 10000) / 10000 } : {};

function irABookmark(pos) {
  if (pos.pct != null && _text) { _text.goTo(pos.pct); return; }
  if (!pos.page) return;
  if (viewMode === "spread" && window._spreadGoPage) window._spreadGoPage(pos.page);
  else if (window._scrollGoPage) window._scrollGoPage(pos.page);
  pdfPage = pos.page;
}

async function borrarBookmark(id) {
  await fetch("/api/books/" + bookId + "/bookmarks/" + id + "?device_id=" + deviceId, { method: "DELETE" });
  await loadBookmarks();
}

async function loadBookmarks() {
  try {
    _bookmarks = await (await fetch("/api/books/" + bookId + "/bookmarks?device_id=" + deviceId)).json();
  } catch { _bookmarks = []; }
}

async function saveBookmark(texto) {
  const label    = (texto || "").trim();
  const position = _bmHere();
  await fetch("/api/books/" + bookId + "/bookmarks?device_id=" + deviceId, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, position })
  });
  toggleBookmarkBar(false);
  loadBookmarks(); toast("Bookmark guardado");
}

async function renameBook(nuevo) {
  const newTitle = (nuevo || "").trim();
  if (!newTitle || newTitle === currentBook.title) return;
  const res = await fetch("/api/books/" + bookId, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: newTitle })
  });
  if (!res.ok) { toast("No se pudo cambiar el nombre"); return; }
  const u = await res.json();
  currentBook.title = u.title;
  const t = document.getElementById("readerTitle");
  t.textContent = t.title = u.title;
  document.title = u.title;
  toast("Nombre actualizado");
}

// ── Bind all ──────────────────────────────────────────────────────────────────
function bindAll() {
  // Teclado
  document.addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    const dir = (e.key === "ArrowRight" || e.key === "ArrowDown") ? 1
              : (e.key === "ArrowLeft"  || e.key === "ArrowUp")   ? -1 : 0;
    // En scroll las flechas arriba/abajo son del scroll nativo.
    if (dir && !(viewMode === "scroll" && pdfDoc && (e.key === "ArrowUp" || e.key === "ArrowDown"))) {
      if (pdfDoc && viewMode === "spread" && window._spreadFlip) window._spreadFlip(dir);
      else if (pdfDoc && (e.key === "ArrowRight" || e.key === "ArrowLeft") && window._scrollGoPage) window._scrollGoPage(pdfPage + dir);
      else if (epubRendition) dir > 0 ? epubRendition.next() : epubRendition.prev();
    }
    if (e.key === "f" || e.key === "F") toggleFullscreen();
    if ((e.ctrlKey || e.metaKey) && e.key === "f") { e.preventDefault(); toggleSearchBar(true); }
    if (e.key === "Escape") { closeNavSheet(); toggleSearchBar(false); toggleBookmarkBar(false); }
  });

  // Search
  document.getElementById("btnSearchClose").onclick    = () => { toggleSearchBar(false); clearSearch(); };
  document.getElementById("searchTextInput").onkeydown = e => {
    if (e.key === "Enter") {
      // Enter con la misma busqueda va a la siguiente coincidencia.
      if (searchMatches.length && e.target.value.trim().toLowerCase() === _searchQuery) navigateSearch(e.shiftKey ? -1 : 1);
      else searchInBook(e.target.value);
    }
    if (e.key === "Escape") { toggleSearchBar(false); clearSearch(); }
  };
  document.getElementById("btnSearchNext").onclick = () => navigateSearch(1);
  document.getElementById("btnSearchPrev").onclick = () => navigateSearch(-1);

  // Fullscreen
  document.addEventListener("fullscreenchange",       onFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onFullscreenChange);
  initIdleHide();

  document.getElementById("btnDownloadUnsupported").onclick = downloadBook;

  initTouch();
}

// ── Busqueda ──────────────────────────────────────────────────────────────────
// En TXT/Markdown se busca en el texto ya dibujado: cada coincidencia queda
// marcada y las flechas saltan entre ellas. searchMatches guarda los <mark>.
function searchInText(query) {
  const body = document.getElementById("textBody");
  body.querySelectorAll("mark.tx-hit").forEach(m => m.replaceWith(m.textContent));
  body.normalize();
  searchMatches = []; searchIdx = 0;
  const el = document.getElementById("searchResults");
  const q = query.trim().toLowerCase();
  if (!q) { el.textContent = ""; return; }
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const low = node.data.toLowerCase(), at = [];
    for (let i = low.indexOf(q); i !== -1 && searchMatches.length + at.length < 1000; i = low.indexOf(q, i + q.length)) at.push(i);
    // De atras para adelante, asi cortar el nodo no corre los indices que faltan.
    const marks = [];
    for (let k = at.length - 1; k >= 0; k--) {
      const hit = node.splitText(at[k]);
      hit.splitText(q.length);
      const m = document.createElement("mark");
      m.className = "tx-hit";
      hit.replaceWith(m); m.appendChild(hit);
      marks.unshift(m);
    }
    searchMatches.push(...marks);
  }
  if (!searchMatches.length) { el.textContent = "Sin resultados"; return; }
  showTextHit(0);
}

function showTextHit(i) {
  searchMatches.forEach(m => m.classList.remove("active"));
  searchIdx = i;
  const m = searchMatches[i];
  m.classList.add("active");
  m.scrollIntoView({ block: "center" });
  document.getElementById("searchResults").textContent = (i + 1) + "/" + searchMatches.length;
}


// En el PDF: searchMatches son las paginas con coincidencias. La palabra se
// marca dibujando un recuadro sobre el canvas con la posicion de cada trozo
// de texto (getTextContent): asi funciona igual en Scroll y en Doble, que no
// tiene capa de texto. Si la palabra queda partida entre dos trozos del PDF
// (pasa con algunos), salta a la pagina igual pero no se marca.
let _searchQuery = "";
const _pageTexts = new Map();
const _measureCtx = document.createElement("canvas").getContext("2d");
async function pageText(n) {
  if (!_pageTexts.has(n)) _pageTexts.set(n, (await pdfDoc.getPage(n)).getTextContent());
  return _pageTexts.get(n);
}

async function searchInBook(query) {
  if (_text) return searchInText(query);
  if (!pdfDoc) return;
  const q = query.trim().toLowerCase();
  clearSearch();
  if (!q) return;
  _searchQuery = q;
  const el = document.getElementById("searchResults");
  el.textContent = "Buscando...";
  for (let i = 1; i <= pdfTotal; i++) {
    const tc = await pageText(i);
    if (tc.items.some(it => it.str.toLowerCase().includes(q)) ||
        tc.items.map(s => s.str).join(" ").toLowerCase().includes(q)) searchMatches.push(i);
  }
  if (_searchQuery !== q) return; // otra busqueda empezo mientras tanto
  if (!searchMatches.length) { el.textContent = "Sin resultados"; return; }
  // Arranca en la primera coincidencia desde la pagina actual.
  const desde = searchMatches.findIndex(p => p >= pdfPage);
  showPdfHit(desde < 0 ? 0 : desde);
  repaintSearchHits();
}

function showPdfHit(i) {
  searchIdx = i;
  const p = searchMatches[i];
  document.getElementById("searchResults").textContent = (i + 1) + "/" + searchMatches.length;
  if (viewMode === "spread" && window._spreadGoPage) window._spreadGoPage(p);
  else if (window._scrollGoPage) window._scrollGoPage(p);
  pdfPage = p;
  repaintSearchHits();
}

function navigateSearch(dir) {
  if (!searchMatches.length) return;
  const i = (searchIdx + dir + searchMatches.length) % searchMatches.length;
  if (_text) showTextHit(i); else showPdfHit(i);
}

function clearSearch() {
  if (_text) { searchInText(""); return; }
  _searchQuery = "";
  searchMatches = []; searchIdx = 0;
  document.getElementById("searchResults").textContent = "";
  document.querySelectorAll(".search-hl").forEach(n => n.remove());
}

function repaintSearchHits() {
  const r = viewMode === "spread" ? window._spreadRendered : window._scrollRendered;
  if (r) r().forEach(({ page, canvas }) => paintSearchHits(page, canvas));
}

async function paintSearchHits(pageNum, canvas) {
  const host = canvas.parentElement;
  if (!host || !pdfDoc) return;
  host.querySelectorAll(":scope > .search-hl").forEach(n => n.remove());
  const q = _searchQuery;
  if (!q || !searchMatches.includes(pageNum)) return;
  const page = await pdfDoc.getPage(pageNum);
  const tc = await pageText(pageNum);
  if (q !== _searchQuery) return;
  const w = canvas.offsetWidth || parseFloat(canvas.style.width);
  const vp = page.getViewport({ scale: w / page.getViewport({ scale: 1 }).width });
  const layer = _el("div", "search-hl" + (searchMatches[searchIdx] === pageNum ? " current" : ""));
  layer.style.cssText = "left:" + canvas.offsetLeft + "px;top:" + canvas.offsetTop + "px;width:" + w + "px;height:" + canvas.offsetHeight + "px;";
  tc.items.forEach(it => {
    const low = it.str.toLowerCase();
    if (!low.includes(q) || !it.str.length) return;
    const tx = pdfjsLib.Util.transform(vp.transform, it.transform);
    const alto = Math.hypot(tx[2], tx[3]);
    const ancho = it.width * vp.scale;
    // Donde empieza y cuanto ocupa la palabra dentro del trozo: se mide con la
    // familia de la fuente del PDF y se escala al ancho real del trozo. Contar
    // caracteres quedaba corto (los numeros son mas anchos que el promedio).
    const fam = (tc.styles[it.fontName] || {}).fontFamily || "sans-serif";
    _measureCtx.font = "100px " + fam;
    const total = _measureCtx.measureText(it.str).width || 1;
    for (let i = low.indexOf(q); i !== -1; i = low.indexOf(q, i + q.length)) {
      const x0 = _measureCtx.measureText(it.str.slice(0, i)).width / total * ancho;
      const w  = _measureCtx.measureText(it.str.slice(i, i + q.length)).width / total * ancho;
      const box = _el("span");
      box.style.cssText = "left:" + (tx[4] + x0 - 1) + "px;top:" + (tx[5] - alto) +
        "px;width:" + Math.max(w + 2, 4) + "px;height:" + (alto * 1.15) + "px;";
      layer.appendChild(box);
    }
  });
  if (layer.childNodes.length) host.appendChild(layer);
}

// ── Gestos ────────────────────────────────────────────────────────────────────
function initTouch() {
  let tx0 = 0, ty0 = 0, tt0 = 0;

  document.addEventListener("touchstart", e => {
    if (!e.touches || !e.touches[0]) return;
    tx0 = e.touches[0].clientX; ty0 = e.touches[0].clientY; tt0 = Date.now();
  }, { passive: true });

  document.addEventListener("touchend", e => {
    // Un touchend puede llegar sin changedTouches (eventos sinteticos, o gestos
    // cancelados): sin el guard, el handler tira y ensucia la consola.
    if (!e.changedTouches || !e.changedTouches[0]) return;
    const dx = e.changedTouches[0].clientX - tx0;
    const dy = e.changedTouches[0].clientY - ty0;
    const dt = Math.max(1, Date.now() - tt0);
    const spX = Math.abs(dx) / dt;

    if (Math.abs(dx) > Math.abs(dy) * 1.5 && (Math.abs(dx) > 45 || spX > 0.4)) {
      const dir = dx < 0 ? 1 : -1;
      if      (viewMode === "spread" && window._spreadFlip)   window._spreadFlip(dir);
      else if (pdfDoc && window._scrollGoPage)                window._scrollGoPage(pdfPage + dir);
      else if (epubRendition) dir > 0 ? epubRendition.next() : epubRendition.prev();
    }
    // El modo scroll NO lleva inercia propia: el navegador ya aplica la suya
    // al scrollear el documento, y dos motores a la vez daban tirones.
  }, { passive: true });
}

// Doble tap (celu): esconde o trae las pildoras.
let _lastTap = 0;
document.addEventListener("touchend", function(e) {
  if (!esMovil()) return;
  if (e.target.closest(".modal-overlay, .bottom-nav, .top-nav, .nav-sheet, .nav-search, button, a, input")) return;
  const now = Date.now();
  if (now - _lastTap < 300) { _toggleReaderNav(); _lastTap = 0; }
  else _lastTap = now;
}, { passive: true });

// ── Pantalla completa ─────────────────────────────────────────────────────────
// En el celu el lector ya arranca a pantalla completa (la pildora se esconde
// con doble tap). En la PC: pantalla completa del navegador, y la pildora se
// va sola con el mouse quieto y vuelve al moverlo.
function enterFullscreen() {
  const el = document.documentElement;
  if (el.requestFullscreen)            el.requestFullscreen().catch(()=>{});
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  document.body.classList.add("reader-fullscreen");
  isFullscreen = true;
  updateFullscreenBtn();
  idleKick();
  // La hoja ahora tiene mas lugar: re-escalar (esperar a que aplique el CSS).
  scheduleScrollRerender(320);
}

function exitFullscreen() {
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(()=>{});
  else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
  document.body.classList.remove("reader-fullscreen");
  isFullscreen = false;
  updateFullscreenBtn();
  setReaderNavHidden(false);
  scheduleScrollRerender(320);
}

function toggleFullscreen() {
  if (esMovil()) return;
  if (isFullscreen || document.fullscreenElement) exitFullscreen(); else enterFullscreen();
}

// Salir con Escape (lo maneja el navegador) tiene que dejar todo como antes.
function onFullscreenChange() {
  if (!document.fullscreenElement && !document.webkitFullscreenElement && isFullscreen && !esMovil()) exitFullscreen();
  updateFullscreenBtn();
}

function updateFullscreenBtn() {
  const btn = document.getElementById("rnFullscreen"); if (!btn) return;
  const inFs = isFullscreen && !esMovil();
  btn.innerHTML = inFs ? RN_ICO.fsExit : RN_ICO.fs;
  btn.title = inFs ? "Salir de pantalla completa (F)" : "Pantalla completa (F)";
}

// Mouse quieto en pantalla completa: la pildora se va a los 2,5 s. No se va
// si el mouse esta encima de ella o hay algo abierto (panel, buscador).
let _idleTimer = null;
function idleKick() {
  clearTimeout(_idleTimer);
  if (!isFullscreen || esMovil()) return;
  setReaderNavHidden(false);
  _idleTimer = setTimeout(() => {
    const abierto = document.getElementById("navSheet") ||
      document.querySelector(".nav-search.open") || document.querySelector("#readerNav:hover");
    if (abierto) idleKick(); else setReaderNavHidden(true);
  }, 2500);
}
function initIdleHide() {
  document.addEventListener("mousemove", idleKick, { passive: true });
  document.addEventListener("keydown", idleKick);
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2800);
}

// ── Guardar libro sin conexion ───────────────────────────────────────────────
// El archivo del libro se guarda en un cache aparte (nunca automatico: pesan
// demasiado como para bajarlos solos). El service worker sirve desde ahi
// cuando no hay red. El cache es la unica fuente de verdad del estado.
const OFFLINE_CACHE = "bookshelf-books-v1";
const BOOK_FILE_URL  = "/api/books/" + bookId + "/file";
const BOOK_COVER_URL = "/api/books/" + bookId + "/cover";

// Estado de "guardado sin conexion". La fila del panel se suscribe mientras
// esta abierto y se repinta sola (guardar tarda: el libro se baja entero).
const _offline = { saved: false, busy: false };
const _offlineSubs = new Set();
const _offlineNotify = () => _offlineSubs.forEach(fn => { try { fn(); } catch {} });

async function isBookOffline() {
  if (!("caches" in window)) return false;
  try {
    const cache = await caches.open(OFFLINE_CACHE);
    return !!(await cache.match(BOOK_FILE_URL, { ignoreSearch: true }));
  } catch { return false; }
}

async function refreshOfflineBtn() {
  _offline.saved = await isBookOffline();
  _offlineNotify();
}

async function toggleOffline() {
  if (_offline.busy || !("caches" in window)) return;
  const saved = _offline.saved;
  _offline.busy = true;
  _offlineNotify();
  try {
    const cache = await caches.open(OFFLINE_CACHE);
    if (saved) {
      await cache.delete(BOOK_FILE_URL, { ignoreSearch: true });
      await cache.delete(BOOK_COVER_URL, { ignoreSearch: true });
      toast("Quitado de sin conexion");
    } else {
      // Pedirle al navegador que no evicte el cache (iOS lo respeta cuando la
      // app esta instalada en la pantalla de inicio).
      if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(() => {});
      }
      await cache.add(BOOK_FILE_URL);
      await cache.add(BOOK_COVER_URL).catch(() => {}); // sin portada no es grave
      toast("Guardado para leer sin conexion");
    }
  } catch (err) {
    const full = err && (err.name === "QuotaExceededError" ||
                         String(err).indexOf("quota") !== -1);
    toast(full ? "No hay espacio suficiente en el dispositivo"
               : "No se pudo guardar (necesitas conexion)");
  } finally {
    _offline.busy = false;
    await refreshOfflineBtn();
  }
}

init();

// ── Lupa (PC, PDF en Scroll y Doble) ──────────────────────────────────────────
// Captura una franja del ANCHO de la pagina que esta bajo el mouse, de unos
// pocos renglones de alto, y la muestra ampliada arriba (o abajo) de la
// franja: se lee un renglon entero, no un cuadradito. La cantidad de
// renglones se ajusta con la ruedita (en Scroll, Shift + ruedita: la ruedita
// sola scrollea) o con + y -. Lo ampliado sale de la pagina dibujada en alta
// resolucion, no del canvas de pantalla estirado (que se veia borroso).
let magnifierActive = false;
let _lensCapH = 72;                 // alto de la franja, en px de pantalla
const LENS_CAP_MIN = 28, LENS_CAP_MAX = 300, LENS_STEP = 16;
const _hiRes = new Map();           // "pagina@escala" -> canvas (o null mientras se dibuja)
let _lensLast = null;               // ultima posicion del mouse, para redibujar

function syncLupaBtn() {
  const b = document.getElementById("rnLupa");
  if (!b) return;
  b.hidden = !pdfDoc || esMovil();
  if (b.hidden && magnifierActive) setLupa(false);
}

function setLupa(on) {
  magnifierActive = on;
  document.getElementById("rnLupa").classList.toggle("active", on);
  document.body.classList.toggle("magnifier-active", on);
  if (!on) {
    document.getElementById("magnifierLens").style.display = "none";
    document.getElementById("magnifierCursor").style.display = "none";
    return;
  }
  const hint = document.getElementById("lensHint");
  hint.textContent = (viewMode === "scroll" ? "Shift + ruedita" : "Ruedita") + " o + / − : mas o menos renglones";
  hint.classList.add("show");
  setTimeout(() => hint.classList.remove("show"), 2600);
  toast("Lupa: pasa el mouse por la pagina");
}

function _pageUnder(x, y) {
  const el = document.elementFromPoint(x, y);
  const holder = el && el.closest("#pdfScrollWrap [data-page], #bookPagesContainerSpread [data-page]");
  const canvas = holder && holder.querySelector("canvas");
  if (!canvas || !canvas.width) return null;
  const r = canvas.getBoundingClientRect();
  if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
  return { page: parseInt(holder.dataset.page, 10), canvas, rect: r };
}

function _hiResFor(page, scale) {
  const key = page + "@" + scale;
  if (_hiRes.has(key)) return _hiRes.get(key);
  _hiRes.set(key, null);
  pdfDoc.getPage(page).then(p => {
    const vp = p.getViewport({ scale });
    const c = document.createElement("canvas");
    c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    return p.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise.then(() => {
      _hiRes.set(key, c);
      // Pocas paginas en memoria: cada una pesa varios MB.
      while (_hiRes.size > 6) _hiRes.delete(_hiRes.keys().next().value);
      if (magnifierActive && _lensLast) drawLens(_lensLast.x, _lensLast.y);
    });
  }).catch(() => _hiRes.delete(key));
  return null;
}

function drawLens(mx, my) {
  const lens = document.getElementById("magnifierLens");
  const cur  = document.getElementById("magnifierCursor");
  const lc   = document.getElementById("magnifierCanvas");
  const hit = _pageUnder(mx, my);
  if (!hit) { lens.style.display = "none"; cur.style.display = "none"; return; }
  const { page, canvas, rect } = hit;
  const dpr = window.devicePixelRatio || 1;
  const maxW = window.innerWidth - 32;

  // Zoom 2x si entra; si la pagina es muy ancha, menos (nunca menos de 1.4x),
  // y si ni asi entra, la franja se acota alrededor del mouse.
  const Z = Math.max(1.4, Math.min(2, maxW / rect.width));
  const capW = Math.min(rect.width, maxW / Z);
  const capH = Math.min(_lensCapH, rect.height);
  const capX = Math.max(rect.left, Math.min(mx - capW / 2, rect.right - capW));
  const capY = Math.max(rect.top, Math.min(my - capH / 2, rect.bottom - capH));
  const lensW = capW * Z, lensH = capH * Z;

  cur.style.display = "block";
  cur.style.cssText += ";left:" + capX + "px;top:" + capY + "px;width:" + capW + "px;height:" + capH + "px;";

  let lx = capX + capW / 2 - lensW / 2;
  lx = Math.max(16, Math.min(lx, window.innerWidth - 16 - lensW));
  let ly = capY - lensH - 14;
  if (ly < 12) ly = capY + capH + 14;
  lens.style.display = "block";
  lens.style.cssText += ";left:" + lx + "px;top:" + ly + "px;width:" + lensW + "px;height:" + lensH + "px;";
  lc.style.width = lensW + "px"; lc.style.height = lensH + "px";
  const cw = Math.round(lensW * dpr), ch = Math.round(lensH * dpr);
  if (lc.width !== cw) lc.width = cw;
  if (lc.height !== ch) lc.height = ch;
  const ctx = lc.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, cw, ch);

  // Fuente: la pagina en alta resolucion (escala redondeada para reusarla);
  // mientras se dibuja, el canvas de pantalla.
  let src = canvas;
  if (pdfDoc) {
    const hi = _hiResFor(page, _lensScale(page, rect.width * Z * dpr));
    if (hi) src = hi;
  }
  const kx = src.width / rect.width, ky = src.height / rect.height;
  try {
    ctx.drawImage(src, (capX - rect.left) * kx, (capY - rect.top) * ky, capW * kx, capH * ky, 0, 0, cw, ch);
  } catch {}
}

// Escala de PDF.js (px por punto) para dibujar la pagina con anchoPx de
// ancho, redondeada a 0.25 para reusar el mismo render al mover el mouse.
const _pageWidths = new Map();
function _lensScale(page, anchoPx) {
  const w = _pageWidths.get(page);
  if (!w) {
    pdfDoc.getPage(page).then(p => _pageWidths.set(page, p.getViewport({ scale: 1 }).width));
    return Math.round(anchoPx / 612 * 4) / 4;
  }
  return Math.max(0.5, Math.round(anchoPx / w * 4) / 4);
}

function initMagnifier() {
  const btn = document.getElementById("rnLupa");
  if (!btn) return;
  btn.addEventListener("click", () => setLupa(!magnifierActive));
  document.addEventListener("mousemove", e => {
    if (!magnifierActive) return;
    _lensLast = { x: e.clientX, y: e.clientY };
    drawLens(e.clientX, e.clientY);
  }, { passive: true });
  const ajustar = d => {
    _lensCapH = Math.max(LENS_CAP_MIN, Math.min(LENS_CAP_MAX, _lensCapH + d * LENS_STEP));
    if (_lensLast) drawLens(_lensLast.x, _lensLast.y);
  };
  document.addEventListener("wheel", e => {
    if (!magnifierActive || !_lensLast || !_pageUnder(e.clientX, e.clientY)) return;
    if (viewMode === "scroll" && !e.shiftKey) return;
    e.preventDefault();
    ajustar(e.deltaY < 0 || e.deltaX < 0 ? 1 : -1);
  }, { passive: false });
  document.addEventListener("keydown", e => {
    if (!magnifierActive || e.target.tagName === "INPUT") return;
    if (e.key === "Escape") setLupa(false);
    if (e.key === "+" || e.key === "=") ajustar(1);
    if (e.key === "-" || e.key === "_") ajustar(-1);
  });
  // Al scrollear la pagina se mueve debajo del mouse: redibujar.
  document.addEventListener("scroll", () => { if (magnifierActive && _lensLast) drawLens(_lensLast.x, _lensLast.y); }, { passive: true, capture: true });
}

initMagnifier();
