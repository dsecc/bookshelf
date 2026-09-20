// Panel desplegable compartido entre la biblioteca y el lector.
// Las dos pantallas cargan este archivo antes que el suyo propio.

// ── Panel que crece desde la pildora ─────────────────────────────────────────
// Portado de asmodeloscentral: el panel no es una hoja aparte sino la barra
// misma estirandose. Dos fases (montar / .open) porque un clip-path solo anima
// si el elemento ya estuvo en el DOM con el valor inicial aplicado; con una
// sola pasada el navegador colapsa ambos estados y no se ve la transicion.
const NAV_SHEET_CLOSE_MS = 220;
let _navSheetClosing = null;
// El callback de limpieza vive aca y no en el que cierra, porque el panel se
// puede cerrar por varios caminos: el fondo, una fila que navega, o codigo
// ajeno (doUpload llama closeModal al terminar). Si la limpieza colgara de uno
// solo de esos, cerrar por otro dejaria el panel de "Subir" sin sus nodos.
let _navSheetOnClose = null;

function _navSheetCleanup() {
  const fn = _navSheetOnClose;
  _navSheetOnClose = null;
  if (fn) fn();
}

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

