# Spec: el sistema de pildoras

Estado a v1.15.7. Es la base para v1.16, donde la interfaz de PC pasa a ser la
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
| `--nav-ease` | `cubic-bezier(.32,.72,0,1)` (resorte: arranca agil, se asienta despacio) | toda transicion de la navegacion |

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
| Biblioteca, celu (`#bottomNav`) | 4 items de igual ancho: Buscar, Biblioteca, Subir (en acento), Mas (desde v1.16.1 las colecciones se abren desde la topbar). Resaltado deslizante (`.bn-indicator`) detras del item activo. |
| Biblioteca, PC (`#bottomNav`, v1.16) | 6 items, 600px de ancho: Biblioteca, Sin conexion, Buscar, Subir, Notificaciones (con contador), Ajustes (ruedita). Mismo HTML que el celu: los dos de mas son `.bn-desk` y el orden lo da CSS (`order`); "Mas" muestra la ruedita (`.ico-pc`). El resaltado se ubica por la posicion real del boton (`offsetLeft`), no por el indice. |
| Lector, celu (`#readerNav`) | 4 items: Volver, Buscar, Bookmarks, Info (ruedita). Los grupos son `display: contents` y lo `.rn-desk` no se ve. |
| Lector, PC (`#readerNav`) | Grilla de 3 columnas: izquierda Volver + titulo; centro el paginador (o los ajustes de letra en TXT/MD/EPUB); derecha Buscar, Bookmarks, Lupa, Pantalla completa, Info. Items de 42px con hover. |

Items: icono de linea, trazo 1.8, 23px (celu) / 21px (PC). Sin texto.

### 4.2 Topbar flotante (`.top-nav`)
Gemela de la pildora, anclada arriba (`--top-nav-top`, 52px de alto). En el
lector, **solo en el celu y solo cuando hace falta** (atributo `hidden` si no);
la de la biblioteca esta siempre, en celu y PC (v1.16). Con
`body.con-topnav` el contenido arranca debajo.

| Donde | Contenido |
|---|---|
| Lector (`#readerTopNav`) | Ajustes de letra de TXT/MD/EPUB: fuente, A− tamaño A+, tres temas. El mismo nodo (`#textCtl`) que en la PC va en la pildora; se muda segun el ancho (`placeTextCtl`). |
| Biblioteca (`#libTopNav`) | **Reemplaza al logo**: siempre a la vista y solo dice **donde estas**. `/` es la raiz (biblioteca general); adentro, `/ Ciberseguridad / Malware`; las vistas especiales son un tramo (`/ Papelera`, `/ Sin conexion`, `/ Ajustes`, `/ Informacion`). Cada tramo lleva ahi; la actual, resaltada. **Tocar la carpeta actual la renombra en el lugar** (v1.16): el tramo es un `span` que se vuelve editable con la misma transicion que el titulo del libro (pildora con borde de acento); Enter o salir guarda, Escape vuelve atras, y la topbar se estira mientras se escribe. No en la raiz, Sin coleccion ni Temporal. **Tocar la barra en cualquier otro lugar (la `/` incluida) abre las colecciones**, que bajan desde ella (4.3, v1.16.1). **Mide lo que muestra**: centrada, en la raiz es una pildorita de la altura de la barra con la `/`, y al cambiar de lugar su ancho se anima (.5s) hasta abarcar la ruta. Si no entra, llega al maximo y desliza, con los bordes esfumados (`.desborda`). |

### 4.3 Panel (`.nav-sheet`, `openNavSheet(build, onClose)` en nav.js)
La pildora estirandose hacia arriba. Mismo `left/right/bottom` que la pildora,
`border-radius: 28px`, alto segun el contenido (tope: la pantalla menos el
notch; en PC `min(80vh, 760px)`).

**Animacion (la barra se transforma):**
1. Al abrir, la pagina lleva `.nav-sheet-abierta`: la pildora esconde sus
   iconos (opacidad 0 en .12s) y deja de dibujar fondo, borde, sombra y blur,
   y no recibe toques.
2. El panel arranca recortado (`clip-path: inset(calc(100% - alto-de-barra) 0 0 0 round 999px)`)
   con la forma exacta de la pildora, en el mismo lugar, y se abre en .52s a
   `inset(-80px round 108px)` (los -80px dejan ver la sombra; la forma la da
   el `border-radius`). Termina con un rebote leve (`navLiquid`: `scaleY`
   .99 → 1, .7s, `cubic-bezier(.3,1.18,.4,1)`, desde abajo).
3. El contenido aparece con un fundido de .32s, .16s despues.
4. Al cerrar (fondo, Escape, una accion), el panel vuelve a la forma de la
   pildora (.34s, `NAV_SHEET_CLOSE_MS`) y **recien al terminar** se saca la
   clase: la pildora recupera fondo e iconos (.3s) en el mismo lugar.
5. **Sin lugar reservado abajo**: como la barra se transforma (sus iconos se
   van), el panel termina con su padding normal, sin la franja del alto de la
   barra.
6. `prefers-reduced-motion`: sin animacion.

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
| Selector de coleccion | `colPicker({collections, selected, marked, onChange})` | el arbol como selector: arranca en el camino de la elegida, tocar elige y despliega; lo usan Info (lector) y Subir |
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

### 4.5 Pantalla de inicio (`#splash`, biblioteca)
Al abrir la app **desde cero** (una vez por sesion: `sessionStorage`), el logo
y el nombre en el centro, con una entrada suave y un respiro. Se va (fundido y
`scale(1.04)`, .5s) cuando la biblioteca ya esta armada: libros dibujados y las
primeras 9 tapas cargadas (tope 1,6s), con un minimo de .7s desde que abrio.
Navegar adentro (volver del lector) no la repite.

### 4.6 Orden de las colecciones
Alfabetico en cada nivel, salvo **Temporal: siempre la ultima**, fija
(`colTree` en nav.js). Vale para la hoja, el sidebar y los selectores.

### 4.7 Duraciones

| Animacion | Duracion |
|---|---|
| Panel: abrir / cerrar | .52s / .34s (+ rebote .7s) |
| Contenido del panel | .32s, .16s de demora |
| Iconos de la barra: irse / volver | .18s / .3s |
| Desplegar / plegar subcarpetas (`TREE_MS`) | .38s |
| Buscador y barra de bookmark | .44s |
| Esconder / mostrar las pildoras | .44s (opacidad .32s) |
| Resaltado deslizante de la barra | .38s |
| Topbar de la biblioteca (ancho) | .5s |

### 4.8 Etiqueta de las hileras (`#rowTag`, biblioteca, v1.16)
En el inicio las hileras van seguidas y **sin titulos**. Una sola etiqueta de
vidrio, vertical, fija a la izquierda (32px de ancho), flota sobre los
primeros libros con la palabra de costado (mayusculas espaciadas, se lee de
abajo hacia arriba) y un **piquito** a la derecha, pegado al costado (no
encima: una sola capa), que apunta a la hilera que tiene a su altura.

- Al scrollear cambia la palabra (sale hacia abajo, entra desde arriba, .2s) y
  el alto se anima (.45s) segun el largo (medido con la misma letra acostada).
- **Se arrastra** arriba y abajo (mouse o dedo, pointer events). Nunca pisa
  las barras: queda a 12px de la topbar y de la pildora. Lo que se guarda
  (`localStorage`, `bs_row_tag`) es la altura del piquito como proporcion de
  ese espacio, asi sirve aunque cambie el alto de la ventana.
- El piquito marca la altura elegida y **no se mueve cuando cambia el largo**
  (la caja se acomoda alrededor, sin pasar las barras): si no, la palabra
  podria ir y venir entre dos hileras por su propio cambio de tamano.
- **Tocarla sin arrastrar** (menos de 4px) entra a la coleccion de la hilera
  marcada (v1.16.1); en "Ultimos leidos" no hace nada.
- Solo en el inicio (hileras); en una coleccion, Sin conexion, Papelera o las
  vistas de Ajustes se esconde con un fundido.

### 4.9 Panel desde la topbar (`openNavSheet(build, onClose, { desde })`, v1.16.1)
El espejo del 4.3: anclado arriba (`.nav-sheet-top`), del ancho de la pildora
de abajo y sin pasarla (alto maximo: hasta `--nav-space`). Una sola animacion
en dos tiempos (`_topSheetAnimar`, Web Animations sobre el `clip-path`): la
topbar, que mide lo que muestra, **primero se ensancha** hasta el ancho de la
pildora (34% de .68s) y **despues baja** hasta ser el panel. Cerrar: sube y se
angosta (.34s) hasta el ancho de destino de la topbar. Mientras esta abierto,
la pagina lleva `.top-sheet-abierta`: la topbar no dibuja su vidrio, esconde
la ruta y cambia de ancho sin animar, asi que si se eligio una carpeta, al
cerrar ya esta en su medida nueva. Por eso las filas **navegan antes de
cerrar** el panel. La pildora de abajo no se toca. El contenido aparece a los
.26s, cuando ya se ensancho: el titulo ("Colecciones") queda donde estaba la
ruta.

## 5. Esconder la navegacion

| Donde | Gesto | Efecto |
|---|---|---|
| Lector, celu | doble tap fuera de los controles | la pildora baja y la topbar sube, con fundido (.32s); otro doble tap las trae |
| Lector, PC | doble clic en el **fondo** (fuera de las hojas) | lo mismo; sobre las hojas no hace nada (ahi es para seleccionar) |

`setReaderNavHidden(bool)` en reader.js. Al esconder se cierran panel y barras.

## 6. Inventario (v1.16)

| Pantalla | Plataforma | Disparador | Pieza | Contenido |
|---|---|---|---|---|
| Biblioteca | celu + PC | tocar la topbar | panel desde arriba (4.9) | Todos, Sin conexion y Papelera (solo celu: en la PC tienen su lugar), arbol de colecciones (flechita despliega sin cerrar), + Nueva |
| Biblioteca | celu + PC | Subir | panel | zona de arrastrar (vidrio), arbol de coleccion (`colPicker`), boton pildora |
| Biblioteca | celu | Mas (tres rayitas) | panel, sin titulo | Notificaciones, Informacion, Ajustes, Cerrar sesion |
| Biblioteca | celu | Mas → Notificaciones | panel | lista del modal mudada al panel |
| Biblioteca | celu + PC | tocar un libro en la Papelera | panel | Restaurar / Eliminar definitivamente |
| Biblioteca | celu + PC | Buscar | barra (`#libSearchBar`) | el input real se muda desde la topbar |
| Biblioteca | celu + PC | siempre | topbar | donde estas (`/`, la ruta o la vista especial); tocar la actual la renombra |
| Biblioteca | celu + PC | Colecciones → + Nueva | panel | nombre + "Dentro de" en arbol (`colPicker`, con "Primer nivel" arriba) |
| Biblioteca | celu + PC | Notificaciones → un libro recibido | panel | tapa, titulo, quien lo mando, arbol de coleccion o "Nueva coleccion" (se vuelve campo), Aceptar |
| Biblioteca | PC | Ajustes (ruedita) | panel | Papelera, Releer biblioteca (la fila gira), Cambiar contrasena (se despliega en el lugar), Cerrar sesion, tarjeta de creditos |
| Biblioteca | PC | Sin conexion / Notificaciones | item de la pildora / panel | lo que en el celu esta en las hojas |
| Biblioteca | celu + PC | inicio | etiqueta (`#rowTag`) | nombre de la hilera a su altura |
| Lector | celu + PC | ruedita | panel | titulo editable, Lectura (PC, PDF), acciones, arbol de coleccion + Mover |
| Lector | celu | Bookmark | panel | Nuevo / Ver |
| Lector | PC | Bookmark | panel | la lista, con Nuevo abajo |
| Lector | celu + PC | Ver bookmarks | panel | lista con borrar al costado |
| Lector | celu + PC | Info → Enviar | panel | usuarios; un toque envia |
| Lector | celu + PC | Info → Eliminar | panel | confirmar / cancelar |
| Lector | celu + PC | Buscar | barra (`#searchBarReader`) | input, contador, anterior/siguiente, cerrar |
| Lector | celu + PC | Nuevo bookmark | barra (`#bmBarReader`) | input + tilde |
| Lector (TXT/MD/EPUB) | celu | siempre | topbar | ajustes de letra |

## 7. PC = celu (v1.16)

La biblioteca en la PC ya no tiene sidebar, topbar vieja ni modales: arriba la
topbar de la ruta y abajo la pildora (4.1), con las medidas de PC del lector
(600px, 58px de alto). Los modales que quedan en el HTML (Subir, Notificaciones)
son solo deposito: su contenido se muda al panel. Libros un 20% mas grandes
(197px en PC, 132px en el celu). La rueda del mouse sobre una hilera ya no la
corre de costado (casi toda la pantalla es hilera): de costado, Shift + rueda o
el touchpad.

Escape cierra el panel abierto, o si no el buscador.
