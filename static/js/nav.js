// Panel desplegable compartido entre la biblioteca y el lector.
// Las dos pantallas cargan este archivo antes que el suyo propio.

// ── Panel que crece desde la pildora ─────────────────────────────────────────
// Portado de asmodeloscentral: el panel no es una hoja aparte sino la barra
// misma estirandose. Dos fases (montar / .open) porque un clip-path solo anima
// si el elemento ya estuvo en el DOM con el valor inicial aplicado; con una
// sola pasada el navegador colapsa ambos estados y no se ve la transicion.
const NAV_SHEET_CLOSE_MS = 340;
let _navSheetClosing = null;
// El callback de limpieza vive aca y no en el que cierra, porque el panel se
// puede cerrar por varios caminos: el fondo, una fila que navega, o codigo
// ajeno (doUpload llama closeModal al terminar). Si la limpieza colgara de uno
// solo de esos, cerrar por otro dejaria el panel de "Subir" sin sus nodos.
let _navSheetOnClose = null;

function _navSheetCleanup() {
  const fn = _navSheetOnClose;
  _navSheetOnClose = null;
  // Recien cuando el panel termino de volver a la forma de la pildora: la
  // barra recupera su fondo en el mismo lugar, sin salto.
  document.documentElement.classList.remove("nav-sheet-abierta", "top-sheet-abierta");
  if (fn) fn();
}

// ── La barra se transforma en el panel ───────────────────────────────────────
// Mientras el panel esta abierto, la pagina lleva .nav-sheet-abierta: la barra
// esconde sus iconos y deja de dibujar su fondo (ver nav.css). Se saca en la
// limpieza, cuando el panel ya volvio a la forma de la barra.

function closeNavSheet(inmediato) {
  const sheet = document.getElementById("navSheet");
  const back  = document.getElementById("navSheetBackdrop");
  if (!sheet && !back) return;
  clearTimeout(_navSheetClosing);
  if (inmediato) {
    if (sheet) sheet.remove();
    if (back) back.remove();
    _navSheetCleanup();
    return;
  }
  if (sheet) sheet.classList.remove("open");
  if (back)  back.classList.remove("open");
  if (sheet && sheet._desde) _topSheetAnimar(sheet, sheet._desde, false);
  _navSheetClosing = setTimeout(() => {
    if (sheet) sheet.remove();
    if (back) back.remove();
    _navSheetCleanup();
  }, NAV_SHEET_CLOSE_MS);
}

// build(body) llena el contenido. onClose corre despues de sacarlo del DOM.
// opts.desde: una topbar (.top-nav) de la que el panel crece hacia abajo, en
// vez de la pildora de abajo (ver _topSheetAnimar).
function openNavSheet(build, onClose, opts) {
  closeNavSheet(true);
  const desde = opts && opts.desde;

  _navSheetOnClose = onClose || null;
  document.documentElement.classList.add(desde ? "top-sheet-abierta" : "nav-sheet-abierta");

  const back = document.createElement("div");
  back.id = "navSheetBackdrop";
  back.className = "nav-sheet-backdrop";
  back.onclick = () => closeNavSheet();

  const sheet = document.createElement("div");
  sheet.id = "navSheet";
  sheet.className = "nav-sheet" + (desde ? " nav-sheet-top" : "");
  const body = document.createElement("div");
  body.className = "nav-sheet-body";
  sheet.appendChild(body);

  document.body.appendChild(back);
  document.body.appendChild(sheet);
  build(body);
  if (desde) { sheet._desde = desde; _topSheetAnimar(sheet, desde, true); }

  requestAnimationFrame(() => requestAnimationFrame(() => {
    sheet.classList.add("open");
    back.classList.add("open");
  }));
  return { sheet, body, close: () => closeNavSheet() };
}

// Cambia el contenido del panel abierto por otro, sin cerrarlo: el panel
// estira (o achica) su alto hasta el nuevo y el contenido entra con un
// fundido. Si no hay uno abierto de abajo, abre normal.
function swapNavSheet(build, onClose) {
  const sheet = document.getElementById("navSheet");
  if (!sheet || !sheet.classList.contains("open") || sheet._desde) return openNavSheet(build, onClose);
  const viejo = _navSheetOnClose;
  _navSheetOnClose = onClose || null;
  if (viejo) viejo();
  const body = sheet.querySelector(".nav-sheet-body");
  const h0 = sheet.offsetHeight;
  body.replaceChildren();
  build(body);
  const h1 = sheet.offsetHeight;
  if (sheet.animate && !_treeQuieto()) {
    sheet.animate([{ height: h0 + "px" }, { height: h1 + "px" }], { duration: 460, easing: _ease });
    body.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 140, easing: "ease", fill: "backwards" });
  }
  return { sheet, body, close: () => closeNavSheet() };
}

// ── Panel que crece desde la topbar ──────────────────────────────────────────
// El espejo del de abajo, en dos tiempos de una sola animacion: la topbar (que
// mide lo que muestra) primero se ensancha hasta el ancho de la pildora de
// abajo y despues baja hasta ser el panel. Cerrar hace el camino inverso: sube
// y se angosta hasta el ancho que tenga la topbar en ese momento (si se navego,
// el de la ruta nueva). Es un clip-path por fotogramas (Web Animations): los
// dos tiempos dependen de medidas que solo se saben al abrir.
const TOP_SHEET_OPEN_MS = 680;
const _ease = "cubic-bezier(.32,.72,0,1)";

function _topSheetAnimar(sheet, bar, abrir) {
  if (!sheet.animate || _treeQuieto()) return;
  const s = sheet.getBoundingClientRect(), r = bar.getBoundingClientRect();
  // La topbar puede estar animando su ancho: cuenta el de destino.
  const w = parseFloat(bar.style.width) || r.width;
  const cx = r.left + r.width / 2;
  const izq = Math.max(0, cx - w / 2 - s.left), der = Math.max(0, s.right - cx - w / 2);
  const abajo = Math.max(0, s.height - r.height);
  const barra = "inset(0px " + der + "px " + abajo + "px " + izq + "px round 999px)";
  const ancha = "inset(0px 0px " + abajo + "px 0px round 999px)";
  const abierto = "inset(-80px round 108px)";
  if (abrir) {
    sheet.animate([
      { clipPath: barra, offset: 0, easing: _ease },
      { clipPath: ancha, offset: .34, easing: _ease },
      { clipPath: abierto, offset: 1 },
    ], { duration: TOP_SHEET_OPEN_MS });
  } else {
    sheet.animate([
      { clipPath: abierto, offset: 0, easing: _ease },
      { clipPath: ancha, offset: .6, easing: _ease },
      { clipPath: barra, offset: 1 },
    ], { duration: NAV_SHEET_CLOSE_MS, fill: "forwards" });
  }
}

// ── Teclado (celu) ──────────────────────────────────────────────────────────
// En iOS el teclado no achica la pagina: la tapa. visualViewport si se achica,
// y la diferencia es cuanto tapa; se publica como --kb-offset y la pildora, el
// buscador y el panel lo suman a su distancia del borde (suben con el
// teclado, animados). En Android la pagina se achica sola y esto da 0.
//
// Ademas, para mostrar el campo enfocado iOS scrollea la pagina: el fondo se
// corria junto con la barra. Si el campo es de una barra o un panel flotante,
// que ya sube solo, se devuelve la pagina a donde estaba mientras el teclado
// entra (hasta un segundo, o hasta que el dedo scrollee).
function initKeyboard() {
  const vv = window.visualViewport;
  if (!vv || initKeyboard._listo) return;
  initKeyboard._listo = true;
  const sync = () => {
    const tapado = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    // Umbral: cambios chicos son la barra de direcciones, no el teclado.
    document.documentElement.style.setProperty("--kb-offset", (tapado > 120 ? tapado : 0) + "px");
  };
  let quedarseEn = null, hasta = 0;
  const quieto = () => {
    if (quedarseEn == null || performance.now() > hasta) return;
    if (Math.abs(window.scrollY - quedarseEn) > 1) window.scrollTo(window.scrollX, quedarseEn);
  };
  vv.addEventListener("resize", () => { sync(); quieto(); });
  vv.addEventListener("scroll", () => { sync(); quieto(); });
  window.addEventListener("scroll", quieto, { passive: true });
  document.addEventListener("touchmove", () => { hasta = 0; }, { passive: true });
  document.addEventListener("focusin", e => {
    const el = e.target;
    if (!el.matches || !el.matches("input, textarea, [contenteditable]")) return;
    if (!el.closest(".bottom-nav, .top-nav, .nav-search, .nav-sheet")) return;
    quedarseEn = window.scrollY;
    hasta = performance.now() + 1000;
    const vuelta = () => { quieto(); if (performance.now() < hasta) requestAnimationFrame(vuelta); };
    requestAnimationFrame(vuelta);
  });
  sync();
}

// Fila de panel: pildora con icono opcional, etiqueta y detalle a la derecha.
function navSheetRow({ label, icon, detail, active, onClick }) {
  const row = document.createElement("button");
  row.className = "nav-sheet-row" + (active ? " active" : "");
  if (icon) row.innerHTML = icon;
  const sp = document.createElement("span");
  sp.className = "row-label"; sp.textContent = label;
  row.appendChild(sp);
  if (detail != null) {
    const d = document.createElement("span");
    d.className = "row-count"; d.textContent = detail;
    row.appendChild(d);
  }
  if (onClick) row.onclick = onClick;
  return row;
}


// ── Arbol de colecciones ─────────────────────────────────────────────────────
// Las colecciones son carpetas y pueden anidarse (parent_id). Lo usan la
// biblioteca y el lector para los selectores: devuelve [{c, depth}] en orden
// de arbol: en cada nivel, el orden elegido a mano (la flechita de la hoja de
// colecciones) y despues alfabetico.
function colTree(collections) {
  // Temporal siempre ultima (fija, aunque se creen otras). Las que nunca se
  // ordenaron (sort_order null, p. ej. una recien creada) van despues de las
  // ordenadas, alfabeticas. (_primero: una fila que va arriba de todo, como
  // "Primer nivel" al crear.)
  const orden = c => c.sort_order == null ? Infinity : c.sort_order;
  const byName = (a, b) => ((b._primero | 0) - (a._primero | 0)) || (a.is_temp - b.is_temp) ||
    (orden(a) - orden(b) || 0) || a.name.localeCompare(b.name, "es", { sensitivity: "base" });
  const out = [];
  const walk = (parentId, depth) => collections
    .filter(c => (c.parent_id == null ? null : c.parent_id) === parentId)
    .sort(byName)
    .forEach(c => { out.push({ c, depth }); walk(c.id, depth + 1); });
  walk(null, 0);
  return out;
}

// Opciones de un <select> con sangria. Un select nativo no admite otra
// cosa que texto, asi que la jerarquia se dibuja con espacios y "└".
function colOptionsHTML(collections, selectedId) {
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return colTree(collections).map(({ c, depth }) =>
    "<option value='" + c.id + "'" + (c.id === selectedId ? " selected" : "") + ">" +
    "   ".repeat(depth) + (depth ? "└ " : "") + esc(c.name) + "</option>"
  ).join("");
}

// ── Desplegar / plegar subcarpetas ───────────────────────────────────────────
// Se anima el alto del bloque de hijas (y se funde), con la misma curva que la
// pildora. La hoja del celu toma su alto del contenido, asi que crece sola
// junto con la lista. Sin animacion si el sistema pide reducir movimiento.
const TREE_MS = 380;
const _treeQuieto = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function _treeAnimar(el, desde, hasta, alTerminar) {
  el.style.overflow = "hidden";
  el.style.height = desde.h + "px";
  el.style.opacity = desde.o;
  el.offsetHeight; // fija el punto de partida antes de la transicion
  el.style.transition = "height " + TREE_MS + "ms var(--nav-ease), opacity " + (TREE_MS - 60) + "ms ease";
  el.style.height = hasta.h + "px";
  el.style.opacity = hasta.o;
  let listo = false;
  const fin = () => { if (listo) return; listo = true; alTerminar(); };
  el.addEventListener("transitionend", e => { if (e.target === el && e.propertyName === "height") fin(); });
  setTimeout(fin, TREE_MS + 120); // por si transitionend no llega (pestaña oculta)
}

function treeOpen(el) {
  if (_treeQuieto()) return;
  _treeAnimar(el, { h: 0, o: 0 }, { h: el.scrollHeight, o: 1 }, () => {
    el.style.overflow = el.style.height = el.style.opacity = el.style.transition = "";
  });
}

// Pliega y despues saca el bloque del DOM.
function treeClose(el) {
  if (_treeQuieto()) { el.remove(); return; }
  _treeAnimar(el, { h: el.scrollHeight, o: 1 }, { h: 0, o: 0 }, () => el.remove());
}

// ── Selector de coleccion (arbol) ────────────────────────────────────────────
// El arbol de la hoja de colecciones como selector: arranca desplegado solo el
// camino hasta la elegida; tocar una la elige y, si tiene subcarpetas, las
// despliega (animado); la flechita despliega o pliega sin elegir. Lo usan el
// panel de info del lector (mover el libro) y el de subir (a donde va).
// marked: id a etiquetar como "actual". Devuelve { el, value }.
function colPicker({ collections, selected, marked, onChange }) {
  const ico = d => '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' + d + '</svg>';
  const ICO_FOLDER = ico('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>');
  const ICO_TEMP = ico('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>');
  const ICO_CHEV = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="9 6 15 12 9 18"/></svg>';
  const arbol = colTree(collections);
  const byId = id => collections.find(c => c.id === id);
  const hijas = id => arbol.filter(x => x.c.parent_id === id).map(x => x.c);
  const camino = id => { const out = []; for (let c = byId(id); c; c = c.parent_id != null ? byId(c.parent_id) : null) out.unshift(c.id); return out; };
  const abiertas = new Set(camino(selected));
  const api = { el: document.createElement("div"), value: selected };
  api.el.className = "nav-tree col-tree";

  const build = (parent, cols) => cols.forEach(c => {
    const kids = hijas(c.id);
    const node = document.createElement("div");
    node.className = "tree-node";
    const rowWrap = document.createElement("div");
    rowWrap.className = "tree-row";
    let chev = null;
    const sub = () => { const s = document.createElement("div"); s.className = "tree-children"; build(s, kids); return s; };
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
    const row = navSheetRow({
      label: c.name, icon: c.is_temp ? ICO_TEMP : ICO_FOLDER,
      detail: c.id === marked ? "actual" : undefined,
      active: c.id === api.value,
      onClick: () => {
        api.value = c.id;
        api.el.querySelectorAll(".nav-sheet-row.active").forEach(r => r.classList.remove("active"));
        row.classList.add("active");
        if (kids.length && !abiertas.has(c.id)) toggle();
        if (onChange) onChange(c.id, c);
      },
    });
    rowWrap.appendChild(row);
    if (kids.length) {
      chev = document.createElement("button");
      chev.className = "tree-chev" + (abiertas.has(c.id) ? " open" : "");
      chev.innerHTML = ICO_CHEV;
      chev.setAttribute("aria-label", "Desplegar " + c.name);
      chev.onclick = toggle;
      rowWrap.appendChild(chev);
    }
    node.appendChild(rowWrap);
    if (kids.length && abiertas.has(c.id)) node.appendChild(sub());
    parent.appendChild(node);
  });
  build(api.el, arbol.filter(x => x.depth === 0).map(x => x.c));
  return api;
}
