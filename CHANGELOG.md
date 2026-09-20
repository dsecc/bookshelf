# Changelog

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
