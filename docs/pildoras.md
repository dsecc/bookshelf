# Spec: el sistema de pildoras

Estado a v1.15.5. Es la base para v1.16, donde la interfaz de PC pasa a ser la
del celu.

## 1. Idea

Toda la navegacion es **una sola pieza de vidrio** que flota sobre el
contenido: la pildora. Todo lo que se despliega desde ella (paneles, el
buscador, la barra de bookmark) es la misma pieza **estirandose**, como un
liquido. Nunca es un panel distinto que aparece encima.

Tres consecuencias que valen para todo lo nuevo:

1. **Un solo material.** La pildora, la topbar flotante, los paneles y las
   barras usan el mismo vidrio (tokens `--glass-*`, seccion 2). Adentro del
   vidrio nada es opaco: los campos, los segmentados y las filas activas usan
   rellenos translucidos.
2. **El fondo no se oscurece.** Lo que flota no tapa lo de atras; la sombra es
   lo que lo despega.
3. **Una sola capa.** Si dos piezas se superponen (la pildora y su panel, la
   pildora y el buscador), solo una dibuja vidrio en esa zona.

## 2. Material (nav.css, `:root`)

| Token | Valor | Uso |
|---|---|---|
| `--glass-bg` | `--surface` al 78% | fondo de toda pieza de vidrio |
| `--glass-blur` | `blur(20px) saturate(1.4)` | `backdrop-filter` de toda pieza |
| `--glass-border` | `--text` al 10% | borde de 1px |
| `--glass-shadow` | `0 10px 30px rgba(0,0,0,.45)` | pildora y topbar |
| `--glass-shadow-raised` | `0 22px 60px …, 0 4px 14px …` | paneles (no hay fondo oscurecido) |
| `--glass-fill` | `--text` al 7% | campos, segmentados, botones secundarios adentro |
| `--glass-fill-strong` | `--text` al 11% | estado presionado / campo en edicion |
| `--nav-active-bg` | blanco al 7% | fila o item activo / hover |
| `--nav-ease` | `cubic-bezier(.4,0,.2,1)` | toda transicion de la navegacion |

No usar `--surface2`/`--surface3` (opacos) adentro de una pieza de vidrio.

## 3. Geometria

| Variable | Celu | PC (lector) |
|---|---|---|
| `--nav-bar-height` | 60px | 58px |
| `--nav-bar-bottom` | 16px | 18px |
| `--nav-bar-side` | 16px | `(100vw - min(1080px, 100vw - 48px)) / 2` (centrada, tope 1080px) |
| `--nav-left` / `--nav-right` | `max(side, safe-area-inset-left/right + 8px)` | igual (el notch de costado no aplica) |
| `--nav-space` | alto + separacion + 12px | alto + separacion + 14px |
| `--top-nav-top` | `safe-area-inset-top + 8px` | — |
| `--top-nav-h` | 52px | — |

- Todas las piezas usan `--nav-left`/`--nav-right` para sus bordes: con el
  telefono de costado no se meten en el notch.
- La pildora mide su distancia contra el borde fisico: **no** sumarle
  `safe-area-inset-bottom`.
- La topbar flotante arranca debajo del notch / Dynamic Island
  (`safe-area-inset-top`). Requiere `viewport-fit=cover` (ya esta en las dos
  plantillas). En el navegador de escritorio esos `env()` valen 0: se calibra en
  un telefono real.
- El contenido debajo de una pildora se ve pasar por detras. Solo los
  scrollers llevan un espacio **al final** (`--nav-space`) para poder bajar lo
  ultimo por encima de la pildora; nada lleva un margen fijo que deje una
  franja vacia.

## 4. Piezas

### 4.1 Pildora (`.bottom-nav`)
Vidrio, `border-radius: 999px`, `z-index: 150`, anclada abajo.

| Donde | Contenido |
|---|---|
| Biblioteca, celu (`#bottomNav`) | 5 items de igual ancho: Colecciones, Buscar, Biblioteca, Subir (en acento), Mas. Resaltado deslizante (`.bn-indicator`) detras del item activo. |
| Lector, celu (`#readerNav`) | 4 items: Volver, Buscar, Bookmarks, Info (ruedita). Los grupos son `display: contents` y lo `.rn-desk` no se ve. |
| Lector, PC (`#readerNav`) | Grilla de 3 columnas: izquierda Volver + titulo; centro el paginador (o los ajustes de letra en TXT/MD/EPUB); derecha Buscar, Bookmarks, Lupa, Pantalla completa, Info. Items de 42px con hover. |

Items: icono de linea, trazo 1.8, 23px (celu) / 21px (PC). Sin texto.

### 4.2 Topbar flotante (`.top-nav`)
Gemela de la pildora, anclada arriba (`--top-nav-top`, 52px de alto). **Solo
en el celu y solo cuando hace falta** (atributo `hidden` si no). Con
`body.con-topnav` el contenido arranca debajo.

| Donde | Contenido |
|---|---|
| Lector (`#readerTopNav`) | Ajustes de letra de TXT/MD/EPUB: fuente, A− tamaño A+, tres temas. El mismo nodo (`#textCtl`) que en la PC va en la pildora; se muda segun el ancho (`placeTextCtl`). |
| Biblioteca (`#libTopNav`) | Solo **donde estas**: la ruta `Ciberseguridad / Malware`, la actual resaltada, cada tramo anterior lleva ahi. Aparece solo dentro de una subcarpeta. Desliza de costado si no entra. |

### 4.3 Panel (`.nav-sheet`, `openNavSheet(build, onClose)` en nav.js)
La pildora estirandose hacia arriba. Mismo `left/right/bottom` que la pildora,
`border-radius: 28px`, alto segun el contenido (tope: la pantalla menos el
notch; en PC `min(80vh, 760px)`).

**Animacion (la barra se transforma):**
1. Al abrir, la pagina lleva `.nav-sheet-abierta`: la pildora esconde sus
   iconos (opacidad 0 en .12s) y deja de dibujar fondo, borde, sombra y blur,
   y no recibe toques.
2. El panel arranca recortado (`clip-path: inset(calc(100% - alto-de-barra) 0 0 0 round 999px)`)
   con la forma exacta de la pildora, en el mismo lugar, y se abre en .32s a
   `inset(-80px round 108px)` (los -80px dejan ver la sombra; la forma la da
   el `border-radius`). Termina con un rebote chico (`navLiquid`: `scaleY`
   .985 → 1, .5s, `cubic-bezier(.25,1.35,.45,1)`, desde abajo).
3. El contenido aparece con un fundido corto, .08s despues.
4. Al cerrar (fondo, Escape, una accion), el panel vuelve a la forma de la
   pildora (220ms) y **recien al terminar** se saca la clase: la pildora
   recupera fondo e iconos en el mismo lugar, sin salto.
5. `prefers-reduced-motion`: sin animacion.

**Fondo:** `.nav-sheet-backdrop` transparente; solo atrapa el toque afuera para
cerrar. No oscurece.

**Contenido** (todo con la estetica de pildora):

| Pieza | Clase / helper | Notas |
|---|---|---|
| Titulo del panel | `.nav-sheet-title` | texto + accion opcional a la derecha |
| Seccion | `.nav-sheet-section` | rotulo en versalitas, `--text-muted` |
| Fila | `navSheetRow({label, icon, detail, active, onClick})` | pildora de 44px (celu) / 40px (PC); `.danger` en rojo; `.row-state` para estado |
| Fila con accion al costado | `.nav-sheet-item` + `.nav-sheet-del` | el boton va afuera de la fila (boton dentro de boton es invalido) |
| Separador | `.nav-sheet-sep` | 1px |
| Campo | `.nav-sheet-field` | input en pildora, 16px (si no, iOS hace zoom), boton circular de acento |
| Segmentado | `.nav-sheet-seg` + `.vm-btn` | pildora con opciones; la activa con `--nav-active-bg` |
| Arbol | `.nav-tree` + `.tree-node/.tree-row/.tree-children` + `.tree-chev` | trazo curvo tipo Obsidian; desplegar/plegar animado (`treeOpen`/`treeClose`) |
| Nota | `.nav-sheet-note` | texto explicativo chico |
| Vacio | `.nav-sheet-empty` | |

En PC el panel puede ir en columnas (Info: `.info-cols`, dos columnas).

### 4.4 Barras que salen de atras (`.nav-search`)
Buscador y barra de nuevo bookmark. Salen de **detras** de la pildora
(`translateY` + opacidad, .32s), con las esquinas de arriba redondeadas (24px) y
la base recta metida 26px detras de la pildora (`--search-tuck`). Mismo
vidrio. La parte metida detras se **recorta en el medio** (`clip-path`
poligonal) y queda solo en los extremos, donde tapa el hueco de las esquinas
redondas de la barra: asi no hay doble capa a traves de la pildora. Suben con el
teclado (`--kb-offset`). Input de 16px.

## 5. Esconder la navegacion

| Donde | Gesto | Efecto |
|---|---|---|
| Lector, celu | doble tap fuera de los controles | la pildora baja y la topbar sube, con fundido (.32s); otro doble tap las trae |
| Lector, PC | doble clic en el **fondo** (fuera de las hojas) | lo mismo; sobre las hojas no hace nada (ahi es para seleccionar) |

`setReaderNavHidden(bool)` en reader.js. Al esconder se cierran panel y barras.

## 6. Inventario (v1.15.5)

| Pantalla | Plataforma | Disparador | Pieza | Contenido |
|---|---|---|---|---|
| Biblioteca | celu | Colecciones | panel | Todos, Sin conexion, Papelera, arbol de colecciones (flechita despliega sin cerrar), + Nueva |
| Biblioteca | celu | Subir | panel | contenido del modal de subida mudado al panel |
| Biblioteca | celu | Mas | panel | Notificaciones, Informacion, Ajustes, Cerrar sesion |
| Biblioteca | celu | Mas → Notificaciones | panel | lista del modal mudada al panel |
| Biblioteca | celu | tocar un libro en la Papelera | panel | Restaurar / Eliminar definitivamente |
| Biblioteca | celu | Buscar | barra (`#libSearchBar`) | el input real se muda desde la topbar |
| Biblioteca | celu | dentro de una subcarpeta | topbar | la ruta |
| Lector | celu + PC | ruedita | panel | titulo editable, Lectura (PC, PDF), acciones, arbol de coleccion + Mover |
| Lector | celu | Bookmark | panel | Nuevo / Ver |
| Lector | PC | Bookmark | panel | la lista, con Nuevo abajo |
| Lector | celu + PC | Ver bookmarks | panel | lista con borrar al costado |
| Lector | celu + PC | Info → Enviar | panel | usuarios; un toque envia |
| Lector | celu + PC | Info → Eliminar | panel | confirmar / cancelar |
| Lector | celu + PC | Buscar | barra (`#searchBarReader`) | input, contador, anterior/siguiente, cerrar |
| Lector | celu + PC | Nuevo bookmark | barra (`#bmBarReader`) | input + tilde |
| Lector (TXT/MD/EPUB) | celu | siempre | topbar | ajustes de letra |

## 7. Pendiente para v1.16 (PC = celu)

La biblioteca en PC todavia usa sidebar, topbar y **modales**. Para llevarla a
la pildora:

- Modales de la biblioteca que en PC siguen siendo ventanas: Nueva coleccion,
  Renombrar coleccion, Subir, Notificaciones, Libro recibido, Libro en la
  papelera. En el celu varios ya se mudan a paneles (Subir, Notificaciones,
  Papelera); el resto hay que construirlo como panel.
- El sidebar (arbol de colecciones, Biblioteca, Sin conexion, Papelera,
  About, Ajustes) pasa a la pildora + paneles, como en el celu.
- Medidas de PC ya resueltas en el lector (`reader.css`, bloque
  `min-width: 641px`): reusar las mismas variables para la biblioteca.
- Mantener las reglas de la seccion 1: un solo material, sin oscurecer, una
  sola capa.
