# Changelog

> **Resumen de v1.13 a v1.16.6.** Colecciones como carpetas reales (con subcarpetas, *Temporal*, *Papelera* y *Releer biblioteca*); el progreso sigue entre dispositivos y gana lo más avanzado; lector de TXT/Markdown/EPUB; el lector en una sola píldora (PC y celu) con búsqueda que marca la palabra, lupa de renglones y bookmarks; un solo vidrio para toda la navegación (`docs/pildoras.md`); y la biblioteca de la PC pasada al sistema del celu: ruta arriba, píldora abajo, paneles en vez de ventanas, colecciones que bajan desde la topbar, hileras sin títulos con una etiqueta arrastrable, *Últimos leídos* llenando la primera pantalla del celu y el teclado que sube solo la barra. El detalle, versión por versión, abajo.

## v1.17 — Las carpetas, en el orden que quieras

### Agregado
- **Ordenar las colecciones.** En el panel de colecciones, cada carpeta tiene una **flechita** al lado del lápiz que la sube un lugar entre sus hermanas (las dos filas se cruzan animadas). Funciona en cada nivel, también en las subcarpetas. *Temporal* queda fija al final y *Últimos leídos* siempre arriba de todo. Las hileras del inicio, el árbol para mover un libro y el de subir siguen ese orden.
- El orden se guarda en el servidor (columna nueva `collections.sort_order`, se agrega sola al arrancar), así que es el mismo en la PC y en el celu. Las carpetas que nunca se ordenaron (una recién creada, por ejemplo) van después de las ordenadas, alfabéticas. Sin conexión no se guarda y la lista vuelve a como estaba.

## v1.16.7 — Instalar con un comando, y menos a la vista

### Agregado
- **`setup.sh`: clonar y levantar con un solo comando.** Chequea Docker y Compose (plugin o `docker-compose`), crea `data/` y `uploads/` con tu usuario (si las crea Docker son de root y la app no puede escribir), construye, levanta, espera a que responda y muestra la dirección. La primera vez **genera la contraseña del admin al azar** en lugar de dejar `admin123`. `--port` cambia el puerto, `--update` hace `git pull` y reconstruye; correrlo de nuevo no toca los datos ni la contraseña. Guarda puerto, usuario y nombre del contenedor en `.env` (ignorado por git), que `docker compose` lee solo.
- `docker-compose.yml` toma de `.env` el puerto (`BOOKSHELF_PORT`), el usuario (`BOOKSHELF_UID`/`GID`), el nombre del contenedor (`BOOKSHELF_CONTAINER`) y la interfaz (`BOOKSHELF_BIND=127.0.0.1` para no abrir el puerto a la red local). Sin `.env`, lo de siempre: usuario 1000, puerto 8090.
- Tutorial de instalación en el README.

### Seguridad
- `/api/about` ya no devuelve rutas del servidor (carpeta de subidas, base de datos, portadas) ni el sistema operativo: solo lo que muestra la tarjeta de creditos.
- La cookie de sesion va con `SameSite=Lax` (ademas de `HttpOnly`): otra pagina no puede mandar pedidos con tu sesion.
- `.env` y `docs/` excluidos de la imagen de Docker.
- `manage.sh` funciona tambien sin terminal (desde un script o cron) y lee el nombre del contenedor de `.env`.

## v1.16.6 — El arbol sin scroll propio

### Cambiado
- **El arbol para elegir coleccion (Subir, Nueva coleccion, libro recibido, mover un libro desde el lector) ya no tiene su propio scroll con barrita**: se ve entero y, si no entra, scrollea el panel completo, sin barra, como el resto de los paneles.
- **PC: los paneles de la biblioteca crecen hasta debajo de la topbar** (antes tope en 78% de la pantalla).
- `VERSION` del service worker: `v41` → `v42`.

## v1.16.5 — Ultimos leidos llena la primera pantalla (celu)

### Cambiado
- **Celu: "Ultimos leidos" ocupa la primera pantalla**: en lugar de una hilera, una grilla con tantas filas como entren (en un 12 mini, tres filas de dos), y las hileras de las colecciones empiezan debajo. La cuenta usa el alto real de la pantalla; una fila cortada abajo cuenta si se ve mas de la mitad. En la PC sigue siendo una hilera. Se piden hasta 24 recientes al servidor (antes 10; la PC muestra 10).
- **Las hileras del inicio siguen el orden de las colecciones**: alfabetico y **Temporal siempre ultima** (antes el servidor las ordenaba por nombre y Temporal caia en el medio).
- `VERSION` del service worker: `v40` → `v41`.

## v1.16.4 — La rueda, por mitades

### Cambiado
- **PC: la rueda del mouse sobre una hilera la corre de costado si el puntero esta en la mitad derecha de la pantalla**; en la mitad izquierda (donde esta la etiqueta) baja la pagina. Si la hilera ya llego al final para ese lado, la rueda baja la pagina igual. Shift + rueda y el touchpad siguen corriendo de costado en cualquier lado.
- `VERSION` del service worker: `v39` → `v40`.

## v1.16.3 — Libros arriba, lapiz en las colecciones y Ajustes en el panel

### Cambiado
- **Sin lugar vacio arriba**: en el inicio (celu y PC) los libros arrancan arriba de todo y la topbar flota encima. Adentro de una carpeta el celu sigue dejando el lugar (la ruta ocupa mas); en la PC nunca.
- **Los libros del inicio miden lo mismo que adentro de una carpeta** (celu y PC): las tarjetas de las hileras toman el ancho de una columna de la grilla, con la misma cuenta que hace la grilla (`medirTarjetas`).
- **Renombrar pasa a un lapiz al lado de cada carpeta** en el panel de colecciones (no en Sin coleccion ni en Temporal): la carpeta se vuelve campo en el lugar y el lapiz se transforma en el tilde. La topbar queda solo para ver donde estas y navegar (tocar la carpeta actual tambien abre las colecciones).
- **Celu: "Mas" queda con Notificaciones y Ajustes**, y las dos se abren en el mismo panel, que se estira hasta su contenido (`swapNavSheet`), sin ir a otra pantalla. Ajustes es el mismo de la PC: Papelera, Releer biblioteca, Cambiar contrasena, Cerrar sesion y la tarjeta de creditos (lo que era Informacion).
- **Se borraron las pantallas viejas de Ajustes e Informacion** (y sus entradas del sidebar, su CSS y `loadAbout`/`setView`/`vistaActual`): todo eso vive en el panel de Ajustes. El formulario de la contrasena queda escondido en `#depositoAjustes` y se muda al panel al desplegarlo.
- `VERSION` del service worker: `v38` → `v39`.

## v1.16.2 — El teclado sube la barra, no la pagina

### Arreglado
- **Al escribir en una barra o un panel (buscar, bookmark, nueva coleccion, contrasena...), el fondo ya no se corre.** iOS scrolleaba la pagina para mostrar el campo; ahora la pildora, el buscador y el panel suben solos justo encima del teclado (animados) y la pagina vuelve a donde estaba mientras el teclado entra. Vale en la biblioteca y en el lector (el manejo del teclado paso a nav.js, `initKeyboard`).

### Cambiado
- Pildora de la biblioteca en el celu: **Biblioteca primero y Buscar segundo** (estaban al reves). En la PC el orden no cambia.
- `VERSION` del service worker: `v37` → `v38`.

## v1.16.1 — Las colecciones bajan desde la topbar

### Cambiado
- **Colecciones sale de la pildora** (celu y PC): la de abajo queda con 4 botones en el celu (Buscar, Biblioteca, Subir, Mas) y 6 en la PC, del mismo tamano.
- **Tocar la topbar abre las colecciones**: la barra de arriba (la `/` o cualquier lugar que no sea un tramo) se ensancha hasta el ancho de la pildora de abajo y, en la misma animacion, baja hasta ser el panel. Al cerrar hace el camino inverso y vuelve a la medida de la ruta nueva si se eligio una carpeta. Los tramos de arriba siguen llevando ahi y tocar la carpeta actual la sigue renombrando.
- **Tocar la etiqueta de las hileras** (sin arrastrarla) entra a la coleccion que esta marcando. "Ultimos leidos" no es una carpeta: ahi no hace nada.
- `VERSION` del service worker: `v36` → `v37`. Spec: `docs/pildoras.md` (4.1, 4.2, 4.3, 4.8, 6).

## v1.16 — La PC, como el celu

### Cambiado
- **La biblioteca en la PC usa el sistema de pildoras**: sin sidebar, sin la topbar vieja y sin logo. Arriba, la misma topbar del celu que dice donde estas (`/`, `/ Ciberseguridad / Malware`); abajo, una pildora con Biblioteca, Sin conexion, Colecciones, Buscar, Subir, Notificaciones (con contador) y **Ajustes**. Todo lo que eran ventanas ahora crece desde la pildora.
- **Ajustes (PC)**: Papelera, Releer biblioteca (se queda en el panel y el icono gira), Cambiar contrasena (se despliega en el lugar), Cerrar sesion y una tarjeta de creditos con solo lo necesario (version, Python, Flask, PyMuPDF). La tarjeta reemplaza tambien a la lista de rutas y versiones de Informacion en el celu.
- **Hileras sin titulos** (celu y PC): van seguidas y el nombre lo dice **una etiqueta vertical de vidrio** a la izquierda, con un piquito que apunta a la hilera a su altura. Al bajar cambia la palabra y su alto se anima segun el largo. **Se arrastra** arriba y abajo (mouse o dedo), sin pasar nunca la topbar ni la pildora, y se acuerda donde la dejaste.
- **Libros un 20% mas grandes** (PC 164 → 197px, celu 110 → 132px).
- **Renombrar una coleccion**: tocando la carpeta actual en la topbar, que se vuelve editable en el lugar (misma animacion que el titulo del libro). Celu y PC.
- **Nueva coleccion**, **libro recibido** y **libro en la papelera** son paneles en las dos plataformas; la coleccion se elige con el arbol (en "Nueva coleccion", "Primer nivel" va arriba de todo; en "libro recibido", "Nueva coleccion" se transforma en el campo).
- En la PC la hoja de Colecciones ya no repite Sin conexion ni Papelera (tienen su lugar en la pildora y en Ajustes).
- La rueda del mouse sobre una hilera ya no la corre de costado: con todo hecho hileras no habia forma de bajar. De costado: Shift + rueda o el touchpad.
- Escape cierra el panel abierto o el buscador.
- `/api/about` devuelve la `version`. `VERSION` del service worker: `v35` → `v36`. Spec: `docs/pildoras.md` (4.1, 4.2, 4.8, 6, 7).

## v1.15.7 — Subir, con la estetica de las pildoras

### Cambiado
- **Subir libros en el celu**: la zona de arrastrar archivos es redondeada y de vidrio, el boton Subir es una pildora, y **la coleccion se elige con el arbol** (el mismo de la hoja de colecciones y del panel de info del lector) en lugar del selector nativo. Arranca en la coleccion donde se esta parado (o la raiz); tocar una la elige y despliega sus subcarpetas.
- El arbol selector es ahora una pieza compartida (`colPicker`, nav.js): la usan el panel de info del lector (mover el libro) y el de subir.
- `VERSION` del service worker: `v34` → `v35`.

## v1.15.6 — Pantalla de inicio y la topbar que dice donde estas

### Agregado
- **Pantalla de inicio**: al abrir la app desde cero (celu o PC), el logo y el nombre en el centro mientras carga; se va cuando la biblioteca ya esta armada (libros dibujados y las primeras tapas, con tope) y aparecen los libros listos. Una vez por sesion: volver del lector no la repite.

### Cambiado
- **Sin logo ni nombre arriba en el celu: la topbar flotante esta siempre y dice donde estas.** `/` es la raiz (la biblioteca general); en una coleccion, `/ Ciberseguridad / Malware`; las vistas especiales son un tramo (`/ Papelera`, `/ Sin conexion`, `/ Ajustes`, `/ Informacion`). Cada tramo lleva ahi. El titulo grande que se repetia arriba de la grilla se fue (queda la nota de Temporal y la de la Papelera).
- **La topbar mide lo que muestra**: centrada, en la raiz es una pildorita con la `/` y al entrar a una carpeta se estira animada hasta abarcar la ruta (y se achica al volver). Si no entra, llega al ancho maximo y desliza.
- **Animaciones mas fluidas y suaves**: curva tipo resorte en toda la navegacion (`cubic-bezier(.32,.72,0,1)`); la barra transformandose en el panel tarda .52s (antes .32s) con un rebote mas leve, el contenido aparece mas despacio, el cierre se alarga a .34s; desplegar carpetas, los buscadores y esconder las pildoras tambien suben de duracion.
- **Los paneles ya no dejan un espacio vacio abajo** (era el lugar de los iconos de la barra, que ahora se transforma en el panel).
- **Temporal siempre ultima**, fija, en todas las listas de colecciones (hoja del celu, sidebar de la PC, selectores).
- El panel de las tres rayitas ya no lleva el titulo "Mas".

### Notas
- `VERSION` del service worker: `v33` → `v34`. Spec actualizado (`docs/pildoras.md`: 4.2, 4.3, 4.5-4.7).

## v1.15.5 — Un solo vidrio, que se estira

Relevamiento de todos los lugares que usan la pildora (celu y PC): 10 paneles, 3 barras que salen de atras, 2 pildoras y 2 topbars flotantes. El sistema quedo documentado en `docs/pildoras.md`, base para v1.16.

### Cambiado
- **Todo lo que se despliega tiene la misma transparencia que la barra.** Los paneles eran casi opacos (96%) y el buscador y la barra de bookmark, opacos y mas oscuros; ahora todo usa el mismo vidrio (78% con desenfoque). El material vive en tokens (`--glass-*` en nav.css) que usan la pildora, la topbar flotante, los paneles y las barras. Adentro, los campos, segmentados y formularios mudados al panel (subir, notificaciones) usan rellenos translucidos.
- **La barra se transforma en el panel, al estilo Liquid Glass:** al abrir, sus iconos se desvanecen y deja de dibujar su fondo; el panel arranca con la forma exacta de la barra, se estira hacia arriba y se asienta con un rebote chico. Al cerrar, vuelve a la forma de la barra y recien ahi reaparecen los iconos. Una sola capa de vidrio en todo momento. Respeta "reducir movimiento".
- **El buscador y la barra de bookmark** salen de atras de la pildora con el mismo vidrio; la parte metida detras se recorta en el medio para que no se vea la doble capa a traves de la barra.
- Con el telefono de costado, los paneles y las barras tambien respetan el notch (antes solo las pildoras).

### Notas
- `VERSION` del service worker: `v32` → `v33`.
- Verificado en Chromium, celu (390x844) y PC (1440x900), abriendo uno por uno: Colecciones, Subir, Mas, Notificaciones, libro en la Papelera, buscador de la biblioteca; Info, Bookmarks, Ver bookmarks, Enviar, Eliminar, buscador y barra de bookmark del lector. En todos: el mismo vidrio que la barra, la barra sin fondo ni iconos mientras el panel esta abierto, y todo de vuelta al cerrar. La apertura arranca con la forma de la barra (`inset(calc(100% - 60px) … round 999px)`) y termina en `inset(-80px round 108px)`.

## v1.15.2 — Arriba, solo donde estas

### Cambiado
- **La topbar de carpetas (celu) muestra solo donde estas**, no adonde podes ir: la ruta `Ciberseguridad / Malware`, con la actual resaltada; tocar un tramo anterior sube hasta ahi. Las subcarpetas ya no aparecen ahi (para entrar a una esta la hoja de colecciones). Aparece solo dentro de una subcarpeta: en el primer nivel la ruta seria una sola palabra, igual al titulo de abajo.
- `VERSION` del service worker: `v31` → `v32`.

## v1.15.1 — El libro a pantalla completa

### Cambiado
- **El libro ocupa toda la pantalla y la pildora flota encima** (PC). En Doble pagina habia un margen abajo del alto de la pildora que se veia como una franja negra; ya no esta. En Scroll y en los textos queda un espacio solo al final, para poder bajar la ultima hoja por encima de la pildora.
- **Doble clic en el fondo (fuera de las hojas) esconde la pildora y otro doble clic la trae**, en cualquier vista, como el doble tap del celu. Sobre las hojas no hace nada (ahi es para seleccionar palabras). El boton de pantalla completa vuelve a ser solo la pantalla completa del navegador; la pildora ya no se esconde sola con el mouse quieto.
- **Lupa con forma de pildora** (la lupa y la franja) y **solo del ancho del texto**: toma la columna donde hay texto en esa pagina (con un poco de margen), no el papel en blanco de los costados, imantada en horizontal; sin texto (un escaneo), un recorte fijo. Deja aire a los costados para que los extremos redondos no corten letras.
- **Editar el titulo es una transicion**: tocando el titulo o el lapiz, el mismo texto se vuelve editable en el lugar, aparece la pildora del campo alrededor (fondo y borde de acento) y el lapiz se transforma en el tilde. Enter o salir guarda; Escape vuelve atras.
- **Ningun panel oscurece el fondo**, en la PC ni en el celu (lector y biblioteca): son flotantes, como la pildora. La sombra los despega de lo de atras; antes no se veia porque el recorte de la animacion la cortaba.
- **Topbar de carpetas (celu): la ruta escrita como en el disco**, `Ciberseguridad / Redes /`, con aire alrededor de las barras; cada tramo lleva a esa carpeta (eso es subir), la actual resaltada, y despues de la ultima barra las subcarpetas para entrar. Reemplaza al boton "‹ subir" y a la ruta que habia arriba del titulo.

### Notas
- `VERSION` del service worker: `v30` → `v31`.

## v1.15 — El lector en una pildora (PC y celu)

### Cambiado
- **Lector en la PC: una sola pildora abajo, centrada, con todo** (la misma pieza que en el celu, con medidas de escritorio: 58 px de alto, tope de 1080 px de ancho, botones de 42 px con hover). Volver y titulo a la izquierda; en el medio la pagina (el numero se edita en el lugar: Enter va a esa pagina, ya no hay boton "Ir") con anterior/siguiente y el zoom en Scroll; a la derecha buscar, bookmarks, lupa, pantalla completa e info. No queda nada arriba: toda la pantalla es para el libro. Antes habia una topbar de lado a lado con 9 iconos y cinco barras de controles distintas, una por modo.
- **Info y ajustes crece desde la pildora** (como en el celu), en dos columnas en la PC: titulo con un lapicito para editarlo; modo de lectura (Scroll o Doble pagina); Guardar sin conexion, Enviar a otro usuario, Descargar, Compartir y Eliminar como filas; y la coleccion con **un arbol propio** (no el selector nativo): arranca desplegado solo el camino hasta donde esta el libro, tocar una coleccion la elige y despliega sus subcarpetas, y el boton la mueve. Lo mismo en el celu, en una columna.
- **Enviar a otro usuario y Eliminar** tambien son paneles que crecen de la pildora (antes, ventanas con un selector nativo).
- **Bookmarks:** un solo boton. En la PC abre la lista (con *Nuevo bookmark* abajo, que abre la barra para escribir); en el celu, el menu de siempre.
- **Buscar** sale de atras de la pildora, igual en PC y celu.
- **Solo dos modos de lectura: Scroll y Doble pagina.** Los libros guardados en Pagina o Libro abren en Scroll.
- **Pantalla completa (PC):** con el mouse quieto 2,5 s se va la pildora; vuelve al moverlo (no se va si el mouse esta encima o hay algo abierto).
- **Lupa (PC, Scroll y Doble):** toma una franja del ancho de la pagina bajo el mouse, de unos 3 renglones, y la muestra ampliada (2x, o menos si la pagina es muy ancha) desde la pagina dibujada en alta resolucion. Mas o menos renglones con la ruedita (en Scroll, Shift + ruedita, que la ruedita sola scrollea) o con + y -. Antes era un cuadradito de 280x200 sobre el canvas estirado, y solo en Doble.
- **Letra, tamaño y tema** de TXT, Markdown y EPUB son los mismos controles: en la PC van en la pildora (en lugar de la pagina); en el celu, en una **topbar flotante** gemela de la pildora, anclada debajo del notch, que se esconde junto con la de abajo con el doble tap.
- **Biblioteca en el celu:** dentro de una coleccion, la misma topbar flotante lleva "‹ <carpeta de arriba>" y las subcarpetas, deslizables. Siempre visible mientras se esta ahi; solo aparece si hay algo para mostrar.
- Icono de Info: una ruedita (PC y celu). Mismos iconos en las dos.
- Las pildoras respetan los margenes laterales del notch con el telefono de costado.

### Quitado
- Subrayar (no se podia usar), *Compartir por WhatsApp* (queda Compartir), los modos Pagina y Libro.

### Corregido
- **El lector de EPUB nunca abria ningun libro.** La URL del archivo no termina en `.epub` y epub.js la tomaba por un libro descomprimido: pedia `/file/META-INF/container.xml` y quedaba en blanco. Ahora abre, con el porcentaje en la pildora.
- **Buscar en un PDF no marcaba la palabra**, solo saltaba a la pagina. Ahora la marca (todas las de la pagina, la actual mas fuerte), en Scroll y en Doble, con la posicion medida con la tipografia del PDF. Enter con la misma busqueda va a la siguiente.
- **En Doble, al abrir en una pagina impar la hoja de la izquierda quedaba en blanco** (solo se dibujaban la actual y la siguiente).
- Cambiar de modo guarda antes la posicion: el modo nuevo abre donde se estaba.

### Notas
- `VERSION` del service worker: `v28` → `v30`.
- Verificado en Chromium (1440x900 y 390x844): paginador, zoom, busqueda marcada (Scroll y Doble), bookmarks, info (titulo, modo, mover de coleccion por el arbol, enviar, eliminar, sin conexion), lupa (Doble: 524 px de pagina -> lupa de 1048x144; Scroll: 900 px -> 1408x113 a 1,56x; Shift + ruedita no scrollea), pantalla completa con el mouse quieto, TXT/MD/EPUB en las dos pantallas, doble tap, topbar de subcarpetas, leer sin conexion (MD y PDF) y el progreso entre dispositivos (sigue ganando lo mas avanzado).

## v1.14.2 — Gana lo más avanzado

### Cambiado
- **Entre dispositivos gana la posición más avanzada**, no la más reciente (pedido del usuario). Con "la más reciente", un vistazo corto en otro dispositivo tiraba para atrás lo leído: en producción, un libro leído hasta la página 18 en agosto abría en la 2 porque en septiembre se había abierto un momento en otros tres dispositivos. A igual posición gana la más reciente. Misma regla en el servidor (`best_progress`) y en el cliente (`progress.js`), así que también vale para la copia local y para las tarjetas.

### Corregido
- **La posición dentro de la página no cruzaba bien entre pantallas.** El modo scroll del PDF guardaba el desplazamiento dentro de la página en píxeles, que dependen del ancho: una página mide ~550 px en el celu y ~1200 en la PC. Ahora guarda también la fracción de la página (`frac`, puede ser negativa: la página "actual" es la que más se ve, y el borde de la pantalla puede estar todavía en la anterior) y la usa al reabrir. Los guardados viejos, sin `frac`, siguen usando los píxeles.

### Notas
- `VERSION` del service worker: `v28` → `v29`.
- Verificado: página 18 vieja contra aperturas en la 2 y la 3 más nuevas y una "página 1" de hoy → abre en la 18 (y la tarjeta dice 18). Leído hasta la mitad de la página 25 en el celu (390 px) → la PC (1440 px) abre en la página 25 al 51 % de la hoja.

## v1.14.1 — El progreso te sigue entre dispositivos

### Corregido
- **Un dispositivo nuevo no mostraba lo leído en otro.** El progreso se guardaba y se leía por dispositivo (cada navegador tiene su id, y cambia si se borran los datos del sitio): en producción había 8 ids distintos, y la PC solo veía el suyo. Además, abrir un libro guarda la página en la que arranca, así que un dispositivo nuevo quedaba en "página 1" aunque el libro fuera por la 22 en el celu.

### Cambiado
- **Al abrir un libro con internet se va a donde se leyó por última vez, en cualquier dispositivo** (como Kindle). El servidor elige el mejor progreso entre todos (`GET .../progress?latest=1`) y se compara con la copia local con la misma regla: lectura real antes que "abierto sin avanzar" (página 1, 0%), y después la más reciente. Sin conexión manda la copia local, como antes. Con copia local se espera al servidor como mucho 1,5 s para no demorar la apertura.
- Las tarjetas de la biblioteca muestran ese mismo progreso: `/api/books` y `/api/books/recent` lo traen en `progress`, sin un pedido por tarjeta.
- Cada dispositivo sigue guardando su propia fila: no hay migración, lo leído antes aparece solo.
- **Desplegar y plegar subcarpetas está animado**, en el sidebar de la PC y en la hoja de colecciones del celu: el bloque se estira o se encoge con la curva de la píldora y se funde, y la hoja crece junto con él. Respeta "reducir movimiento" del sistema.

### Notas
- `VERSION` del service worker: `v27` → `v28`.
- Verificado con el caso real: celu en la página 22 de hace 3 días y PC con "página 1" de hace una hora → la PC abre en la 22 y la tarjeta dice 22. Si la PC leyó de verdad hasta la 5 hace un minuto, gana la 5. Sin conexión abre con la copia local.
- Animación medida cuadro a cuadro: en la PC el bloque pasa por 0 → 47 → 78 px al abrir y por 79 → 24 → 0 al plegar, sin restos en el DOM; en el celu la hoja crece de 565 a 697 px en ~25 cuadros.

## v1.14 — Colecciones como carpetas, Temporal y Papelera

Cambio de motor: las colecciones dejan de ser filas de la base y pasan a ser **carpetas** dentro de `uploads/<usuario>/`, como una bóveda de Obsidian. La base queda como índice (ids, progreso, portadas, metadatos).

### Agregado
- **Colecciones dentro de colecciones.** Al abrir una se ven sus libros y los de todas sus subcarpetas en una sola grilla; al entrar a una subcarpeta se filtra a lo suyo. *Nueva coleccion* tiene un campo *Dentro de*, que arranca en la colección abierta.
- **Sidebar en árbol (PC).** Solo el primer nivel; al abrir una colección aparecen sus hijas unidas con un trazo curvo, como Obsidian, y las nietas recién al abrir la hija. Tocar la colección abierta pliega o despliega sus subcarpetas. La topbar muestra la ruta (`Ciberseguridad › Redes`).
- **Celu:** la hoja de colecciones es el mismo árbol, con una flechita al costado que despliega sin cerrar la hoja. Arriba de la grilla aparecen el nombre de la colección (antes no se veía en ningún lado: no hay topbar), la ruta para volver hacia arriba y las subcarpetas como pastillas.
- **Releer biblioteca** (Ajustes, y solo al arrancar): incorpora lo que se deje a mano por SSH. Un archivo movido o renombrado a mano **conserva su id**, y con él progreso, bookmarks y copia offline, porque se reconoce por el hash del contenido. Si haría desaparecer más de la mitad de la biblioteca, aborta sin tocar nada. Ignora lo oculto, los temporales (`~$`, `.part`, `.crdownload`) y los symlinks (uno a `/etc` no puede terminar servido). Los nombres se normalizan a NFC también en disco (un Mac escribe NFD). Portada y páginas de lo dejado a mano se generan la primera vez que se piden.
- **Temporal**: lo que entra se va a la papelera a los 30 días, contados desde que entró. Moverlo dentro de Temporal no reinicia el reloj; sacarlo, lo apaga. Las tarjetas muestran los días que quedan. La colección "Temporales" de antes pasa a ser esta.
- **Papelera**: eliminar un libro (desde el lector, como siempre) lo manda ahí; se borra solo a los 30 días. Se puede restaurar a su colección original (si ya no existe, se recrea) o eliminar definitivamente, de a uno o *Vaciar papelera*. Tiene su entrada en el sidebar y en la hoja de colecciones, y se ve en grilla. Progreso y bookmarks vuelven con el libro restaurado.

### Cambiado
- Los nombres de archivo y de carpeta **conservan acentos y espacios** (antes "Programación.pdf" se guardaba como "Programacion.pdf"). Cambiar el título de un libro renombra su archivo dentro de su carpeta.
- Mover un libro de colección mueve el archivo. Renombrar una colección renombra la carpeta y arrastra subcarpetas, libros y la ruta original de lo que está en la papelera.
- Los contadores de colecciones son recursivos.
- **El contenedor corre como el usuario 1000, no como root** (`user:` en el `docker-compose.yml`, con `HOME=/tmp` para el socket de control de gunicorn), así lo que crea la app es del usuario del servidor y se pueden dejar archivos a mano. `data/` y `uploads/` tienen que ser de ese usuario (ver README).
- Todo lo que mueve archivos o reescribe el índice pasa por un lock de archivo: con los 2 workers de gunicorn, un releer y una subida simultáneos podían indexar el mismo archivo dos veces.

### Migración
- El primer arranque crea una carpeta por colección (también las vacías) y mueve cada archivo a la suya; lo de "Sin coleccion" queda en la raíz. Conserva los ids de libros y colecciones. Va libro por libro con commit: si se corta, el próximo arranque sigue desde donde quedó. Antes copia la base a `data/bookshelf.db.pre-v1.14`. Busca cada archivo por nombre dentro de la carpeta del usuario, sin confiar en la ruta absoluta guardada, y nunca toca nada fuera de esa carpeta.

### Notas
- `VERSION` del service worker: `v26` → `v27`.
- Verificado con datos creados por v1.13 con las mismas colecciones que producción, incluidas "Temporales", una vacía y "Facultad - Arquitectura":
  - Migración: archivos en sus carpetas, ids conservados, progreso y bookmarks intactos, carpeta vacía creada, "Temporales" → `Temporal/` con su reloj. Cortada a la mitad (archivo movido sin commit, y archivo sin mover): retoma sin duplicar.
  - 57 pruebas de API (subcolecciones, vista recursiva, renombrar, papelera, restaurar a una colección borrada, vencimientos de Temporal y papelera, archivos dejados a mano movidos/nuevos/NFD/symlink/temporales, freno de seguridad, compartir a otro usuario, títulos con acentos), **también contra la imagen Docker real** corriendo como usuario 1000 con gunicorn y 2 workers.
  - Concurrencia en la imagen real: 8 subidas, 8 releer y 8 listados a la vez, sin errores ni rutas duplicadas; el releer posterior no encuentra nada que corregir.
  - Interfaz en Chromium, escritorio (1440x900) y mobile (390x844): árbol, ruta, pastillas, papelera con restaurar, crear dentro de la abierta, releer, mover desde el lector.

## v1.13 — Colecciones en grilla, doble pagina nitida y lector de texto

### Cambiado
- **Dentro de una coleccion los libros se ven en grilla**, una hilera debajo de la otra, con tantas columnas como entren en la pantalla (6 en una compu de 1440 px, 3 en un iPhone). Antes era una sola fila que habia que scrollear de costado. La biblioteca general sigue igual: una fila por coleccion. *Sin conexion* y la busqueda dentro de una coleccion tambien usan la grilla.

### Agregado
- **Lector de TXT y Markdown (.md).** Scroll continuo, con letra (Serif / Sans / Mono), tamaño y tema (oscuro, sepia, claro) ajustables. Son preferencias del dispositivo y valen para todos los textos. Guarda el progreso (porcentaje leido, el mismo campo que el EPUB, asi la tarjeta muestra "% leido"), tiene bookmarks (por porcentaje) y busqueda con las coincidencias marcadas.
  - El Markdown cubre lo de las notas tipo Obsidian: titulos, negrita, italica, tachado, `==resaltado==`, codigo, bloques de codigo, citas, listas anidadas y de tareas, tablas, links, imagenes y `[[wikilinks]]` (se ven, no navegan). El front matter de YAML no se muestra.
  - **Seguro por construccion:** `static/js/mdlite.js` es un renderizador propio que escapa todo el HTML antes de darle formato, y solo deja links `http(s)`, `mailto` o relativos. Importa porque los libros se comparten entre usuarios: un `.md` ajeno se dibuja en tu sesion. La contra es que el HTML crudo dentro de un `.md` se ve como texto.
  - Un `.txt` que no es UTF-8 valido se lee como Windows-1252 (los `.txt` viejos de Windows salian con los acentos rotos).
  - En el celu scrollea el documento, como el modo scroll del PDF, y respeta la safe area de arriba y la pildora de abajo. Los ajustes son botones de 44 px y no selects (un select con fuente chica hace zoom en iOS).
  - `.md` se puede subir (antes lo rechazaba el servidor).

### Corregido
- **La doble pagina (y el modo libro) se veian borrosos en la compu.** El marco de cada hoja era A4 fijo y el canvas se estiraba para llenarlo: en cualquier PDF que no fuera A4 la hoja quedaba reescalada (6 % mas ancha en un libro de 6x9, y en el modo libro ademas agrandada un 11 %). Ahora el marco toma la proporcion real del PDF y el canvas tiene exactamente los pixeles de la pantalla, tambien con el escalado de Windows al 125 %/150 %.
- **Al agrandar la ventana, entrar a pantalla completa o hacer zoom en el navegador**, las hojas no se volvian a dibujar y quedaban chicas o borrosas. Ahora se rearman (solo si de verdad cambio el tamaño o la densidad de pixeles).
- **Volver a la doble pagina o al modo libro despues de cambiar de modo rompia el lector** (`Cannot set properties of null`): el `destroy()` de StPageFlip saca del DOM el contenedor de las hojas, y al volver no habia donde dibujarlas.
- **En un EPUB, elegir un modo de lectura (scroll, pagina, libro, doble) dejaba la pantalla en blanco.** Esos modos son solo del PDF; en los demas formatos el selector ya no aparece.

### Notas
- `VERSION` del service worker: `v25` → `v26`; `mdlite.js` agregado al app shell.
- Verificado en Chromium, escritorio (1440x900, con `devicePixelRatio` 1 y 1.25) y mobile (390x844), contra la version anterior:
  - Grilla: antes 1 fila con 14 libros; ahora 3 filas en escritorio y 5 en el celu, sin scroll horizontal.
  - Doble pagina y libro: antes canvas de 509 px mostrado en 541 (proporcion 0,667 estirada a 0,708); ahora 1:1 en todos los casos, tambien despues de cambiar el tamaño de la ventana. Ir y volver entre modos, flechas del teclado y *Siguiente* funcionan sin errores y conservan la pagina.
  - Markdown con `<script>`, `onerror=`, links `javascript:` e imagenes `data:`: ninguno llega al DOM como codigo (cero scripts, cero atributos `on*`, cero links `javascript:`).
  - Preferencias y progreso sobreviven una recarga; ir a un bookmark vuelve al mismo porcentaje; un TXT en Windows-1252 muestra "canción, año, pingüino".

## v1.12 — El progreso sobrevive sin conexion

Leias un libro descargado sin internet (en el gimnasio), avanzabas de la 70 a la 100, salias, y al volver a entrar estabas otra vez en la 70. Reproducido tal cual en Chromium con el modo offline real.

### Corregido
- **Sin conexion, el lector abria en una pagina vieja.** El progreso se pedia por GET al abrir el libro, y sin red ese GET lo contestaba el service worker con la ultima copia cacheada: la de la ultima vez que se abrio el libro **con** internet. Todo lo leido despues no existia.
- **Lo leido sin conexion se perdia para siempre.** Cada cambio de pagina era un POST "dispara y olvida": sin red fallaba en silencio y nadie lo reintentaba. Al volver internet el servidor seguia en la 70.
- **Salir rapido perdia el ultimo tramo, incluso con internet.** La posicion se guardaba con un debounce de 0.9–1.2 s; tocar *volver* antes de que venciera lo cancelaba, y la navegacion ademas abortaba el POST en vuelo.
- **Con conexion a medias el lector podia quedar colgado** esperando el GET del progreso, sin timeout.

### Cambiado
- **El progreso es local primero** (`static/js/progress.js`, compartido por biblioteca y lector). Cada guardado se escribe al instante en `localStorage` con una marca de tiempo y queda pendiente de sincronizar. Al abrir un libro manda la copia local: el progreso es por dispositivo, asi que nadie mas puede tener una version mas nueva. El servidor solo se consulta si no hay copia local (libro nunca abierto en este telefono, o progreso de antes de esta version), con timeout de 4 s.
- **Sincronizacion con reintentos.** Lo pendiente se manda con debounce mientras se lee, de inmediato al salir (con `keepalive`, sobrevive a la navegacion), al cambiar de app o bloquear la pantalla (`visibilitychange`, el unico aviso confiable en iOS), al volver la conexion, al volver a la app y al abrir cualquier pagina. Si falla, backoff de 5 s a 60 s. Background Sync no existe en iOS, por eso se hace a mano.
- **El servidor ignora guardados mas viejos que el que ya tiene**, comparando la marca de tiempo del cliente dentro del mismo `UPSERT` (atomico entre los dos workers de gunicorn). Un reintento atrasado o desordenado nunca pisa uno nuevo. Clientes viejos sin `ts` se aceptan siempre, como antes.
- **`updated_at` es cuando se leyo, no cuando llego** (acotado a "ahora" por si el reloj del telefono esta adelantado): *Continuar leyendo* ordena bien aunque la sesion del gimnasio sincronice a la noche.
- Las tarjetas de la biblioteca muestran el progreso local: sin conexion dicen la pagina real.
- El service worker **ya no cachea** `/api/books/<id>/progress`.

### Notas
- `VERSION` del service worker: `v24` → `v25`; `progress.js` agregado al app shell. Hay que abrir la app **una vez con internet** para que el telefono tome la version nueva.
- Verificado en Chromium mobile (390x844) con el modo offline real y el service worker activo, misma escena contra la version anterior y contra esta:
  - Antes: online hasta la 70 → offline hasta la 100 → reabre en **70**; al volver internet el servidor sigue en **70**.
  - Ahora: reabre en **100**; tocar volver inmediatamente despues de scrollear tambien queda guardado; al volver internet el servidor pasa a la ultima posicion solo, sin abrir el libro.
  - Migracion: un progreso que solo estaba en el servidor se toma bien y queda copiado local.
  - Tarjeta de la biblioteca sin conexion: muestra la pagina real.
  - GET del progreso colgado (conexion a medias): el lector abre a los ~4 s en vez de quedarse esperando.
  - Servidor: un guardado mas viejo o con el mismo `ts` no se aplica; uno mas nuevo si; `ts` en el futuro se acota; JSON invalido da 400.
- `README.md` y `docker-compose.yml` saltan de 1.10 a 1.12: en v1.11 no se habian actualizado.

## v1.11 — Bookmarks desde la pildora

### Cambiado
- **El boton de bookmark de la pildora abre un panel con dos opciones**: *Nuevo bookmark* (con la pagina actual al costado) y *Ver bookmarks* (con la cantidad). Antes solo abria el modal viejo para crear uno.
- **Nuevo bookmark es una barra para escribir, igual al buscador**: sale de atras de la pildora, sube con el teclado y se confirma con Enter o con el tilde. El nombre es opcional; el placeholder avisa en que pagina queda. Tocar de nuevo el boton de bookmark la cierra, y el buscador y esta barra nunca estan abiertos a la vez.
- **Ver bookmarks abre la lista en el panel que crece de la pildora**, tanto desde el boton de bookmark como desde *Mas → Ver bookmarks* (que antes abria el drawer lateral viejo). Tocar uno te lleva a su pagina; la cruz al costado lo borra sin cerrar el panel. El de la pagina en la que estas aparece resaltado.
- En escritorio no cambia nada: siguen el modal y el drawer lateral.

### Corregido
- El nombre de un bookmark se insertaba como HTML en la lista. Ahora va como texto.

### Notas
- `VERSION` del service worker: `v23` → `v24`.

## v1.10 — El scroll del lector, robusto

Investigacion completa del scroll en mobile. Eran **cuatro causas distintas**, no una.

### Corregido
- **Las paginas sin renderizar no reservaban su alto.** Un `<canvas>` recien creado mide 300x150 por defecto, asi que una pagina sin dibujar aportaba 150px en vez de sus ~551px reales: el documento media **la mitad** (10577px con 40 paginas, contra 22242 reales). Cada pagina que se renderizaba crecia ~400px y empujaba todo lo de abajo — de ahi los saltos y la sensacion de scroll cortado. Ahora cada pagina reserva su alto desde el arranque, calculado con la proporcion de la primera, y lo suelta al dibujarse.
- **El progreso guardaba solo el numero de pagina.** Al reabrir, el lector volvia al **borde superior** de esa pagina, no al punto donde estabas: medido, **184px mas arriba**. Ahora se guarda tambien el desplazamiento dentro de la pagina (el backend no cambia: `progress_data` ya era JSON libre). Ademas se guarda al scrollear, no solo al cambiar de pagina, asi moverse dentro de una pagina larga tambien queda registrado.
- **Habia una inercia propia peleando contra la del navegador.** Estaba rota —usaba `S`, que vive dentro de `initPDFScroll`, asi que tiraba `"S is not defined"` en **cada gesto**, en silencio— y aunque funcionara, sobra: desde que el lector scrollea el documento (v1.5.6) el navegador ya aplica la suya, y dos motores moviendo la pagina a la vez son exactamente los tirones. Eliminada; los gestos horizontales se mantienen, porque los otros modos no tienen scroll nativo que los resuelva.
- **El indicador de pagina se equivocaba al saltar lejos** (pedir la 25 mostraba la 26, la 40 mostraba la 39). El `IntersectionObserver` solo entrega las paginas que **cambiaron** de estado, y el codigo elegia la mas visible **entre esas**: la pagina buscada no habia cambiado, asi que ni figuraba. Ahora se lleva el registro completo de visibilidad y se elige entre todas.
- `goPage` disparaba el render sin esperarlo y calculaba el destino con el layout viejo.

### Notas
- `VERSION` del service worker: `v22` → `v23`.
- Verificado con un PDF de 40 paginas: al abrir se renderizan **4 de 40** (antes 11, con el documento a mitad de alto), la altura completa esta reservada de entrada y **no cambia** al renderizar (22242 → 22232), el scroll no se corre solo, reabrir cae dentro de **±10px** del punto exacto en tres posiciones distintas, los saltos a las paginas 1/3/12/25/33/40 clavan todos, y no hay un solo error de JS. Desktop sin cambios.
- Correccion sobre una medicion propia: al principio reporte que se renderizaban "40 de 40" paginas. Era falso —eran 11— porque contaba canvas con `width > 10` sin saber que un canvas vacio ya mide 300x150. El problema real no era cuantas se renderizaban sino que el documento media la mitad de lo que debia.

## v1.9.1 — Los dos buscadores vuelven a ser el mismo

### Corregido
- **El buscador del lector se veia distinto al de la biblioteca**, cuando deberian ser la misma barra. La causa: `reader.css` carga **despues** de `nav.css` y conservaba las reglas viejas de `.search-bar-reader` con la **misma especificidad** que `.nav-search`, asi que le ganaban por orden. El lector terminaba con otro padding (perdiendo el calce por detras de la pildora), otro fondo, y la fuente del input en `.85rem`.
- Ese ultimo detalle era ademas un bug real: **revivia el zoom de iOS al enfocar**, que habiamos corregido en v1.6.4 poniendo 16px. El arreglo estaba, pero una regla vieja lo pisaba solo en el lector.
- Las reglas viejas quedan acotadas a desktop con `@media (min-width: 641px)`, que es donde el buscador del lector si vive dentro de la topbar.

### Notas
- `VERSION` del service worker: `v21` → `v22`.
- Verificado midiendo las dos barras propiedad por propiedad: alto 78, visible 52, margenes 16/16, radio 24px arriba y 0 abajo, mismo fondo, mismo padding y fuente 16px en las dos. La unica diferencia es la que corresponde: el lector suma las flechas y la cruz (tres botones de 38px). Desktop sin cambios.

## v1.9 — Logo propio

La marca deja de ser el icono generico de libro que se repetia por toda la interfaz. Ahora hay un logo propio: un pajaro cuya ala es un libro, con senalador.

### Agregado
- **`static/icons/logo.svg`**, unica fuente de verdad. Es **monocromo a proposito**: hereda `currentColor`, asi en el titulo sale del mismo color que la palabra y se desvanecen como una sola pieza. Si fuera de color fijo, al apagarse el titulo se veria el color quedandose atras. Los huecos (ojo, paginas, senalador) calan con `fill-rule="evenodd"`, por eso funciona en un solo color sobre cualquier fondo.
- El logo aparece ahora en **cinco lugares**: el titulo de la biblioteca en mobile, el sidebar de desktop, la pantalla de login, el panel de administracion (que era **la unica pantalla sin marca**) y los iconos de app.

### Corregido
- **Login y admin no tenian `apple-touch-icon`.** No es cosmetico: el flujo natural para instalar la PWA es entrar al sitio, caer en `/login` y recien ahi agregar a inicio — justo donde iOS no encontraba icono y usaba una captura de la pantalla. Login ademas no linkeaba el manifest, asi que Android tampoco ofrecia instalar desde ahi.
- **Los iconos declaraban `purpose: "any maskable"` en el mismo archivo.** Android recorta los *maskable* a circulo o squircle y solo garantiza visible el 80% central, asi que estaba recortando un icono sin margen de seguridad. Ahora son cuatro archivos: `icon-192/512` para `any` (el logo al 76% del lienzo) y `icon-maskable-192/512` con el margen del 20%.

### Notas de implementacion
- El logo llego como PNG y hubo que vectorizarlo, sin potrace ni inkscape en la maquina y con `pip` bloqueado. El trazado se hizo a mano con numpy y scipy: mascara por distancia de color, seguimiento de contornos por Moore-neighbor, promedio movil para matar la escalera de pixeles, Douglas-Peucker, y curvas Catmull-Rom **respetando las esquinas** — el libro y el senalador tienen aristas rectas que no se podian redondear. Resultado: 6.8 KB con **1.28% de diferencia** contra el original.
- Las primeras versiones salian facetadas porque la deteccion de esquinas a 48° marcaba casi todo el contorno como arista y lo emitia en rectas. Se calibro comparando tres combinaciones de suavizado, tolerancia y umbral de esquina contra el original.
- El logo va en el violeta de la app (`--accent`, `#7c6ff7`), no en el del archivo original (`#5935a3`), para que concuerde con el resto.
- `VERSION` del service worker: `v20` → `v21`; `logo.svg` y los maskable se agregaron al app shell.

## v1.8 — Notificaciones en el panel y cambio de contrasena

### Agregado
- **Cada usuario puede cambiar su propia contrasena** desde Ajustes, que hasta ahora decia "Proximamente". Antes solo existia el reseteo del admin, asi que para cambiarla habia que pedirsela a otro.
- Nueva ruta `POST /api/me/password`. **Pide la contrasena actual ademas de la nueva**: sin eso, cualquiera que agarre el telefono desbloqueado con la sesion abierta podria dejar al dueno afuera de su propia cuenta. El reseteo del admin sigue sin pedirla, porque existe justamente para cuando el usuario ya no la sabe.
- El formulario valida del lado del cliente lo que puede (que las dos nuevas coincidan, el minimo de 6 caracteres) para no ir al servidor al pedo, y deja para el servidor lo unico que solo el puede saber: si la actual es correcta.

### Cambiado
- **Las notificaciones crecen desde la pildora** en mobile, en vez de aparecer como una hoja desde abajo. Mismo criterio que Colecciones, Subir y los paneles del lector. En desktop siguen siendo un modal.

### Notas
- `VERSION` del service worker: `v19` → `v20`.
- Los campos de contrasena van a 16px, por lo mismo que el resto: por debajo de eso Safari hace zoom al enfocar.
- Como el resto de los paneles, las notificaciones **mueven los nodos del modal adentro** y los devuelven al cerrar, asi `loadNotifications()` sigue pintando sobre los mismos elementos y los handlers de cada notificacion no se tocan.
- Verificado contra la API: actual incorrecta da 403, nueva corta 400, nueva igual a la actual 400, y el caso bueno 200. Despues del cambio, **el login con la vieja rebota a /login y con la nueva entra** — el primer control que escribi miraba el codigo HTTP y no servia, porque el login redirige con 302 en los dos casos; hubo que mirar a donde redirige. Y por UI: el panel sale de la posicion exacta de la pildora con la lista real adentro y la devuelve al cerrar; el formulario avisa si las nuevas no coinciden, si la actual es incorrecta, y confirma al cambiarla. Desktop intacto.

## v1.7.1 — Ajustes del buscador y del titulo

### Corregido
- **Cerrar el buscador vacio repintaba toda la grilla**, lo que se veia como una recarga de los libros sin motivo. Ahora solo se vuelve a renderizar si habia algo escrito.
- **Se saco la cruz del buscador.** Se cierra tocando la misma lupa que lo abrio, que es lo que uno hace igual.

### Cambiado
- **El titulo "Bookshelf" pasa a quedar por delante** (`position: sticky`): el contenido scrollea por detras en vez de llevarselo puesto.
- **Se mantiene un tramo antes de irse**: queda entero los primeros 90px de scroll y recien despues se desvanece a lo largo de 120px, subiendo 10px mientras se apaga. Apagarlo de entrada se sentia como que se escapaba; asi acompana un tramo y se va cuando el contenido ya tomo la pantalla.
- Lleva un degradado de fondo que se va con el: sin el, el texto quedaria ilegible cuando pasa por detras la tapa clara de un libro.
- El titulo es una **fila flexible con un hueco para el logo** al lado del nombre, asi sumarlo mas adelante no toca el layout.

### Notas
- `VERSION` del service worker: `v18` → `v19`.
- Verificado: la lupa abre y cierra, y cerrar vacio deja las 4 tarjetas **intactas** (se marcaron antes para detectar el repintado); con texto escrito si restaura todo. La curva del titulo medida a 0/60/150/230px de scroll da 1.00 / 1.00 / 0.50 / 0.00. Y lo que mas importaba: el titulo **no intercepta el toque** (`elementFromPoint` sobre el devuelve el contenido de atras), se puede abrir un libro y volver. Desktop intacto.

## v1.7 — La biblioteca se queda sin topbar

En mobile la topbar desaparece y todo lo que tenia pasa a la pildora. La pantalla queda para los libros.

### Cambiado
- **La topbar ya no se muestra en mobile.** No se saca del DOM: el input de busqueda y los handlers de notificaciones cuelgan de ahi, y en desktop sigue siendo la unica navegacion.
- **La barra se reordeno** segun que se usa seguido y que se consulta de vez en cuando:

  | Antes | Ahora |
  |---|---|
  | About | **Buscar** |
  | Ajustes | **Subir libro** |
  | Subir | **Mas** |

  Queda: Colecciones · Buscar · Biblioteca · Subir · **Mas**.
- **El panel "Mas"** recibe lo que salio de los dos lados: Notificaciones (con su contador de no vistas), Informacion, Ajustes y Cerrar sesion.
- **El buscador de libros usa la misma barra que el del lector**: sale de atras de la pildora. El input real se mueve ahi al abrirlo y vuelve a la topbar al cerrar, asi el handler que filtra los libros sigue siendo el mismo.
- **"Bookshelf" centrado arriba, que se desvanece al scrollear.** Es puramente estetico: se ve el nombre al entrar y se va en los primeros 70px de scroll, dejando la pantalla para los libros. Vuelve al subir.

### Notas
- El titulo decia "Biblioteca" porque **lo escribia nuestro propio codigo**, no por una traduccion del telefono: `topbarTitle` se cambiaba a "Biblioteca", "About", "Ajustes" o el nombre de la coleccion desde siete lugares distintos. El titulo de marca dice siempre "Bookshelf".
- Como efecto de eso, **el nombre de la coleccion abierta ya no se muestra en mobile**. La coleccion activa sigue marcandose dentro del panel de Colecciones.
- El desvanecido corre dentro de un `requestAnimationFrame`: el scroll dispara muchisimo y esto solo toca una propiedad.
- `VERSION` del service worker: `v17` → `v18`.
- Verificado: topbar oculta, el orden de los cinco slots, el titulo apareciendo y desvaneciendose (y volviendo), las cuatro filas del panel, y el buscador abriendo desde atras de la pildora, filtrando de verdad, y devolviendo el input a su lugar al cerrar. El panel navega a Ajustes e Informacion y marca la activa. Desktop intacto: topbar con su buscador, notificaciones y subir, sin titulo de marca y sin pildora.

## v1.6.7 — El doble tap vuelve a esconder la navbar

### Corregido
- **El doble tap no escondia ni traia la barra.** La reescritura del panel en v1.6.4 abarco un rango de lineas que se llevo puesta la definicion de `_toggleReaderNav`, pero no su llamada: el handler seguia invocando una funcion que ya no existia y tiraba `ReferenceError` en silencio, sin ninguna senal visible. Repuesta, y de paso ahora tambien cierra la busqueda al esconderse, para que no quede flotando sin su barra.

### Notas
- `VERSION` del service worker: `v16` → `v17`.
- Se agrego un control que compara las funciones internas llamadas contra las definidas. Es exactamente el tipo de error que un `node --check` no ve (la sintaxis era valida) y que solo aparece al tocar la pantalla.
- Verificado: el doble tap la esconde (opacidad 0, se va hacia abajo) y la trae de vuelta a su posicion exacta, sin mover el punto de lectura.

## v1.6.6 — Ajustes de la barra de busqueda

### Cambiado
- **La barra de busqueda va al mismo ancho que la pildora**, alineada a sus bordes, en vez de retraida 16px por lado como en la referencia. Lo que sigue haciendo que las dos se lean como una sola pieza es lo demas: el fondo mas oscuro, las esquinas de arriba redondeadas con la base recta, y esa base tapada por la pildora.
- **Barra mas alta**: 52px utiles (antes 44), con las esquinas a 24px acompanando.
- **Botones mas grandes**: las flechas y la cruz pasan de 30px a 38px, con el icono a 18px y realce al tocar. Entran comodos en los 52px y llegan a un tamano razonable para el dedo.

### Notas
- `VERSION` del service worker: `v15` → `v16`.
- Verificado: 358px de ancho, identico al de la pildora y alineado a los mismos bordes; 52px utiles; los tres botones a 38px; la base sigue tapada 26px. Sigue animando al abrir (768 → 734 → 716), la cruz cierra, y con el teclado sube manteniendo la separacion exacta.

## v1.6.5 — La busqueda queda pegada a la navbar

### Cambiado
- **La barra de busqueda se rediseno siguiendo el patron de una barra de chat con una barra secundaria encima.** Antes salia de atras de la pildora pero con el mismo ancho, asi que se leia como dos barras apiladas. Ahora forma una sola pieza con ella:
  - **Mas angosta**: 16px por lado respecto de la pildora, la proporcion medida sobre la referencia (886px contra 919px).
  - **Mas oscura**: se aleja en vez de competir con la barra principal, igual que en la referencia (31,31,31 contra 53,53,53).
  - **Esquinas de arriba redondeadas y base recta**, porque la base **queda tapada** por la pildora: se mete 26px por detras, con el `z-index` por debajo.
- Los controles de la busqueda (anterior, siguiente, cerrar y el contador) se achicaron para no competir con la barra.

### Notas
- `VERSION` del service worker: `v14` → `v15`.
- Verificado con navegador real: 326px de ancho contra 358 de la pildora (16px por lado exactos), 26px de solapamiento, radio 22px arriba y 0 abajo, `z-index` 140 contra 150, y fondo mas oscuro (0.063 contra 0.078). La animacion recorre el camino en vez de saltar (768 → 740 → 724), se puede escribir, cierra y se esconde, y con el teclado sube manteniendo exactamente la misma separacion de 44px respecto de la barra.

## v1.6.4 — Correcciones del panel del lector

### Corregido
- **Guardar sin conexion no decia si el libro estaba guardado.** La unica senal era el indicador de descarga del navegador, que no es nuestro y desaparece. Ahora la fila **no cierra el panel** al tocarla —es la unica herramienta con estado, y cerrando no habria forma de ver el resultado— y se repinta sola: el icono pasa a un tilde, aparece "Guardado" a la derecha y la fila queda marcada. Se entera por un `MutationObserver` sobre el boton original, asi el estado no se puede desincronizar.
- **Los botones de tilde eran un paso de mas.** El de renombrar se fue: el titulo se guarda al salir del campo o con Enter, que es lo que uno hace igual. El de coleccion tambien.
- **La coleccion ya no abre el selector nativo de iOS**, que saca al usuario del panel para mostrarle una rueda. Ahora la fila muestra la coleccion actual y al tocarla despliega las opciones ahi mismo, como sub-filas, con la actual marcada.
- **Zoom de iOS al enfocar un campo.** Safari hace zoom automatico cuando un input tiene fuente menor a 16px, y despues hay que deshacerlo a mano. Los campos del panel y el de busqueda pasan a 16px exactos. No se uso `maximum-scale`, que lo evita pero rompe el zoom manual en toda la app.

### Cambiado
- **En mobile se lee siempre en scroll continuo.** Los modos pagina, libro y doble estan pensados para pantalla grande; en un telefono solo agregan una decision que nadie quiere tomar. El selector se oculta y el modo se fuerza a scroll al abrir, **sin persistirlo**, para que en desktop el libro siga abriendo como lo dejaste.

### Notas
- `VERSION` del service worker: `v13` → `v14`.
- Verificado con navegador real: guardar y desguardar actualizando la fila sin cerrar el panel; cero botones de confirmar y cero selects nativos; la coleccion desplegando sus opciones y marcando la elegida; el selector de modo oculto; los dos campos a 16px. Ademas el titulo se guarda de verdad (comprobado contra la API) y en desktop sigue todo como estaba: selector de modo visible, tilde de renombrar, select de coleccion y pildora oculta.

## v1.6.3 — Un solo panel en el lector, y la busqueda sale de la barra

### Cambiado
- **Los dos paneles del lector se unifican en uno.** Se habian separado por miedo a que no entrara todo; entra comodo. La barra queda en cuatro slots: **Volver · Buscar · Bookmark · Mas**.
- **Todas las herramientas se ven igual.** Guardar sin conexion, Enviar a otro usuario y Compartir por WhatsApp eran botones con estilos propios dentro del drawer, cuando son herramientas del mismo tipo que Subrayar o Descargar. Ahora son filas identicas: icono, etiqueta, y estado a la derecha cuando corresponde (Guardar sin conexion muestra "Guardado").
- **Los campos del libro pasan a la estetica del panel.** El input de titulo, el select de coleccion, el selector de modo y los botones de confirmar dejan de ser rectangulos: son pildoras con el mismo radio y los mismos bordes que las filas, para que el panel se lea como una sola pieza y no como un formulario pegado abajo de una lista. El panel queda dividido en **Herramientas** y **Libro**, con un separador.
- **La busqueda sale de detras de la pildora** en vez de abrirse como una barra arriba de la pantalla: mismo ancho, mismo lenguaje visual, y un `z-index` menor para que se vea asomar desde atras.
- **La barra sube con el teclado.** `visualViewport` se encoge cuando el teclado aparece; la diferencia contra `innerHeight` se publica como `--kb-offset` y la pildora, el panel y la busqueda la suman a su separacion del borde, asi que el campo nunca queda tapado. Hay un umbral de 120px para no confundir el teclado con la barra de direcciones.

### Notas
- `VERSION` del service worker: `v12` → `v13`.
- La barra de busqueda queda **siempre montada** en mobile, invisible y sin capturar toques, en vez de `display:none`. Con display, la primera apertura pasaba de oculta a visible en el mismo frame y la animacion no corria; se verifico capturando la posicion a mitad de la transicion (780 → 744 → 712).
- Verificado con navegador real: las ocho herramientas como filas, los cuatro controles con radio 999px, las dos secciones, escribir en el titulo y el modo activo marcado, los nodos volviendo a su lugar exacto al cerrar, la busqueda animando y subiendo con `--kb-offset` junto a la barra. Desktop intacto (pildora oculta, topbar con iconos, busqueda como antes, drawer con todo su contenido) y el modo sin conexion sin regresiones.

## v1.6.2 — La navbar tambien en el lector

### Cambiado
- **En mobile la pildora reemplaza a la topbar del lector**, con las mismas medidas y el mismo comportamiento que en la biblioteca. Cinco slots: **Volver · Buscar · Bookmark · Mas · Libro**. Los tres primeros son acceso directo por ser lo mas usado mientras se lee; el resto vive en los dos paneles que crecen desde la barra.
- **"Mas"** trae las herramientas de lectura: Subrayar, Ver bookmarks, Descargar y Compartir. La **Lupa** aparece solo cuando corresponde (modo Doble), igual que antes.
- **"Libro"** trae lo que vivia en el drawer de info: renombrar, modo de visualizacion, coleccion, enviar a otro usuario, guardar sin conexion y borrar. En mobile el drawer lateral ya no se usa.
- **El doble tap ahora esconde la pildora** en vez de la topbar (que en mobile ya no se ve), con la misma animacion de salida de la referencia: se va hacia abajo por su propio alto mas la separacion. Otro doble tap la trae de vuelta.

### Notas de implementacion
- La pildora y el panel desplegable pasan a `static/css/nav.css` y `static/js/nav.js`, compartidos por las dos pantallas. Antes vivian en los archivos de la biblioteca, que el lector no carga; duplicarlos habria dejado las medidas en dos lugares distintos.
- **Los botones de la navbar no reimplementan nada**: hacen `click()` sobre los de la topbar, que siguen en el DOM con sus handlers ya enganchados. No hay dos copias de la logica que se puedan desincronizar.
- **"Libro" mueve los nodos del panel de info adentro** y los devuelve al cerrar, igual que hace la biblioteca con el formulario de subir. Renombrar, cambiar de coleccion, enviar y guardar sin conexion siguen funcionando con sus handlers tal cual.
- La topbar **no se oculta del todo** en mobile: la barra de busqueda cuelga de ella en el DOM y moverla habria roto el layout de desktop. Queda como contenedor transparente, sin fondo ni alto, visible solo cuando la busqueda esta abierta — y la barra de busqueda se restilo como pildora para que acompane.

### Notas
- `VERSION` del service worker: `v11` → `v12`. `nav.css` y `nav.js` se agregaron al app shell.
- Verificado con navegador real: la pildora mide 16/16/16/60 igual que en la biblioteca, con 5 slots y la fila de iconos de la topbar oculta; los dos paneles salen de la posicion exacta de la barra; "Libro" trae el contenido del drawer y lo devuelve al cerrar; el doble tap la esconde. Desktop intacto (pildora oculta, topbar con sus iconos, drawer lateral funcionando) y el modo sin conexion sin regresiones.

## v1.6.1 — Colecciones y Subir crecen desde la pildora

### Cambiado
- **Colecciones y Subir libro dejan de ser una hoja y un modal**: ahora son la misma pildora estirandose hacia arriba, con el `clip-path` de asmodeloscentral — arranca revelando solo los 60px de abajo con radio completo (exactamente la barra) y se abre a la tarjeta con radio 28. Mismo `left`/`right`/`bottom`, mismo fondo y borde, asi que se lee como la barra creciendo y no como un panel nuevo que aparece.
- El panel no tiene alto fijo: crece a lo que pida el contenido, con un `max-height` de resguardo para no tapar nunca el status bar. Su franja inferior reserva el alto de la barra, porque esa franja *es* la pildora que se acaba de tocar.
- Las filas son pildoras, no rectangulos: mismo lenguaje que la barra de la que salen.

### Notas de implementacion
- El panel se abre con `openNavSheet(build, onClose)`, reutilizable. Dos fases (montar / `.open`) porque un `clip-path` solo anima si el elemento ya estuvo en el DOM con el valor inicial aplicado.
- **Subir no duplica el formulario**: se mueven los nodos del modal adentro del panel y se devuelven al cerrar. Los handlers enganchados por id (`dropZone`, `fileInput`, `btnDoUpload`, el progreso) siguen funcionando tal cual, y en desktop el modal queda intacto.
- La limpieza cuelga del panel y no de quien lo cierra, porque hay varios caminos de cierre: el fondo, una fila que navega, o codigo ajeno — `doUpload` llama `closeModal` al terminar. Colgarla de uno solo dejaba el panel de Subir sin sus nodos y sin poder reabrirse.

### Notas
- `VERSION` del service worker: `v10` → `v11`.
- Verificado con navegador real: los dos paneles salen de la posicion exacta de la barra (16/374/828), arrancan clipeados y abren a `inset(0px round 28px)` con radio 28. Subida completa de punta a punta desde el panel (archivo, coleccion, progreso, cierre automatico y libro en la grilla), reapertura y segundo cierre sin perder nodos. Navegar desde Colecciones cierra el panel y cambia de seccion. En desktop el modal sigue abriendo como modal.

## v1.6 — Navbar flotante en la biblioteca

Se reemplaza la barra inferior de ancho completo por una **pildora flotante**, portando el patron de asmodeloscentral con la paleta de Bookshelf.

### Cambiado
- **La barra inferior ahora es una pildora**: separada 16px de los tres bordes, 60px de alto, radio completo, fondo `--surface` al 78% con `backdrop-filter: blur(20px) saturate(1.4)`. Al ser translucida y flotante, el contenido se ve y scrollea por detras.
- **Solo iconos, sin etiquetas** (23px). Cual seccion esta activa lo marca un **resaltado deslizante** que se mueve con una transicion de .28s, en vez del cambio de color del texto. Reemplaza al subrayado porque una pildora flotante no tiene un "pie" recto donde apoyarlo.
- Los 16px inferiores se miden contra el borde **fisico** de la pantalla, **no** contra `env(safe-area-inset-bottom)`. Apoyar la pildora entera por encima del indicador de inicio deja ~34px de aire muerto y se siente mas alta de lo que corresponde. Las barras de ancho completo (la anterior) si meten su fondo en esa zona; una pildora flotante no. No volver a sumar la safe area ahi.
- **La biblioteca pasa a scrollear el documento** en mobile, como ya hacia el lector desde v1.5.6. No es cosmetico: la pildora es `position: fixed`, y en una PWA standalone de iOS el viewport es ~50px mas corto que la pantalla fisica, asi que con un contenedor de scroll interno la pildora habria quedado flotando a ~66px del borde real en vez de a 16px. La topbar pasa a `position: sticky` para seguir quedando arriba.
- El colchon inferior del contenido pasa a derivar de las variables (`--nav-space`) en vez de repetir el numero a mano.

### Notas
- `VERSION` del service worker: `v9` → `v10`.
- Medido con navegador real contra la referencia: margenes 16/16/16, alto 60px, radio 999px, `blur(20px) saturate(1.4)`, 5 slots sin etiquetas, iconos de 23px. El resaltado se desliza al cambiar de seccion y vuelve a su lugar. Con contenido forzado a 2000px el documento scrollea y la pildora se mantiene clavada a 16px del borde. Desktop sin cambios (sidebar visible, pildora oculta, sin scroll de documento) y el lector sin regresiones.
- Lo que solo se calibra en un telefono real: `env(safe-area-inset-*)` vale 0 en el navegador de escritorio.

## v1.5.7 — El lector abre a pantalla completa en mobile, sin perder el punto de lectura

### Corregido
- **Entrar o salir de pantalla completa te movia del lugar donde estabas leyendo.** No era una recarga: en mobile el contenedor de scroll tiene `padding: .25rem` a los lados y en fullscreen pasa a `0`. Esos **8px de diferencia de ancho** superaban el umbral de 2px de `_scrollRerender`, que entonces descartaba todas las paginas dibujadas y las volvia a renderizar, dejando el scroll al **inicio** de la pagina actual en vez de donde estabas. El parpadeo era el re-render.

### Cambiado
- **En mobile el lector abre directamente a pantalla completa.** Ademas de ser lo que uno quiere al abrir un libro, resuelve la causa de raiz: el ancho disponible se calcula una sola vez, con el layout definitivo, y ya no hay ningun re-render que pueda moverte.
- **El doble tap alterna la topbar** y la deja como la dejaste. Antes se escondia sola a los 3 segundos, lo que hacia impredecible si el proximo doble tap la iba a mostrar o a esconder; ese auto-ocultado se elimino.
- El boton de pantalla completa se oculta en mobile: no tiene nada que alternar. En desktop sigue igual.
- `touchstart`/`touchend` ahora verifican que el evento traiga `touches`/`changedTouches` antes de leerlos. En un telefono real siempre vienen, pero sin el guard un evento sin ellos hacia tirar el handler.

### Notas
- `VERSION` del service worker: `v8` → `v9`.
- Verificado con navegador real: al abrir entra en fullscreen con el contenedor sin padding lateral y la topbar visible; tras scrollear a la pagina 5/6, dos dobles taps seguidos (ocultar y mostrar) dejan `scrollY` **identico** y ningun canvas se vuelve a renderizar. Desktop sin cambios (no entra solo en fullscreen, el boton sigue visible, el contenedor sigue siendo el scroller) y el modo sin conexion sin regresiones.

## v1.5.6 — El modo scroll del lector usa el documento como scroller

### Corregido
- **La franja del fondo al pie del libro en iOS.** En una PWA standalone, iOS le da a la webview un viewport mas corto que la pantalla fisica (medido en un iPhone 12 mini: 762px contra 812px) y **recorta el pintado de cualquier contenedor con overflow propio a ese viewport**. Los ultimos ~50px de pantalla quedaban fuera del alcance del contenedor de scroll y mostraban el fondo del body. Se intentaron tres arreglos que no podian funcionar, porque todos operaban dentro de esa caja: `bottom: 0`, `position: fixed; inset: 0`, y extender el elemento por debajo del viewport con un `bottom` negativo (`--ios-gap`) — este ultimo llego a calcular bien los 50px y aun asi no se vio, lo que confirmo el recorte.

  El scroller **raiz** no tiene esa limitacion: se pinta de borde a borde. Asi que en mobile el modo scroll deja de usar un `div` con `overflow-y: auto` y pasa a scrollear el documento, que es como lo resuelve asmodeloscentral (`html, body { height: 100% }` con el fondo en la raiz, que se propaga al canvas y cubre toda la webview).

  El cambio va scopeado bajo la clase `doc-scroll`, que `reader.js` pone solo en mobile y solo en modo scroll: los modos pagina y EPUB siguen con el shell de alto fijo, y en desktop no cambia nada. La logica de scroll quedo detras de una pequena abstraccion (`S`) que resuelve contra el documento o contra el contenedor segun corresponda, para no duplicar los observers ni el manejo de `scrollTop`.
- Se saco `user-scalable=no` del viewport del lector. Ademas de no usarse en la app de referencia, impedia hacer zoom en un lector de PDF.

### Notas
- `--ios-gap` y su medicion en `reader.js` se eliminaron: eran un parche para el enfoque anterior.
- `VERSION` del service worker: `v7` → `v8`.
- Verificado con navegador real en los dos anchos: en mobile scrollea el documento (3335px de contenido contra 844px de viewport) y en desktop sigue scrolleando el contenedor (7766px contra 810px), con las paginas renderizando y el contador avanzando en ambos. El modo sin conexion se reproba completo, sin regresiones.
- Lo que **no** se puede verificar desde una computadora: `env(safe-area-inset-*)` vale 0 en el navegador de escritorio y el viewport recortado de iOS no se reproduce. Se calibra en un telefono real — la misma advertencia que deja anotada asmodeloscentral.

## v1.5.5 — Safe areas de iOS y el requisito de HTTPS para el modo offline

### Corregido
- **La barra inferior de la biblioteca quedaba aplastada contra el borde de arriba.** `.bottom-nav` declaraba `height: 64px` con `padding-bottom: env(safe-area-inset-bottom)` adentro; como el proyecto usa `box-sizing: border-box`, en un iPhone la zona útil pasaba de 64px a 30px y los iconos con sus labels no entraban (el activo, que escala a 1.15, directamente se desbordaba). Lo rompió v1.5 al agregar `viewport-fit=cover`: hasta entonces `env(safe-area-inset-bottom)` valía 0 y el problema no se veía. Ahora la safe area se suma en vez de descontarse, y el `padding-bottom` del `.content` la acompaña para que la barra no tape la última fila de libros.
- **La topbar del lector tenía el mismo bug** (`height: 52px` con la safe area del notch adentro): pintaba una banda opaca sobre el libro y al ocultarse en pantalla completa se iba solo a medias, porque se trasladaba 52px cuando su alto visual era mayor.
- **Al ocultar la topbar quedaba una franja del fondo al pie del libro.** `_hideTopbar` le aplicaba `margin-top: -52px` al viewer "para llenar el hueco", pero en mobile la topbar es `position: fixed` y nunca ocupó espacio en el flujo: el margen solo subía el contenido y destapaba esa misma cantidad de píxeles abajo.
- **`reader.css` tenía una llave de cierre de más**, que dejaba el archivo desbalanceado.
- **Compensación del viewport recortado de iOS.** En una PWA instalada con `apple-mobile-web-app-status-bar-style: black-translucent`, iOS estira la webview hasta cubrir la pantalla pero reporta en `window.innerHeight` la altura *sin* la franja del status bar (medido en un iPhone 12 mini: pantalla 812px, viewport 762px). Esa diferencia aparece como una banda del fondo del body que ninguna regla de CSS puede tapar, porque `bottom: 0` obedece a un viewport que ya viene corto. `reader.js` mide la diferencia real contra la pantalla y la publica como `--ios-gap`; el viewer se extiende esos píxeles. Acotado a 120px, solo activo en modo standalone y recalculado al rotar. Nota: el disparador real de ese desajuste suele ser que iOS cachea la configuración de la web app al momento de agregarla a la pantalla de inicio — reinstalar el ícono después de cambiar las meta tags es parte del arreglo.

### Documentado
- **El modo sin conexión necesita HTTPS, y sin eso no funciona nada.** Los navegadores solo habilitan service workers en contextos seguros: entrando por `http://IP:8090`, `navigator.serviceWorker` ni siquiera existe, no se cachea nada, la app no abre sin internet y el botón "Guardar sin conexión" se oculta solo (el código lo esconde cuando no hay `caches`). La capacidad offline que anunciaba v1.5 era, en la práctica, inalcanzable en una instalación servida por HTTP plano. El README ahora explica el requisito y documenta cómo resolverlo con `tailscale serve`, que da un certificado de Let's Encrypt sin exponer el servidor a internet.
- El README detalla además cómo se guarda cada cosa: los tres caches, por qué el de los libros no lleva versión (sobreviven las actualizaciones) y el uso de `navigator.storage.persist()`.

### Despliegue
- **El servidor pasa a ser un clon del repo.** Antes se construía la imagen en la máquina de desarrollo, se empaquetaba con `docker save | gzip` (214MB) y se copiaba por `scp` a cada actualización. Ahora se actualiza con `git pull && docker-compose up -d --build` en el propio servidor. Como el repo es público, no necesita credenciales de git.
- **Los datos pasan de volúmenes con nombre a bind mounts** dentro del checkout (`./data`, `./uploads`), que es lo que ya declaraba el `docker-compose.yml` del repo. Hasta ahora el servidor corría con un compose propio que apuntaba a `bookshelf-v12_*`, así que el compose versionado y el real no coincidían — un `git pull` seguido de `up` habría arrancado con la biblioteca vacía. El README documenta la migración.

### Notas de despliegue
- `VERSION` del service worker: `v1` → `v7`. Los archivos del shell se sirven cache-first, así que sin subirla los dispositivos que ya visitaron la app se quedarían con las versiones viejas para siempre; además el navegador solo detecta un service worker nuevo si el archivo cambió. `BOOKS_CACHE` sigue sin versión a propósito: los libros guardados no se borran.

## v1.5 — Lectura sin conexión y pantalla completa real en mobile

### Agregado
- **Guardar libros para leer sin conexión**: botón "Guardar sin conexión" en el panel de info del lector. Descarga ese libro (y su portada) al dispositivo; el resto de la biblioteca **no** se baja sola, así no se llena el teléfono sin querer. Se puede quitar con el mismo botón.
- **Sección "Sin conexión"** en la biblioteca (sidebar en desktop, hoja de colecciones en mobile) que lista solo los libros guardados, más un indicador en la portada de cada libro disponible offline.
- **Service worker de verdad**: cachea el app shell (CSS, JS, íconos) y los datos de la biblioteca, así la app abre y se navega sin conexión. Antes el `sw.js` era un *kill-switch* que borraba todos los caches y se desregistraba a sí mismo: la capacidad offline era cero.
- `navigator.storage.persist()` al guardar el primer libro, para que iOS no evicte lo guardado.

### Corregido
- **El lector dependía de tres CDNs externos** (pdf.js, page-flip, epub.js): sin internet no abría ni un PDF, y en un servidor privado sin salida a la red tampoco. Ahora las librerías se sirven localmente desde `static/js/vendor/`. De paso, el `workerSrc` de pdf.js apuntaba al CDN aunque ya existía una copia local sin usar.
- **El CDN de epub.js devolvía 404**, así que la lectura de EPUB estaba rota desde antes. Se vendorizó la versión correcta (+ JSZip, que epub.js necesita).
- **El service worker nunca podía controlar la app**: un SW solo alcanza la carpeta donde vive el script, y estaba en `/static/js/`. Ahora se sirve desde `/sw.js`.
- **Pantalla completa en iPhone**: faltaba `viewport-fit=cover` (iOS reservaba las safe areas y el contenido nunca llegaba al borde) y las meta tags de PWA en el lector. En fullscreen mobile la hoja ahora ocupa el 100% del ancho, sin padding ni sombras, y pasa por debajo de la hora/batería como en los PDF nativos. Nota: `requestFullscreen()` no existe en Safari iOS, así que esto solo se logra con la app instalada en la pantalla de inicio.
- **El ancho de la hoja se descontaba dos veces** (32px en el cálculo del contenedor y otros 32px dentro del render), dejando la página más chica de lo necesario en pantallas pequeñas.
- **Las páginas no se re-escalaban** al rotar el teléfono o entrar/salir de fullscreen: el ancho disponible se calculaba una sola vez al abrir el libro.
- **Sin conexión, la biblioteca quedaba sin ningún botón funcional**: si las llamadas a la API fallaban, el init cortaba antes de enganchar los handlers. Ahora cada fetch resuelve con lo que haya cacheado.
- Abrir un libro no guardado sin conexión mostraba una pantalla en blanco; ahora avisa y ofrece volver a la biblioteca.

## v1.4 — Envío de libros entre usuarios

Un usuario puede enviarle un libro a otro sin salir del aislamiento: aparece como notificación (campana con contador en el topbar), se abre un visor centrado con la portada y se puede aceptar, eligiendo o creando una colección.

### Agregado
- Botón "Enviar a otro usuario" en el panel de info del lector, junto a "Compartir por WhatsApp".
- Campana de notificaciones con contador de no vistas en el topbar de la biblioteca; al abrir una notificación se ve la portada, el título y quién lo envió, con opción de aceptar eligiendo o creando una colección.
- Nueva tabla `book_shares` y rutas `GET /api/users`, `POST /api/books/<id>/share`, `GET /api/notifications`, `POST /api/notifications/<id>/accept|seen`.
- El archivo (y la portada) recién se copian a la biblioteca del destinatario al aceptar, no al enviar — nada se duplica en disco si nunca se acepta.
- Cerrar la notificación sin aceptar solo la marca como "vista" (deja de contar como nueva) — sigue pudiéndose aceptar después, no es un rechazo. Toda notificación (vista o no, aceptada o no) dura 7 días desde que se recibió y después se borra sola.
- `GET /api/users` es la única grieta intencional en el aislamiento total: expone únicamente nombres de usuario (nada de libros, colecciones ni actividad), necesaria para poder elegir destinatario.

### Corregido / cubierto
- La portada no se veía al revisar una notificación: la ruta de portada validaba dueño del libro contra el destinatario, que todavía no lo es hasta aceptar. Ahora hay una ruta dedicada que valida contra la notificación.
- Si el que envía borra el libro mientras el envío sigue pendiente, la notificación pendiente correspondiente se borra sola (no queda apuntando a algo inexistente).
- Si el libro desaparece justo entre el envío y el aceptar, se marca como "ya no disponible" en vez de romper.
- Borrar un usuario desde `/admin` también limpia sus notificaciones enviadas y recibidas.
- No se puede enviar un libro a uno mismo ni a la cuenta admin; un envío duplicado pendiente al mismo destinatario no se repite.
- **Modo scroll del lector, varios bugs que lo dejaban inutilizable**:
  - Renderizaba el PDF completo (todas las páginas) al abrir, en vez de solo lo cercano a la pantalla — en libros largos esto saturaba memoria/CPU y congelaba la interfaz. Ahora se renderiza de a poco, con margen, a medida que se scrollea.
  - Al texto seleccionable del PDF le faltaba la variable CSS `--scale-factor` que pdf.js necesita para posicionarlo — sin ella, terminaba tapando la topbar y bloqueando todos sus clics.
  - En pantallas anchas, la página se escalaba para llenar todo el ancho de la ventana sin límite, quedando gigante y con scroll excesivo por página. Ahora se acota a un ancho de lectura razonable.
  - Abrir un libro scrolleaba la ventana del navegador entera (no solo el visor interno), tapando la topbar arriba del viewport hasta hacer zoom o resize. Se reemplazó `scrollIntoView` por scroll directo del contenedor correcto.
  - Se le dio prioridad de superposición explícita a la topbar y las barras de controles del lector, para que el contenido del PDF nunca vuelva a robarles los clics.

## v1.3 — Login multiusuario

Primera versión pública. Cada usuario tiene su propia biblioteca (libros, colecciones, progreso, bookmarks, highlights), completamente aislada de la de los demás, manteniendo el proyecto simple (pensado para redes privadas, no para exponerse a internet).

### Agregado
- **Login con usuario y contraseña**, sesión de Flask con cookie firmada; `SECRET_KEY` se genera una vez y se persiste en `data/secret_key` (un reinicio del contenedor ya no desloguea a todos).
- **Biblioteca aislada por usuario**: cada usuario tiene sus propios libros, colecciones, progreso, bookmarks y highlights. Cada tabla relevante tiene `user_id`, y todas las rutas de la API filtran por el usuario en sesión — incluida la descarga de archivos y portadas.
- **Archivos separados por usuario en disco**: `uploads/<user_id>/` y `data/covers/<user_id>/`.
- **Cuenta de administrador** (`/admin`), sin biblioteca propia: solo gestiona usuarios (crear, borrar, cambiar contraseña). Al loguearse como admin se entra directo al panel, nunca a una biblioteca.
- **CLI `manage.py` + wrapper `manage.sh`** para crear/listar/borrar usuarios y resetear contraseñas sin pasar por la web (`./manage.sh create-user`, `list-users`, `delete-user`, `reset-password`).
- En el primer arranque se crea automáticamente `admin` / `admin123` — el resto de las cuentas se crean desde `/admin` o `manage.sh`.
- Animaciones: despliegue suave del formulario de "cambiar contraseña" en el panel, y fade-out al cerrar sesión.

### Corregido
- El selector de colección al subir un libro ya no queda seleccionado en la primera opción alfabética por default: ahora exige elegir una colección explícitamente antes de permitir la subida.
- `docker-compose.yml` no tenía sección `build:` (el flag `--build` no hacía nada) y usaba volúmenes con nombre en vez de bind mount a `./data`/`./uploads` — corregido.
- `.dockerignore` agregado: sin él, cada rebuild reenviaba toda la biblioteca (`data/`, `uploads/`) como contexto de build.

### Confirmado (ya funcionaba, sin cambios)
- La subida de múltiples archivos a la vez hacia la misma colección ya estaba soportada (selección múltiple + drag & drop).
- El resto de la biblioteca (lector, subida, colecciones, progreso, bookmarks, highlights, PWA) no se tocó: mismo comportamiento de siempre, ahora con el filtro de usuario por encima.

### Seguridad
- Contraseñas con hash (`werkzeug.security`, PBKDF2), nunca en texto plano — ni siquiera el admin puede verlas, solo resetearlas.
- Sin límite de intentos de login ni 2FA, a propósito: este proyecto es para redes privadas, no para exponerse a internet.
