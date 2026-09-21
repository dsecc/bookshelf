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
let pageFlipInstance = null, epubRendition = null;
let highlightMode = false, selectedColor = "#fbbf24";
let searchMatches = [], searchIdx = 0;
let isFullscreen = false;

// ── Init ──────────────────────────────────────────────────────────────────────

// ── Navbar del lector (mobile) ───────────────────────────────────────────────
// La pildora reemplaza a la topbar. Los botones no reimplementan nada: hacen
// click() sobre los de la topbar, que siguen en el DOM con sus handlers ya
// enganchados. Asi no hay dos copias de la logica que se puedan desincronizar.
const RN_ICO = {
  "hl": "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><path d=\"M12 20h9\"/><path d=\"M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z\"/></svg>",
  "list": "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><line x1=\"8\" y1=\"6\" x2=\"21\" y2=\"6\"/><line x1=\"8\" y1=\"12\" x2=\"21\" y2=\"12\"/><line x1=\"8\" y1=\"18\" x2=\"21\" y2=\"18\"/><line x1=\"3\" y1=\"6\" x2=\"3.01\" y2=\"6\"/><line x1=\"3\" y1=\"12\" x2=\"3.01\" y2=\"12\"/><line x1=\"3\" y1=\"18\" x2=\"3.01\" y2=\"18\"/></svg>",
  "lupa": "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><circle cx=\"11\" cy=\"11\" r=\"8\"/><path d=\"m21 21-4.35-4.35\"/><path d=\"M11 8v6M8 11h6\"/></svg>",
  "down": "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><polyline points=\"7 10 12 15 17 10\"/><line x1=\"12\" y1=\"15\" x2=\"12\" y2=\"3\"/></svg>",
  "share": "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><circle cx=\"18\" cy=\"5\" r=\"3\"/><circle cx=\"6\" cy=\"12\" r=\"3\"/><circle cx=\"18\" cy=\"19\" r=\"3\"/><line x1=\"8.59\" y1=\"13.51\" x2=\"15.42\" y2=\"17.49\"/><line x1=\"15.41\" y1=\"6.51\" x2=\"8.59\" y2=\"10.49\"/></svg>",
  "wa": "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884\"/></svg>",
  "send": "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/><line x1=\"19\" y1=\"8\" x2=\"19\" y2=\"14\"/><line x1=\"16\" y1=\"11\" x2=\"22\" y2=\"11\"/></svg>",
  "off": "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><polyline points=\"7 10 12 15 17 10\"/><line x1=\"12\" y1=\"15\" x2=\"12\" y2=\"3\"/><line x1=\"3\" y1=\"21\" x2=\"21\" y2=\"21\"/></svg>",
  "trash": "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><polyline points=\"3 6 5 6 21 6\"/><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"/></svg>",
  "tag": "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><path d=\"M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z\"/><line x1=\"7\" y1=\"7\" x2=\"7.01\" y2=\"7\"/></svg>",
  "check": "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\"><polyline points=\"20 6 9 17 4 12\"/></svg>"
};

function _rnClick(id) {
  const el = document.getElementById(id);
  if (el) el.click();
}

// Panel unico del lector. Todo lo que se puede hacer con el libro abierto
// entra aca: primero las herramientas, todas del mismo tipo y por eso con la
// misma pinta, y despues los campos del libro con la estetica del panel.
//
// Las herramientas hacen click() sobre los botones originales, que siguen en
// el DOM con sus handlers: no hay logica duplicada.
function openReaderSheet() {
  const panelBody = document.querySelector("#infoPanel .panel-body");
  const titulo = document.getElementById("infoTitleInput");
  const colSel = document.getElementById("infoCollection");
  const devolver = titulo ? [[titulo, titulo.parentNode, titulo.nextSibling]] : [];

  const delegar = fn => () => { closeNavSheet(); setTimeout(fn, NAV_SHEET_CLOSE_MS); };

  openNavSheet(body => {
    const head = document.createElement("div");
    head.className = "nav-sheet-title";
    head.innerHTML = "<span>" + ((currentBook && currentBook.title) || "Libro") + "</span>";
    body.appendChild(head);

    const seccion = txt => {
      const d = document.createElement("div");
      d.className = "nav-sheet-section"; d.textContent = txt;
      body.appendChild(d);
    };
    const sep = () => body.appendChild(
      Object.assign(document.createElement("div"), { className: "nav-sheet-sep" }));

    seccion("Herramientas");
    const herramientas = [
      ["Subrayar", RN_ICO.hl, "btnHighlight", highlightMode],
      ["Ver bookmarks", RN_ICO.list, "btnBookmarkList"],
      ["Descargar", RN_ICO.down, "btnDownloadReader"],
      ["Compartir", RN_ICO.share, "btnShareReader"],
      ["Compartir por WhatsApp", RN_ICO.wa, "btnWhatsappPanel"],
      ["Enviar a otro usuario", RN_ICO.send, "btnSendToUser"],
    ];
    const lupa = document.getElementById("btnMagnifier");
    if (lupa && lupa.style.display !== "none") {
      herramientas.splice(1, 0, ["Lupa", RN_ICO.lupa, "btnMagnifier"]);
    }
    herramientas.forEach(([label, icon, id, active]) => {
      body.appendChild(navSheetRow({
        label, icon, active: !!active, onClick: delegar(() => _rnClick(id)),
      }));
    });

    // Guardar sin conexion NO cierra el panel: es lo unico que tiene estado, y
    // cerrando no habria forma de ver si quedo guardado o no. Se queda abierto
    // y la fila se repinta sola cuando el boton original cambia de estado.
    const btnOff = document.getElementById("btnOffline");
    const filaOff = navSheetRow({
      label: "Guardar sin conexion", icon: RN_ICO.off, detail: "",
      onClick: () => { if (btnOff) btnOff.click(); },
    });
    const est = filaOff.querySelector(".row-count");
    if (est) est.className = "row-state";
    body.appendChild(filaOff);

    if (btnOff) {
      const pintar = () => {
        const guardado = btnOff.dataset.saved === "1";
        filaOff.classList.toggle("active", guardado);
        const icoEl = filaOff.querySelector("svg");
        if (icoEl) icoEl.outerHTML = guardado ? RN_ICO.check : RN_ICO.off;
        const e = filaOff.querySelector(".row-state");
        if (e) e.textContent = guardado ? "Guardado" : "";
      };
      new MutationObserver(pintar)
        .observe(btnOff, { attributes: true, attributeFilter: ["data-saved"] });
      pintar();
    }

    sep();
    seccion("Libro");

    // Nombre: sin boton de confirmar. Se guarda al salir del campo o con Enter,
    // que es lo que uno hace igual; el tilde era un paso de mas.
    if (titulo) {
      const campo = document.createElement("div");
      campo.className = "nav-sheet-field";
      titulo.className = "";
      titulo.placeholder = "Nombre del libro";
      titulo.onblur = () => { if (titulo.value.trim()) renameBook(); };
      campo.appendChild(titulo);
      body.appendChild(campo);
    }

    // Coleccion: lista propia desplegable en el panel, no el selector nativo de
    // iOS (que abre su propia rueda y saca al usuario del panel).
    if (colSel) {
      const opciones = [...colSel.options].map(o => ({ id: parseInt(o.value), name: o.text }));
      const actual = () => {
        const o = opciones.find(x => x.id === currentBook.collection_id);
        return o ? o.name : "Sin coleccion";
      };
      let abierta = false;
      const filas = [];
      const fila = navSheetRow({
        label: "Coleccion", icon: RN_ICO.tag, detail: actual(),
        onClick: () => {
          abierta = !abierta;
          filas.forEach(f => { f.style.display = abierta ? "" : "none"; });
        },
      });
      body.appendChild(fila);

      opciones.forEach(op => {
        const f = navSheetRow({
          label: op.name,
          active: op.id === currentBook.collection_id,
          onClick: async () => {
            await fetch("/api/books/" + bookId, {
              method: "PATCH", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ collection_id: op.id }),
            });
            currentBook.collection_id = op.id;
            colSel.value = String(op.id);
            filas.forEach(x => x.classList.toggle("active", x === f));
            const d = fila.querySelector(".row-count");
            if (d) d.textContent = actual();
            toast("Coleccion actualizada");
          },
        });
        f.classList.add("nav-sheet-suboption");
        f.style.display = "none";
        filas.push(f);
        body.appendChild(f);
      });
    }

    sep();
    body.appendChild(navSheetRow({
      label: "Eliminar libro", icon: RN_ICO.trash,
      onClick: delegar(() => _rnClick("btnDeleteReader")),
    }));
    body.lastChild.classList.add("danger");
  }, () => {
    if (titulo) { titulo.className = "panel-input"; titulo.onblur = null; }
    devolver.forEach(([el, padre, siguiente]) => padre.insertBefore(el, siguiente));
  });
}

// ── Barra de busqueda ────────────────────────────────────────────────────────
// En mobile sale de DETRAS de la pildora (una clase mueve su transform), no de
// una barra arriba de la pantalla. En desktop sigue siendo display, que es lo
// que espera su layout dentro de la topbar.
function toggleSearchBar(forzar) {
  const bar = document.getElementById("searchBarReader");
  if (!bar) return;
  const movil = window.innerWidth <= 640;
  // El display:none inline del HTML impediria animar la primera apertura.
  if (movil && bar.style.display === "none") bar.style.display = "";
  const abierta = movil ? bar.classList.contains("open") : bar.style.display !== "none";
  const abrir = forzar === undefined ? !abierta : forzar;

  if (movil) {
    bar.style.display = "";
    bar.classList.toggle("open", abrir);
  } else {
    bar.style.display = abrir ? "" : "none";
  }
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

// Doble tap: esconde la pildora para leer sin nada encima, y la trae de vuelta.
// Misma animacion de salida que usa la referencia para su barra: se va hacia
// abajo por su propio alto mas la separacion, con la opacidad acompanando.
let _rnHidden = false;
function _toggleReaderNav() {
  const nav = document.getElementById("readerNav");
  if (!nav) return;
  closeNavSheet();
  toggleSearchBar(false);
  _rnHidden = !_rnHidden;
  nav.style.transition = "transform .32s cubic-bezier(.4,0,.2,1), opacity .24s cubic-bezier(.4,0,.2,1)";
  nav.style.transform = _rnHidden
    ? "translateY(calc(100% + var(--nav-bar-bottom) + 16px))"
    : "translateY(0)";
  nav.style.opacity = _rnHidden ? "0" : "1";
  nav.style.pointerEvents = _rnHidden ? "none" : "auto";
}

function initReaderNav() {
  const nav = document.getElementById("readerNav");
  if (!nav) return;
  const bar = document.getElementById("searchBarReader");
  if (bar && window.innerWidth <= 640) bar.style.display = "";
  document.getElementById("rnBack").onclick     = () => { window.location.href = "/"; };
  document.getElementById("rnSearch").onclick   = () => { closeNavSheet(); toggleSearchBar(); };
  document.getElementById("rnBookmark").onclick = () => { closeNavSheet(); _rnClick("btnBookmark"); };
  document.getElementById("rnMore").onclick     = () => openReaderSheet();
}

async function init() {
  try {
    const [bookRes, colRes] = await Promise.all([
      fetch("/api/books/" + bookId),
      fetch("/api/collections")
    ]);
    currentBook = await bookRes.json();
    collections = await colRes.json();
    viewMode = currentBook.view_mode || "scroll";
    // En mobile se lee siempre en scroll. Si el libro quedo guardado en otro
    // modo desde la compu, aca se ignora: sin selector no habria como salir.
    // No se persiste, para que en desktop siga abriendo como lo dejaste.
    if (window.innerWidth <= 640) viewMode = "scroll";

    document.getElementById("readerTitle").textContent = currentBook.title;
    document.title = currentBook.title;
    document.getElementById("infoTitleInput").value = currentBook.title;
    document.getElementById("infoCollection").innerHTML = collections.map(c =>
      "<option value='" + c.id + "'" + (c.id === currentBook.collection_id ? " selected" : "") + ">" + c.name + "</option>"
    ).join("");

    updateViewModeButtons();

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
  initTopbarBehavior();
  initPinchZoom();
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
function updateViewModeButtons() {
  document.querySelectorAll(".vm-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.mode === viewMode)
  );
}

async function setViewMode(mode) {
  viewMode = mode;
  updateViewModeButtons();
  await fetch("/api/books/" + bookId, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ view_mode: mode })
  });
  if (pageFlipInstance) { try { pageFlipInstance.destroy(); } catch(e){} pageFlipInstance = null; }
  ["pdfScrollViewer","pdfPageViewer","pdfBookViewer","pdfSpreadViewer","epubViewer","unsupportedViewer"]
    .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = "none"; });
  // Solo el modo scroll usa el documento como scroller; pagina y EPUB dependen
  // del shell de alto fijo. initPDFScroll la vuelve a poner si corresponde.
  document.documentElement.classList.remove("doc-scroll");
  if (currentBook.format.toUpperCase() === "PDF") await initPDF();
  toast("Modo: " + mode);
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
  // Solo el modo scroll re-escala al cambiar el ancho; si se cambia a otro
  // modo hay que soltar el handler viejo para no redibujar un viewer oculto.
  _scrollRerender = null;
  if (viewMode === "scroll")  await initPDFScroll();
  else if (viewMode === "page")   await initPDFPage();
  else if (viewMode === "book")   await initPDFBook();
  else if (viewMode === "spread") await initPDFSpread();
}

let _pdfOffset = 0;

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
  }, delay == null ? 200 : delay);
}

window.addEventListener("resize", () => scheduleScrollRerender());
window.addEventListener("orientationchange", () => scheduleScrollRerender(350));

async function initPDFScroll() {
  const viewer = document.getElementById("pdfScrollViewer");
  viewer.style.display = "flex";
  const wrap  = document.getElementById("pdfScrollWrap");
  const info  = document.getElementById("pdfScrollInfo");
  const input = document.getElementById("pdfScrollPageInput");
  input.max = pdfTotal;
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
  }

  const startIdx = Math.max(0, pdfPage - 1);
  await renderOne(startIdx);
  // scrollIntoView tambien puede scrollear la ventana/documento entero (no
  // solo este contenedor), tapando la topbar arriba del viewport — se
  // setea el scroll directo sobre "wrap" para que quede contenido ahi.
  // Se suma el offset guardado: volver al punto exacto, no al borde de la hoja.
  S.top = S.offsetOf(wrappers[startIdx]) + _pdfOffset;

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
        pdfPage = p; info.textContent = p + " / " + pdfTotal; input.value = p;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(guardarPosicion, 1200);
      }
    }
  }, { root: S.root, threshold: [0.2, 0.5, 0.8] });
  wrappers.forEach(w => observer.observe(w));

  // Guarda pagina + cuanto se bajo DENTRO de esa pagina.
  function guardarPosicion() {
    const w = wrappers[pdfPage - 1];
    const off = w ? Math.round(S.top - S.offsetOf(w)) : 0;
    saveProgress({ page: pdfPage, total: pdfTotal, offset: off });
  }
  // El observer solo avisa al CAMBIAR de pagina; sin esto, moverse dentro de
  // una pagina larga no quedaba guardado.
  let guardarTimer = null;
  (docScroll ? window : wrap).addEventListener("scroll", () => {
    clearTimeout(guardarTimer);
    guardarTimer = setTimeout(guardarPosicion, 900);
  }, { passive: true });

  async function goPage(p) {
    if (p < 1 || p > pdfTotal) return;
    // Esperar el render ANTES de calcular el destino: la pagina pasa del alto
    // estimado al real al dibujarse, y sin esperar el salto se calculaba con el
    // layout viejo y caia una pagina mas abajo.
    await renderOne(p - 1);
    S.to(S.offsetOf(wrappers[p - 1]), true);
  }
  document.getElementById("pdfScrollPrev").onclick = () => goPage(pdfPage - 1);
  document.getElementById("pdfScrollNext").onclick = () => goPage(pdfPage + 1);
  document.getElementById("pdfScrollGo").onclick   = () => { const v = parseInt(input.value); if (v >= 1 && v <= pdfTotal) goPage(v); };
  input.onkeydown = e => { if (e.key === "Enter") document.getElementById("pdfScrollGo").click(); };
  document.getElementById("pdfScrollZoom").onchange = async e => {
    currentZoom = e.target.value === "auto" ? "auto" : e.target.value;
    done.clear();
    const center = pdfPage - 1;
    for (let i = Math.max(0, center - 2); i <= Math.min(pdfTotal - 1, center + 2); i++) {
      await renderOne(i);
    }
  };
  window._scrollGoPage = goPage;
}

// ── PAGE MODE ─────────────────────────────────────────────────────────────────
async function initPDFPage() {
  const viewer = document.getElementById("pdfPageViewer");
  viewer.style.display = "flex";
  const wrap   = document.getElementById("pdfPageWrap");
  const canvas = document.getElementById("pdfPageCanvas");
  const info   = document.getElementById("pdfPageInfo");
  const input  = document.getElementById("pdfPageInput");
  input.max = pdfTotal;

  async function render(dir) {
    const page = await pdfDoc.getPage(pdfPage);
    if (dir) {
      canvas.style.transition = "none";
      canvas.style.opacity    = "0";
      canvas.style.transform  = dir > 0 ? "translateX(30px)" : "translateX(-30px)";
    }
    // Envolver canvas en contenedor para text layer
    if (!wrap.classList.contains("pdf-page-container")) {
      wrap.classList.add("pdf-page-container");
    }
    await renderPageWithTextLayer(page, canvas, wrap.clientWidth, S.viewportH);
    info.textContent = pdfPage + " / " + pdfTotal;
    input.value = pdfPage;
    saveProgress({ page: pdfPage, total: pdfTotal });
    requestAnimationFrame(() => {
      canvas.style.transition = "opacity .22s ease, transform .22s ease";
      canvas.style.opacity    = "1";
      canvas.style.transform  = "translateX(0)";
    });
  }

  async function go(delta) {
    const next = pdfPage + delta;
    if (next < 1 || next > pdfTotal) return;
    pdfPage = next;
    await render(delta);
  }

  await render(null);

  document.getElementById("pdfPagePrev").onclick      = () => go(-1);
  document.getElementById("pdfPageNext").onclick      = () => go(1);
  document.getElementById("pdfPageArrowPrev").onclick = () => go(-1);
  document.getElementById("pdfPageArrowNext").onclick = () => go(1);
  document.getElementById("pdfPageGo").onclick = () => {
    const v = parseInt(input.value);
    if (v >= 1 && v <= pdfTotal) { const d = v - pdfPage; pdfPage = v; render(d || 1); }
  };
  input.onkeydown = e => { if (e.key === "Enter") document.getElementById("pdfPageGo").click(); };
  document.getElementById("pdfPageZoom").onchange = async e => {
    currentZoom = e.target.value === "auto" ? "auto" : e.target.value;
    await render(null);
  };

  // Auto-ocultar footer
  const footer = document.getElementById("pdfPageFooter");
  let hideTimer = null;
  function showFooter() {
    footer.classList.remove("hidden");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => footer.classList.add("hidden"), 3000);
  }
  viewer.addEventListener("mousemove",  showFooter);
  viewer.addEventListener("click",      showFooter);
  viewer.addEventListener("touchstart", showFooter, { passive: true });
  showFooter();

  window._pdfPageGo = go;
}

// ── BOOK MODE (StPageFlip) ────────────────────────────────────────────────────
async function initPDFBook() {
  const viewer = document.getElementById("pdfBookViewer");
  viewer.style.display = "flex";
  const wrap = document.getElementById("bookFlipWrap");
  await new Promise(r => setTimeout(r, 80));
  const W = wrap.clientWidth, H = wrap.clientHeight - 48;
  const pageW = Math.floor(Math.min(W / 2, H * 0.7));
  const pageH = Math.floor(pageW * 1.41);
  const loadedPages = {};

  async function getPageCanvas(num) {
    if (loadedPages[num]) return loadedPages[num];
    const c = document.createElement("canvas");
    const page = await pdfDoc.getPage(num);
    await renderPageToCanvas(page, c, pageW, pageH);
    c.style.width = pageW + "px"; c.style.height = pageH + "px";
    loadedPages[num] = c;
    return c;
  }

  const container = document.getElementById("bookPagesContainer");
  container.innerHTML = "";
  container.style.width = pageW + "px"; container.style.height = pageH + "px";
  const pages = [];

  for (let i = 1; i <= pdfTotal; i++) {
    const div = document.createElement("div");
    div.className = "book-page-item";
    div.style.cssText = "width:" + pageW + "px;height:" + pageH + "px;background:#f5f0e8;";
    div.dataset.page = i;
    container.appendChild(div);
    pages.push(div);
  }

  pageFlipInstance = new St.PageFlip(container, {
    width: pageW, height: pageH, size: "fixed",
    drawShadow: true, flippingTime: 700,
    usePortrait: true, startZIndex: 0,
    autoSize: false, showCover: false,
    mobileScrollSupport: false,
  });
  pageFlipInstance.loadFromHTML(document.querySelectorAll(".book-page-item"));

  async function renderVisible(pageNum) {
    const toRender = [pageNum, pageNum+1, pageNum+2, pageNum-1].filter(n => n >= 1 && n <= pdfTotal);
    for (const n of toRender) {
      const div = pages[n-1];
      if (div && !div.dataset.rendered) {
        div.dataset.rendered = "1";
        const c = await getPageCanvas(n);
        div.innerHTML = ""; div.appendChild(c);
      }
    }
  }

  pageFlipInstance.on("flip", async e => {
    pdfPage = e.data + 1;
    document.getElementById("bookPageInfo").textContent = pdfPage + " / " + pdfTotal;
    saveProgress({ page: pdfPage, total: pdfTotal });
    await renderVisible(pdfPage);
  });

  if (pdfPage > 1) pageFlipInstance.turnToPage(pdfPage - 1);
  await renderVisible(pdfPage);
  document.getElementById("bookPrev").onclick = () => pageFlipInstance.flipPrev();
  document.getElementById("bookNext").onclick = () => pageFlipInstance.flipNext();
  document.getElementById("bookPageInfo").textContent = pdfPage + " / " + pdfTotal;
  window._bookFlip = pageFlipInstance;
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
  const H = Math.max(wrap.clientHeight - 60, 300);
  const pageW = Math.floor(Math.min(W / 2 - 4, H * 0.72));
  const pageH = Math.floor(pageW * 1.414); // A4 ratio

  const container = document.getElementById("bookPagesContainerSpread");
  container.innerHTML = "";
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
      const page = await pdfDoc.getPage(pageNum);
      const vp0  = page.getViewport({ scale: 1 });
      const scale = Math.min(pageW / vp0.width, pageH / vp0.height) * DPR;
      const vp = page.getViewport({ scale });
      const c = document.createElement("canvas");
      c.width  = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      c.style.cssText = "width:100%;height:100%;display:block;";
      await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
      div.innerHTML = "";
      div.appendChild(c);
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

  // Renderizar las primeras 4 paginas y la actual
  const initialPages = [1, 2, pdfPage, pdfPage + 1].filter((n, i, a) => n >= 1 && n <= pdfTotal && a.indexOf(n) === i);
  for (const n of initialPages) await renderOne(n);

  if (pdfPage > 1) pf.turnToPage(pdfPage - 1);

  const info  = document.getElementById("spreadPageInfo");
  const input = document.getElementById("spreadPageInput");
  info.textContent = pdfPage + " / " + pdfTotal;
  input.value = pdfPage;

  pf.on("flip", e => {
    pdfPage = e.data + 1;
    info.textContent  = pdfPage + " / " + pdfTotal;
    input.value = pdfPage;
    saveProgress({ page: pdfPage, total: pdfTotal });
    // Renderizar las siguientes en background sin bloquear
    [pdfPage, pdfPage+1, pdfPage+2, pdfPage+3, pdfPage-1]
      .filter(n => n >= 1 && n <= pdfTotal)
      .forEach(n => renderOne(n));
  });

  document.getElementById("spreadPrev").onclick = () => pf.flipPrev();
  document.getElementById("spreadNext").onclick = () => pf.flipNext();
  document.getElementById("spreadGo").onclick   = () => {
    const v = parseInt(input.value);
    if (v >= 1 && v <= pdfTotal) pf.turnToPage(v - 1);
  };
  input.onkeydown = e => { if (e.key === "Enter") document.getElementById("spreadGo").click(); };
  window._spreadFlip = dir => dir > 0 ? pf.flipNext() : pf.flipPrev();

  // Auto-ocultar footer
  const footer = document.getElementById("pdfSpreadFooter");
  let hideT = null;
  function showF() {
    footer.classList.remove("hidden");
    clearTimeout(hideT);
    hideT = setTimeout(() => footer.classList.add("hidden"), 3000);
  }
  viewer.addEventListener("mousemove",  showF);
  viewer.addEventListener("click",      showF);
  viewer.addEventListener("touchstart", showF, { passive: true });
  showF();
}

// ── EPUB ──────────────────────────────────────────────────────────────────────
function initEPUB() {
  document.documentElement.classList.remove("doc-scroll");
  document.getElementById("epubViewer").style.display = "flex";
  const book = ePub("/api/books/" + bookId + "/file");
  epubRendition = book.renderTo(document.getElementById("epubArea"), { width: "100%", height: "100%", spread: "none" });
  fetchProgress().then(p => { if (p.cfi) epubRendition.display(p.cfi); else epubRendition.display(); });
  document.getElementById("epubPrev").onclick = () => epubRendition.prev();
  document.getElementById("epubNext").onclick = () => epubRendition.next();
  epubRendition.on("relocated", loc => saveProgress({ cfi: loc.start.cfi, percentage: loc.start.percentage }));
  document.getElementById("epubFont").onchange   = e => epubRendition.themes.font(e.target.value);
  document.getElementById("epubFontSize").oninput = e => epubRendition.themes.fontSize(e.target.value + "px");
  document.getElementById("epubTheme").onchange  = e => {
    const t = { light: { body: { background: "#fff", color: "#111" } }, dark: { body: { background: "#0d0d0d", color: "#e2e2e2" } }, sepia: { body: { background: "#f4ecd8", color: "#3b2a1a" } } };
    epubRendition.themes.register("t", t[e.target.value]); epubRendition.themes.select("t");
  };
}

function initUnsupported() {
  document.documentElement.classList.remove("doc-scroll");
  document.getElementById("unsupportedViewer").style.display = "flex";
  document.getElementById("btnDownloadUnsupported").onclick = () => window.open("/api/books/" + bookId + "/file?download=1");
}

// ── Progress & Bookmarks ──────────────────────────────────────────────────────
async function fetchProgress() {
  try { return await (await fetch("/api/books/" + bookId + "/progress?device_id=" + deviceId)).json(); } catch { return {}; }
}
function saveProgress(data) {
  fetch("/api/books/" + bookId + "/progress?device_id=" + deviceId, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
  });
}

async function loadBookmarks() {
  const bms = await (await fetch("/api/books/" + bookId + "/bookmarks?device_id=" + deviceId)).json();
  const ul  = document.getElementById("bmList");
  ul.innerHTML = bms.length ? "" : "<li style='padding:.75rem 1rem;color:var(--text-muted);font-size:.82rem'>Sin bookmarks</li>";
  bms.forEach(bm => {
    const li = document.createElement("li"); li.className = "bm-item";
    const pos = typeof bm.position === "string" ? JSON.parse(bm.position) : bm.position;
    li.innerHTML = "<div><div class='bm-label'>" + (bm.label||"Bookmark") + "</div><div class='bm-page'>Pag " + (pos.page||"?") + "</div></div>" +
      "<button class='bm-del'><svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><path d='M18 6 6 18M6 6l12 12'/></svg></button>";
    li.querySelector(".bm-del").onclick = async e => {
      e.stopPropagation();
      await fetch("/api/books/" + bookId + "/bookmarks/" + bm.id + "?device_id=" + deviceId, { method: "DELETE" });
      loadBookmarks();
    };
    if (pos.page) li.onclick = async e => {
      if (e.target.closest(".bm-del")) return;
      pdfPage = pos.page;
      if (viewMode === "scroll" && window._scrollGoPage) window._scrollGoPage(pdfPage);
      else if (viewMode === "page" && window._pdfPageGo) window._pdfPageGo(pos.page - pdfPage);
    };
    ul.appendChild(li);
  });
}

async function saveBookmark() {
  const label    = document.getElementById("bmNameInput").value.trim();
  const position = pdfDoc ? { page: pdfPage } : {};
  await fetch("/api/books/" + bookId + "/bookmarks?device_id=" + deviceId, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, position })
  });
  closeModal("modalBookmark"); loadBookmarks(); toast("Bookmark guardado");
}

async function renameBook() {
  const newTitle = document.getElementById("infoTitleInput").value.trim();
  if (!newTitle || newTitle === currentBook.title) return;
  const res = await fetch("/api/books/" + bookId, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: newTitle })
  });
  if (res.ok) {
    const u = await res.json();
    currentBook.title = u.title;
    document.getElementById("readerTitle").textContent = u.title;
    document.title = u.title;
    toast("Nombre actualizado");
    document.getElementById("infoPanel").classList.remove("open");
  }
}

// ── Bind all ──────────────────────────────────────────────────────────────────
function bindAll() {
  const bmPanel   = document.getElementById("bookmarksPanel");
  const infoPanel = document.getElementById("infoPanel");
  const pageUrl   = window.location.origin + "/read/" + bookId;

  // Teclado
  document.addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      if      (viewMode === "page"   && window._pdfPageGo)   window._pdfPageGo(1);
      else if (viewMode === "book"   && pageFlipInstance)     pageFlipInstance.flipNext();
      else if (viewMode === "spread" && window._spreadFlip)   window._spreadFlip(1);
      else if (epubRendition) epubRendition.next();
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      if      (viewMode === "page"   && window._pdfPageGo)   window._pdfPageGo(-1);
      else if (viewMode === "book"   && pageFlipInstance)     pageFlipInstance.flipPrev();
      else if (viewMode === "spread" && window._spreadFlip)   window._spreadFlip(-1);
      else if (epubRendition) epubRendition.prev();
    }
    if (e.key === "f") toggleFullscreen();
    if (e.key === "Escape") {
      [bmPanel, infoPanel].forEach(p => p.classList.remove("open"));
      document.getElementById("searchBarReader").style.display = "none";
    }
  });

  // View mode
  document.querySelectorAll(".vm-btn").forEach(btn =>
    btn.addEventListener("click", () => setViewMode(btn.dataset.mode))
  );

  // Bookmarks
  document.getElementById("btnBookmark").onclick = () => {
    document.getElementById("bmNameInput").value = "";
    openModal("modalBookmark");
    setTimeout(() => document.getElementById("bmNameInput").focus(), 80);
  };
  document.getElementById("btnSaveBookmark").onclick    = saveBookmark;
  document.getElementById("bmNameInput").onkeydown      = e => { if (e.key === "Enter") saveBookmark(); };
  document.getElementById("btnBookmarkList").onclick    = () => { togglePanel(bmPanel); infoPanel.classList.remove("open"); };
  document.getElementById("closeBmPanel").onclick       = () => bmPanel.classList.remove("open");

  // Info panel
  document.getElementById("btnInfo").onclick            = () => { togglePanel(infoPanel); bmPanel.classList.remove("open"); };
  document.getElementById("closeInfoPanel").onclick     = () => infoPanel.classList.remove("open");
  document.getElementById("btnRenameBook").onclick      = renameBook;
  document.getElementById("infoTitleInput").onkeydown   = e => { if (e.key === "Enter") renameBook(); };
  document.getElementById("btnMoveCollection").onclick  = async () => {
    const colId = parseInt(document.getElementById("infoCollection").value);
    await fetch("/api/books/" + bookId, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collection_id: colId }) });
    currentBook.collection_id = colId; toast("Coleccion actualizada"); infoPanel.classList.remove("open");
  };

  // Search
  document.getElementById("btnSearch").onclick = () => toggleSearchBar();
  document.getElementById("btnSearchClose").onclick     = () => toggleSearchBar(false);
  document.getElementById("searchTextInput").onkeydown  = e => { if (e.key === "Enter") searchInPDF(e.target.value); };
  document.getElementById("btnSearchNext").onclick      = () => navigateSearch(1);
  document.getElementById("btnSearchPrev").onclick      = () => navigateSearch(-1);

  // Highlight
  document.getElementById("btnHighlight").onclick = () => {
    highlightMode = !highlightMode;
    document.getElementById("btnHighlight").style.color = highlightMode ? "var(--accent)" : "";
    toast(highlightMode ? "Subrayado activo — selecciona texto" : "Subrayado desactivado");
    if (!highlightMode) { document.getElementById("highlightToolbar").style.display = "none"; window.getSelection()?.removeAllRanges(); }
  };
  document.querySelectorAll(".hl-color").forEach(btn => {
    btn.onclick = () => { selectedColor = btn.dataset.color; document.querySelectorAll(".hl-color").forEach(b => b.classList.remove("selected")); btn.classList.add("selected"); };
  });
  if (document.querySelector(".hl-color")) document.querySelector(".hl-color").classList.add("selected");
  document.addEventListener("mouseup", () => {
    if (!highlightMode) return;
    const sel = window.getSelection();
    const toolbar = document.getElementById("highlightToolbar");
    if (!sel || sel.isCollapsed) { toolbar.style.display = "none"; return; }
    const text = sel.toString().trim();
    if (!text) { toolbar.style.display = "none"; return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    toolbar.style.display = "flex";
    toolbar.style.top  = Math.max(8, rect.top - 52) + "px";
    toolbar.style.left = Math.max(8, rect.left + rect.width/2 - 90) + "px";
  });
  document.getElementById("btnApplyHighlight").onclick = async () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (!text) return;
    await fetch("/api/books/" + bookId + "/highlights", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, color: selectedColor, page: pdfPage, device_id: deviceId })
    });
    document.getElementById("highlightToolbar").style.display = "none";
    sel.removeAllRanges();
    toast("Subrayado guardado");
  };

  // Fullscreen
  document.getElementById("btnFullscreen").onclick = toggleFullscreen;
  document.addEventListener("fullscreenchange",       updateFullscreenBtn);
  document.addEventListener("webkitfullscreenchange", updateFullscreenBtn);

  // Descargar y compartir
  document.getElementById("btnDownloadReader").onclick = () => window.open("/api/books/" + bookId + "/file?download=1");
  document.getElementById("btnShareReader").onclick = async () => {
    if (navigator.share) { try { await navigator.share({ title: currentBook.title, url: pageUrl }); return; } catch {} }
    try { await navigator.clipboard.writeText(pageUrl); } catch { const ta = document.createElement("textarea"); ta.value = pageUrl; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); }
    toast("Link copiado");
  };
  document.getElementById("btnWhatsappPanel").onclick = () => window.open("https://wa.me/?text=" + encodeURIComponent(currentBook.title + " — " + pageUrl));

  // Enviar a otro usuario
  document.getElementById("btnSendToUser").onclick = async () => {
    const sel = document.getElementById("sendUserSelect");
    try {
      const users = await (await fetch("/api/users")).json();
      if (!users.length) { toast("No hay otros usuarios todavia"); return; }
      sel.innerHTML = users.map(u => "<option value='" + u.id + "'>" + u.username + "</option>").join("");
      openModal("modalSendUser");
    } catch { toast("Error al cargar usuarios"); }
  };
  document.getElementById("btnConfirmSendUser").onclick = async () => {
    const toUserId = document.getElementById("sendUserSelect").value;
    if (!toUserId) return;
    const res = await fetch("/api/books/" + bookId + "/share", {
      method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ to_user_id: toUserId })
    });
    const data = await res.json();
    closeModal("modalSendUser");
    toast(res.ok ? "Libro enviado" : (data.error || "Error"));
  };

  // Guardar sin conexion
  document.getElementById("btnOffline").onclick = toggleOffline;
  refreshOfflineBtn();

  // Eliminar
  document.getElementById("btnDeleteReader").onclick  = () => openModal("modalDelete");
  document.getElementById("btnCancelDelete").onclick  = () => closeModal("modalDelete");
  document.getElementById("btnConfirmDelete").onclick = async () => { await fetch("/api/books/" + bookId, { method: "DELETE" }); window.location.href = "/"; };

  // Modales
  document.querySelectorAll(".modal-close").forEach(btn => btn.addEventListener("click", () => closeModal(btn.dataset.modal)));
  document.querySelectorAll(".modal-overlay").forEach(o => o.addEventListener("click", e => { if (e.target === o) closeModal(o.id); }));

  // Touch
  initTouch();
}

// ── Search en PDF ─────────────────────────────────────────────────────────────
async function searchInPDF(query) {
  if (!pdfDoc || !query.trim()) return;
  searchMatches = []; searchIdx = 0;
  const el = document.getElementById("searchResults");
  el.textContent = "Buscando...";
  for (let i = 1; i <= pdfTotal; i++) {
    const page = await pdfDoc.getPage(i);
    const content = await page.getTextContent();
    if (content.items.map(s => s.str).join(" ").toLowerCase().includes(query.toLowerCase())) searchMatches.push(i);
  }
  if (!searchMatches.length) { el.textContent = "Sin resultados"; return; }
  searchIdx = 0; el.textContent = "1/" + searchMatches.length;
  pdfPage = searchMatches[0];
  if (viewMode === "scroll" && window._scrollGoPage) window._scrollGoPage(pdfPage);
  else if (viewMode === "page" && window._pdfPageGo) { const d = pdfPage - (pdfPage); window._pdfPageGo(d||1); }
}

async function navigateSearch(dir) {
  if (!searchMatches.length) return;
  searchIdx = (searchIdx + dir + searchMatches.length) % searchMatches.length;
  pdfPage = searchMatches[searchIdx];
  document.getElementById("searchResults").textContent = (searchIdx+1) + "/" + searchMatches.length;
  if (viewMode === "scroll" && window._scrollGoPage) window._scrollGoPage(pdfPage);
}

// ── Touch gestos con inercia ──────────────────────────────────────────────────
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
      if      (viewMode === "page"   && window._pdfPageGo)   window._pdfPageGo(dir);
      else if (viewMode === "book"   && pageFlipInstance)     dir > 0 ? pageFlipInstance.flipNext() : pageFlipInstance.flipPrev();
      else if (viewMode === "spread" && window._spreadFlip)   window._spreadFlip(dir);
      else if (viewMode === "scroll" && window._scrollGoPage) window._scrollGoPage(pdfPage + dir);
      else if (epubRendition) dir > 0 ? epubRendition.next() : epubRendition.prev();
      return;
    }
    // El modo scroll NO lleva inercia propia. Tenia una, y hacia dos danos:
    //  - Estaba rota: usaba `S`, que vive dentro de initPDFScroll, asi que
    //    tiraba "S is not defined" en cada gesto, sin senal visible.
    //  - Aunque funcionara, sobra. Desde que el lector scrollea el DOCUMENTO
    //    (v1.5.6), el navegador ya aplica su propia inercia; sumarle otra deja
    //    dos motores moviendo la pagina a la vez, que es de donde salian los
    //    tirones y la sensacion de scroll cortado.
    // Los gestos horizontales de arriba si se mantienen: los otros modos no
    // tienen scroll nativo que los resuelva.
  }, { passive: true });
}

// ── Topbar hide/show ──────────────────────────────────────────────────────────
function initTopbarBehavior() {
  if (window.innerWidth > 640) return;

  const topbar     = document.getElementById("readerTopbar");
  const scrollCtrl = document.getElementById("pdfControls");
  let uiVisible  = true;
  let lastTapTime = 0;

  function showUI() {
    uiVisible = true;
    [topbar, scrollCtrl].forEach(el => {
      if (!el) return;
      el.style.transition  = "transform .25s ease, opacity .25s ease";
      el.style.transform   = "translateY(0)";
      el.style.opacity     = "1";
      el.style.pointerEvents = "";
    });
  }

  function hideUI() {
    uiVisible = false;
    if (topbar) {
      topbar.style.transition  = "transform .25s ease, opacity .25s ease";
      topbar.style.transform   = "translateY(-110%)";
      topbar.style.opacity     = "0";
      topbar.style.pointerEvents = "none";
    }
    if (scrollCtrl) {
      scrollCtrl.style.transition  = "transform .25s ease, opacity .25s ease";
      scrollCtrl.style.transform   = "translateY(-110%)";
      scrollCtrl.style.opacity     = "0";
      scrollCtrl.style.pointerEvents = "none";
    }
  }

  // Doble tap en cualquier parte del viewer para toggle
  document.addEventListener("touchend", function(e) {
    if (e.target.closest(".side-panel, .modal-overlay, #readerTopbar, #pdfControls, button, a, input, select")) return;
    const now = Date.now();
    if (now - lastTapTime < 300) {
      if (uiVisible) hideUI(); else showUI();
      lastTapTime = 0;
    } else {
      lastTapTime = now;
    }
  }, { passive: true });

  window.addEventListener("resize", () => { if (window.innerWidth > 640) showUI(); });
}

// ── Fullscreen ────────────────────────────────────────────────────────────────
let _fsTimer = null;
let _lastTap = 0;

let _topbarHidden = false;

function _showTopbar() {
  const tb = document.getElementById("readerTopbar");
  if (!tb) return;
  tb.style.transition = "transform .25s ease";
  tb.style.transform  = "translateY(0)";
  if (window.innerWidth <= 640) {
    ["pdfScrollViewer","pdfPageViewer","pdfBookViewer","epubViewer","pdfSpreadViewer"].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.style.marginTop = ""; el.style.transition = ""; }
    });
  }
  _topbarHidden = false;
  clearTimeout(_fsTimer);
}

// La topbar se queda como la dejaste: el doble tap la alterna y no hay
// auto-ocultado por tiempo. Antes se escondia sola a los 3 segundos, lo que
// hacia impredecible si un doble tap la iba a mostrar o a esconder.
function _toggleTopbar() {
  if (_topbarHidden) _showTopbar(); else _hideTopbar();
}

function _hideTopbar() {
  const tb = document.getElementById("readerTopbar");
  if (!tb) return;
  const h = tb.offsetHeight || 52;
  tb.style.transition = "transform .25s ease";
  tb.style.transform  = "translateY(-" + h + "px)";
  _topbarHidden = true;
  // Nada de margenes negativos sobre el viewer: en mobile la topbar es
  // position:fixed, o sea que ya esta fuera del flujo y el viewer siempre
  // ocupo la pantalla entera. Subirlo "para llenar el hueco" solo lograba
  // destapar la misma cantidad de pixeles ABAJO, donde se veia el fondo
  // del body (--bg) como una banda negra sobre el libro.
}

function enterFullscreen() {
  const el = document.documentElement;
  if (el.requestFullscreen)            el.requestFullscreen().catch(()=>{});
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  document.body.classList.add("reader-fullscreen");
  isFullscreen = true;
  updateFullscreenBtn();
  if (window.innerWidth <= 640) {
    // En iOS requestFullscreen no existe (solo aplica a <video>), asi que en
    // mobile "fullscreen" es puramente CSS: para ganar de verdad la pantalla
    // hay que ocultar la topbar ya. Doble tap la vuelve a mostrar.
    _hideTopbar();
  }
  // La hoja ahora tiene mas ancho disponible: re-escalar (esperar a que el
  // CSS de fullscreen aplique antes de medir).
  scheduleScrollRerender(320);
}

function exitFullscreen() {
  if (document.exitFullscreen)            document.exitFullscreen().catch(()=>{});
  else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  document.body.classList.remove("reader-fullscreen");
  isFullscreen = false;
  clearTimeout(_fsTimer);
  // _showTopbar limpia cualquier margen inline que haya quedado de una
  // sesion vieja (antes _hideTopbar los aplicaba).
  _showTopbar();
  const tb = document.getElementById("readerTopbar");
  if (tb) { tb.style.transform = ""; tb.style.opacity = ""; tb.style.transition = ""; }
  updateFullscreenBtn();
  scheduleScrollRerender(320);
}

function toggleFullscreen() {
  if (isFullscreen || document.fullscreenElement) exitFullscreen(); else enterFullscreen();
}

function updateFullscreenBtn() {
  const btn = document.getElementById("btnFullscreen"); if (!btn) return;
  const inFs = isFullscreen || !!document.fullscreenElement;
  btn.innerHTML = inFs
    ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>'
    : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
}

// Doble tap para mostrar topbar en fullscreen mobile
document.addEventListener("touchend", function(e) {
  if (window.innerWidth > 640) return;
  if (e.target.closest(".side-panel, .modal-overlay, #readerTopbar")) return;
  const now = Date.now();
  if (now - _lastTap < 300) {
    _toggleReaderNav();
    _lastTap = 0;
  } else {
    _lastTap = now;
  }
}, { passive: true });

// Fullscreen change nativo
document.addEventListener("fullscreenchange",       updateFullscreenBtn);
document.addEventListener("webkitfullscreenchange", updateFullscreenBtn);

// ── Pinch zoom ────────────────────────────────────────────────────────────────
function initPinchZoom() {
  // Zoom nativo del browser — no interferir con pinch
  // El browser maneja pinch-to-zoom nativamente en mobile
  // Solo necesitamos asegurarnos que el viewport lo permite
  // No hacemos nada — el zoom nativo es mejor que cualquier implementacion custom
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function togglePanel(panel) { panel.classList.toggle("open"); }
function openModal(id)  { document.getElementById(id).style.display = "flex"; }
function closeModal(id) { document.getElementById(id).style.display = "none"; }
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

const ICON_SAVE  = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 13v8"/><path d="M4 14.9A5 5 0 0 1 7 6a6 6 0 0 1 11.6 2A4.5 4.5 0 0 1 20 15"/><polyline points="8 17 12 21 16 17"/></svg>';
const ICON_SAVED = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14.9A5 5 0 0 1 7 6a6 6 0 0 1 11.6 2A4.5 4.5 0 0 1 20 15"/><polyline points="9 15 11 17 15 12"/></svg>';

async function isBookOffline() {
  if (!("caches" in window)) return false;
  try {
    const cache = await caches.open(OFFLINE_CACHE);
    return !!(await cache.match(BOOK_FILE_URL, { ignoreSearch: true }));
  } catch { return false; }
}

async function refreshOfflineBtn() {
  const btn = document.getElementById("btnOffline");
  if (!btn) return;
  if (!("caches" in window)) { btn.style.display = "none"; return; }
  const saved = await isBookOffline();
  btn.dataset.saved = saved ? "1" : "0";
  document.getElementById("btnOfflineIcon").innerHTML = saved ? ICON_SAVED : ICON_SAVE;
  document.getElementById("btnOfflineLabel").textContent =
    saved ? "Disponible sin conexion" : "Guardar sin conexion";
}

async function toggleOffline() {
  const btn = document.getElementById("btnOffline");
  if (!btn || btn.disabled) return;
  const saved = btn.dataset.saved === "1";
  btn.disabled = true;
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
      document.getElementById("btnOfflineLabel").textContent = "Guardando...";
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
    btn.disabled = false;
    refreshOfflineBtn();
  }
}

init();

// ── Magnifier (lupa rectangular) para modo Spread ────────────────────────────
let magnifierActive = false;
const LENS_W = 280, LENS_H = 200;   // tamaño del recuadro lupa
const CURSOR_W = 140, CURSOR_H = 100; // area de captura (la mitad = zoom 2x)
const ZOOM = 2;

function initMagnifier() {
  const btn     = document.getElementById("btnMagnifier");
  const lens    = document.getElementById("magnifierLens");
  const lensCtx = document.getElementById("magnifierCanvas").getContext("2d");
  const cursor  = document.getElementById("magnifierCursor");

  if (!btn) return;

  // Mostrar boton solo en modo spread
  function updateBtnVisibility() {
    btn.style.display = viewMode === "spread" ? "" : "none";
    if (viewMode !== "spread" && magnifierActive) deactivateMagnifier();
  }

  // Hookear setViewMode para mostrar/ocultar boton
  const _origSetViewMode = setViewMode;
  window.setViewMode = async function(mode) {
    await _origSetViewMode(mode);
    updateBtnVisibility();
  };
  updateBtnVisibility();

  // Configurar canvas de la lupa
  document.getElementById("magnifierCanvas").width  = LENS_W;
  document.getElementById("magnifierCanvas").height = LENS_H;

  btn.addEventListener("click", () => {
    if (magnifierActive) deactivateMagnifier();
    else activateMagnifier();
  });

  function activateMagnifier() {
    magnifierActive = true;
    btn.classList.add("active");
    document.body.classList.add("magnifier-active");
    lens.style.display   = "block";
    cursor.style.display = "block";
    cursor.style.width   = CURSOR_W + "px";
    cursor.style.height  = CURSOR_H + "px";
    toast("Lupa activada — mové el mouse sobre las páginas");
  }

  function deactivateMagnifier() {
    magnifierActive = false;
    btn.classList.remove("active");
    document.body.classList.remove("magnifier-active");
    lens.style.display   = "none";
    cursor.style.display = "none";
  }

  // Mover lupa con el mouse
  document.addEventListener("mousemove", e => {
    if (!magnifierActive) return;

    const mx = e.clientX, my = e.clientY;

    // Posicionar el cursor (area de captura centrado en el mouse)
    cursor.style.left = (mx - CURSOR_W / 2) + "px";
    cursor.style.top  = (my - CURSOR_H / 2) + "px";

    // Posicionar la lupa — aparece arriba-derecha del cursor, evitando bordes
    let lx = mx + 20;
    let ly = my - LENS_H - 20;
    if (lx + LENS_W > window.innerWidth  - 10) lx = mx - LENS_W - 20;
    if (ly < 10) ly = my + 20;
    lens.style.left = lx + "px";
    lens.style.top  = ly + "px";

    // Obtener canvases visibles del spread viewer
    const spreadContainer = document.getElementById("bookPagesContainerSpread");
    if (!spreadContainer) return;
    const canvases = spreadContainer.querySelectorAll("canvas");
    if (!canvases.length) return;

    // Limpiar canvas de la lupa
    lensCtx.clearRect(0, 0, LENS_W, LENS_H);
    lensCtx.fillStyle = "#f0ebe0";
    lensCtx.fillRect(0, 0, LENS_W, LENS_H);

    // Para cada canvas del spread, ver si el mouse está sobre él y ampliar
    canvases.forEach(srcCanvas => {
      const rect = srcCanvas.getBoundingClientRect();
      // Area de captura en coordenadas del canvas
      const srcX = (mx - rect.left - CURSOR_W / 2) * (srcCanvas.width / rect.width);
      const srcY = (my - rect.top  - CURSOR_H / 2) * (srcCanvas.height / rect.height);
      const srcW = CURSOR_W * (srcCanvas.width  / rect.width);
      const srcH = CURSOR_H * (srcCanvas.height / rect.height);

      // Solo dibujar si el mouse está sobre este canvas
      if (mx >= rect.left && mx <= rect.right && my >= rect.top && my <= rect.bottom) {
        // Calcular offset en el lens para centrar
        const dstX = (LENS_W - CURSOR_W * ZOOM) / 2;
        const dstY = (LENS_H - CURSOR_H * ZOOM) / 2;
        try {
          lensCtx.drawImage(srcCanvas, srcX, srcY, srcW, srcH, dstX, dstY, CURSOR_W * ZOOM, CURSOR_H * ZOOM);
        } catch(e) {}
      }
    });
  });

  // Desactivar con Escape
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && magnifierActive) deactivateMagnifier();
  });
}

// Inicializar cuando el DOM esté listo
initMagnifier();
