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
  document.documentElement.classList.remove("nav-sheet-abierta");
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
  _navSheetClosing = setTimeout(() => {
    if (sheet) sheet.remove();
    if (back) back.remove();
    _navSheetCleanup();
  }, NAV_SHEET_CLOSE_MS);
}

// build(body) llena el contenido. onClose corre despues de sacarlo del DOM.
function openNavSheet(build, onClose) {
  closeNavSheet(true);

  _navSheetOnClose = onClose || null;
  document.documentElement.classList.add("nav-sheet-abierta");

  const back = document.createElement("div");
  back.id = "navSheetBackdrop";
  back.className = "nav-sheet-backdrop";
  back.onclick = () => closeNavSheet();

  const sheet = document.createElement("div");
  sheet.id = "navSheet";
  sheet.className = "nav-sheet";
  const body = document.createElement("div");
  body.className = "nav-sheet-body";
  sheet.appendChild(body);

  document.body.appendChild(back);
  document.body.appendChild(sheet);
  build(body);

  requestAnimationFrame(() => requestAnimationFrame(() => {
    sheet.classList.add("open");
    back.classList.add("open");
  }));
  return { sheet, body, close: () => closeNavSheet() };
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
// de arbol, alfabetico en cada nivel.
function colTree(collections) {
  // Alfabetico, salvo Temporal: siempre ultima (fija, aunque se creen otras).
  const byName = (a, b) => (a.is_temp - b.is_temp) || a.name.localeCompare(b.name, "es", { sensitivity: "base" });
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
