// Markdown -> HTML, chico y seguro por construccion.
//
// No usa ninguna libreria: TODO el texto se escapa antes de darle formato, asi
// que un .md nunca puede meter HTML propio (ni <script>, ni onerror=, ni
// estilos). Importa porque los libros se comparten entre usuarios: un .md
// ajeno se renderiza en tu sesion. La contra es que el HTML crudo dentro de un
// .md se ve como texto, no se interpreta.
//
// Cubre lo que se usa en notas tipo Obsidian: titulos, parrafos, negrita,
// italica, tachado, ==resaltado==, codigo, bloques de codigo, citas, listas
// (anidadas y de tareas), tablas, separadores, links, imagenes y [[wikilinks]]
// (estos se muestran, pero no navegan).
const MdLite = (() => {
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // Solo esquemas inofensivos. Recibe la URL ya escapada.
  function safeUrl(u) {
    const t = u.trim();
    if (/^(https?:|mailto:)/i.test(t)) return t;
    if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return null; // javascript:, data:, etc.
    return t; // relativa o #ancla
  }

  // ── Inline ────────────────────────────────────────────────────────────────
  function inline(text) {
    // Los `code spans` se separan primero: adentro no se interpreta nada.
    return text.split(/(`+)([\s\S]*?[^`])\1(?!`)/).map((part, i) => {
      if (i % 3 === 1) return "";
      if (i % 3 === 2) return "<code>" + esc(part.trim()) + "</code>";
      return inlineFormat(part);
    }).join("");
  }

  function inlineFormat(raw) {
    // Escapes de markdown (\*, \_, ...) se guardan para que no formateen.
    const keep = [];
    let s = raw.replace(/\\([\\`*_{}\[\]()#+\-.!|~=>])/g, (_, c) => { keep.push(c); return "\u0000" + (keep.length - 1) + "\u0000"; });
    s = esc(s);

    // Imagenes y links. Las imagenes solo si son http(s): una ruta relativa no
    // existe en el servidor y quedaria rota, asi que se muestra el texto.
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (m, alt, url) => {
      const u = safeUrl(url);
      if (u && /^https?:/i.test(u)) return '<img src="' + u + '" alt="' + alt + '" loading="lazy">';
      return "<em>" + (alt || url) + "</em>";
    });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (m, label, url) => {
      const u = safeUrl(url);
      if (!u) return label;
      const ext = /^https?:/i.test(u) ? ' target="_blank" rel="noopener noreferrer"' : "";
      return '<a href="' + u + '"' + ext + ">" + label + "</a>";
    });
    // [[Nota]] o [[Nota|alias]] (Obsidian)
    s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, target, alias) =>
      '<span class="md-wikilink" title="' + target + '">' + (alias || target) + "</span>");
    // URLs sueltas, que no esten ya dentro de un atributo o un link
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, (m, pre, url) =>
      pre + '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + "</a>");

    s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>")
         .replace(/__(?=\S)([\s\S]*?\S)__(?!\w)/g, "<strong>$1</strong>")
         .replace(/\*(?=\S)([\s\S]*?\S)\*/g, "<em>$1</em>")
         .replace(/(^|\W)_(?=\S)([\s\S]*?\S)_(?!\w)/g, "$1<em>$2</em>")
         .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>")
         .replace(/==(?=\S)([\s\S]*?\S)==/g, "<mark>$1</mark>");

    // En Obsidian un salto de linea dentro de un parrafo se respeta.
    s = s.replace(/\n/g, "<br>");
    return s.replace(/\u0000(\d+)\u0000/g, (_, n) => esc(keep[n]));
  }

  // ── Bloques ───────────────────────────────────────────────────────────────
  const RE = {
    fence: /^ {0,3}(`{3,}|~{3,})(.*)$/,
    heading: /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/,
    hr: /^ {0,3}([-*_])(\s*\1){2,}\s*$/,
    quote: /^ {0,3}> ?(.*)$/,
    item: /^( *)([-*+]|\d{1,9}[.)])\s+(.*)$/,
    tableSep: /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/,
  };
  const indentOf = l => l.match(/^ */)[0].length;
  // Sin lookbehind en ningun regex: Safari recien lo soporta desde iOS 16.4 y
  // en uno mas viejo rompe el archivo entero al cargarlo.
  const cells = l => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());

  function blocks(lines) {
    let out = "", i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }

      let m = line.match(RE.fence);
      if (m) {
        const fence = m[1], body = [];
        i++;
        while (i < lines.length && !(lines[i].trim().startsWith(fence[0].repeat(fence.length)) && !lines[i].trim().replace(new RegExp("^\\" + fence[0] + "+"), "").trim())) {
          body.push(lines[i]); i++;
        }
        i++; // cierre (o fin del archivo)
        out += "<pre><code>" + esc(body.join("\n")) + "</code></pre>";
        continue;
      }
      if ((m = line.match(RE.heading))) {
        const n = m[1].length;
        out += "<h" + n + ">" + inline(m[2]) + "</h" + n + ">";
        i++; continue;
      }
      if (RE.hr.test(line)) { out += "<hr>"; i++; continue; }
      if (RE.quote.test(line)) {
        const body = [];
        while (i < lines.length && lines[i].trim() && (m = lines[i].match(RE.quote))) { body.push(m[1]); i++; }
        out += "<blockquote>" + blocks(body) + "</blockquote>";
        continue;
      }
      if (RE.item.test(line)) {
        const r = list(lines, i);
        out += r.html; i = r.next; continue;
      }
      if (line.includes("|") && i + 1 < lines.length && RE.tableSep.test(lines[i + 1])) {
        const head = cells(line), aligns = cells(lines[i + 1]).map(c =>
          c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : "");
        const td = (tag, c, k) => "<" + tag + (aligns[k] ? ' style="text-align:' + aligns[k] + '"' : "") + ">" + inline(c) + "</" + tag + ">";
        let t = "<div class='md-table'><table><thead><tr>" + head.map((c, k) => td("th", c, k)).join("") + "</tr></thead><tbody>";
        i += 2;
        while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
          t += "<tr>" + cells(lines[i]).map((c, k) => td("td", c, k)).join("") + "</tr>"; i++;
        }
        out += t + "</tbody></table></div>";
        continue;
      }
      // Parrafo: hasta una linea vacia o el comienzo de otro bloque.
      const para = [];
      while (i < lines.length && lines[i].trim() &&
             !RE.fence.test(lines[i]) && !RE.heading.test(lines[i]) && !RE.hr.test(lines[i]) &&
             !RE.quote.test(lines[i]) && !(para.length && RE.item.test(lines[i]))) {
        para.push(lines[i].trim()); i++;
      }
      out += "<p>" + inline(para.join("\n")) + "</p>";
    }
    return out;
  }

  // Una lista y sus sublistas. Lo que esta mas indentado que el marcador
  // pertenece al item y se procesa como bloques propios (asi anidan).
  function list(lines, start) {
    const first = lines[start].match(RE.item);
    const base = first[1].length;
    const ordered = /\d/.test(first[2]);
    const items = [];
    let i = start, loose = false;
    while (i < lines.length) {
      const m = lines[i].match(RE.item);
      if (!m || m[1].length !== base || /\d/.test(m[2]) !== ordered) break;
      const contentIndent = m[1].length + m[2].length + 1;
      const body = [m[3]];
      i++;
      while (i < lines.length) {
        const l = lines[i];
        if (!l.trim()) {
          // Una linea vacia sigue dentro del item solo si lo que viene esta indentado.
          const nxt = lines.slice(i + 1).find(x => x.trim());
          if (nxt !== undefined && indentOf(nxt) > base) { body.push(""); i++; loose = true; continue; }
          break;
        }
        if (indentOf(l) <= base && RE.item.test(l)) break;
        if (indentOf(l) <= base && !body[body.length - 1].trim()) break;
        body.push(l.slice(Math.min(indentOf(l), contentIndent)));
        i++;
      }
      items.push(body);
    }
    const tag = ordered ? "ol" : "ul";
    const startAttr = ordered && parseInt(first[2], 10) !== 1 ? ' start="' + parseInt(first[2], 10) + '"' : "";
    const html = items.map(body => {
      let task = "";
      const t = body[0].match(/^\[([ xX])\]\s+(.*)$/);
      if (t) { task = '<input type="checkbox" disabled' + (t[1] !== " " ? " checked" : "") + "> "; body[0] = t[2]; }
      let inner = blocks(body);
      // Lista "apretada": el item es un parrafo solo, sin <p> alrededor.
      if (!loose) inner = inner.replace(/^<p>([\s\S]*?)<\/p>/, "$1");
      return "<li" + (task ? ' class="md-task"' : "") + ">" + task + inner + "</li>";
    }).join("");
    return { html: "<" + tag + startAttr + ">" + html + "</" + tag + ">", next: i };
  }

  function render(src) {
    // Front matter de YAML (--- al principio), comun en Obsidian: no se muestra.
    src = src.replace(/\r\n?/g, "\n").replace(/^---\n[\s\S]*?\n---\n/, "");
    return blocks(src.replace(/\t/g, "    ").split("\n"));
  }

  return { render };
})();

if (typeof module !== "undefined") module.exports = MdLite;
