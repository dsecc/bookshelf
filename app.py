
import os, sqlite3, json, hashlib, io, shutil, secrets, unicodedata, fcntl, contextlib, threading
from functools import wraps
from datetime import timedelta, datetime, timezone
from flask import (
    Flask, request, jsonify, send_from_directory, render_template, abort,
    send_file, session, redirect, url_for, flash, get_flashed_messages
)
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
UPLOAD_FOLDER = "/app/uploads"
COVERS_FOLDER = "/app/data/covers"
DB_PATH = "/app/data/bookshelf.db"
SECRET_KEY_PATH = "/app/data/secret_key"
ALLOWED_EXTENSIONS = {"pdf","epub","mobi","cbz","cbr","djvu","fb2","txt","md","doc","docx"}
DEFAULT_COLLECTION_NAME = "Sin coleccion"
SHARE_CLEANUP_DAYS = 7
# Las colecciones son carpetas dentro de uploads/<usuario>/ (ver "Biblioteca
# en disco" mas abajo). Temporal y la papelera tambien son carpetas.
TEMP_COLLECTION_NAME = "Temporal"
TRASH_DIRNAME = ".papelera"
TEMP_DAYS = 30
TRASH_DAYS = 30
LIBRARY_LOCK_PATH = "/app/data/library.lock"

import time as _time
STATIC_VER = str(int(_time.time()))

@app.context_processor
def inject_ver():
    return dict(static_ver=STATIC_VER, session_user=session.get("username"))

def load_or_create_secret_key():
    os.makedirs(os.path.dirname(SECRET_KEY_PATH), exist_ok=True)
    if os.path.exists(SECRET_KEY_PATH):
        with open(SECRET_KEY_PATH) as f:
            key = f.read().strip()
            if key:
                return key
    key = secrets.token_hex(32)
    with open(SECRET_KEY_PATH, "w") as f:
        f.write(key)
    return key

app.secret_key = load_or_create_secret_key()
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=30)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 500 * 1024 * 1024

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def user_upload_dir(user_id):
    d = os.path.join(UPLOAD_FOLDER, str(user_id))
    os.makedirs(d, exist_ok=True)
    return d

def user_covers_dir(user_id):
    d = os.path.join(COVERS_FOLDER, str(user_id))
    os.makedirs(d, exist_ok=True)
    return d

def migrate_collections_table(conn):
    # La tabla original tenia UNIQUE(name) global; con multiusuario el nombre
    # solo debe ser unico por usuario, asi que se recrea con esa constraint.
    cols = [r["name"] for r in conn.execute("PRAGMA table_info(collections)").fetchall()]
    if "user_id" in cols:
        return
    conn.executescript("""
        CREATE TABLE collections_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            user_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, name)
        );
        INSERT INTO collections_new (id, name, created_at) SELECT id, name, created_at FROM collections;
        DROP TABLE collections;
        ALTER TABLE collections_new RENAME TO collections;
    """)
    conn.commit()

# ---------------------------------------------------------------------------
# Biblioteca en disco
# ---------------------------------------------------------------------------
# Las carpetas mandan, como en Obsidian: cada coleccion es una carpeta dentro
# de uploads/<usuario>/ y puede tener subcarpetas. Los archivos sueltos en la
# raiz son "Sin coleccion". La DB es un indice: guarda el id de cada libro (del
# que cuelgan progreso, bookmarks, portada y las copias offline del telefono),
# su ruta relativa (books.relpath, siempre con "/" y en NFC) y metadatos.
#
# Todo lo que se hace desde la app toca el disco y despues el indice. Lo que se
# hace a mano (por SSH) se incorpora con "Releer biblioteca" (rescan_library),
# que reconcilia el disco contra el indice sin perder ids.
#
# Temporal/ es una coleccion mas, pero lo que entra ahi se va a la papelera a
# los TEMP_DAYS dias. .papelera/ guarda lo eliminado (con su ruta original
# adentro) TRASH_DAYS dias y despues se borra.

def nfc(s):
    return unicodedata.normalize("NFC", s)

def clean_name(name):
    """Nombre usable para una carpeta o un archivo. Conserva acentos y
    espacios (secure_filename los destruye: "Programación" -> "Programacion");
    saca separadores, caracteres de control y los que Windows no acepta, y los
    puntos de los bordes (un nombre no puede quedar oculto ni ser "..").
    Devuelve "" si no queda nada."""
    name = nfc(name or "").replace("/", " ").replace("\\", " ")
    name = "".join(ch for ch in name if ch >= " " and ch not in '<>:"|?*\x7f')
    return " ".join(name.split()).strip(" .")[:120]

def join_rel(*parts):
    return "/".join(p for p in parts if p)

def parent_rel(rel):
    return rel.rsplit("/", 1)[0] if "/" in rel else ""

def is_trash_rel(rel):
    return bool(rel) and (rel == TRASH_DIRNAME or rel.startswith(TRASH_DIRNAME + "/"))

def is_temp_rel(rel):
    """Un libro (ruta de archivo) que esta en Temporal o en una subcarpeta."""
    return bool(rel) and rel.startswith(TEMP_COLLECTION_NAME + "/")

def rel_to_abs(uid, rel):
    root = user_upload_dir(uid)
    if not rel:
        return root
    p = os.path.normpath(os.path.join(root, *rel.split("/")))
    if not p.startswith(root + os.sep):
        raise ValueError("Ruta fuera de la biblioteca: " + rel)
    return p

def now_sql():
    # Mismo formato que CURRENT_TIMESTAMP de SQLite (UTC), para comparar.
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

def file_hash(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

def unique_rel(conn, uid, folder_rel, filename, ignore_id=None):
    """Ruta libre para filename dentro de folder_rel: ni en disco ni en el
    indice (una fila puede apuntar a un archivo que ya no esta)."""
    base, ext = os.path.splitext(filename)
    n = 1
    rel = join_rel(folder_rel, filename)
    while True:
        row = conn.execute("SELECT id FROM books WHERE user_id=? AND relpath=?", (uid, rel)).fetchone()
        if not os.path.lexists(rel_to_abs(uid, rel)) and (not row or row["id"] == ignore_id):
            return rel
        rel = join_rel(folder_rel, f"{base} ({n}){ext}")
        n += 1

_lock_state = threading.local()

@contextlib.contextmanager
def library_lock():
    """Serializa todo lo que mueve archivos o reescribe el indice. Gunicorn
    corre 2 workers: sin esto un releer y una subida simultaneos podian
    indexar el mismo archivo dos veces. Reentrante dentro del mismo hilo."""
    depth = getattr(_lock_state, "depth", 0)
    if depth:
        _lock_state.depth = depth + 1
        try:
            yield
        finally:
            _lock_state.depth -= 1
        return
    os.makedirs(os.path.dirname(LIBRARY_LOCK_PATH), exist_ok=True)
    with open(LIBRARY_LOCK_PATH, "a") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        _lock_state.depth = 1
        try:
            yield
        finally:
            _lock_state.depth = 0
            fcntl.flock(f, fcntl.LOCK_UN)

def ensure_folder_collection(conn, uid, folder_rel):
    """Id de la coleccion de esa carpeta, creando la carpeta y las filas que
    falten (tambien las de las carpetas de arriba)."""
    row = conn.execute("SELECT id FROM collections WHERE user_id=? AND path=?", (uid, folder_rel)).fetchone()
    if row:
        return row["id"]
    if not folder_rel:
        cur = conn.execute("INSERT INTO collections (name, user_id, path, parent_id) VALUES (?,?,'',NULL)",
                           (DEFAULT_COLLECTION_NAME, uid))
        return cur.lastrowid
    parent = parent_rel(folder_rel)
    parent_id = ensure_folder_collection(conn, uid, parent) if parent else None
    os.makedirs(rel_to_abs(uid, folder_rel), exist_ok=True)
    cur = conn.execute("INSERT INTO collections (name, user_id, path, parent_id) VALUES (?,?,?,?)",
                       (folder_rel.rsplit("/", 1)[-1], uid, folder_rel, parent_id))
    return cur.lastrowid

def ensure_default_collection(conn, user_id):
    """Deja lista la biblioteca de un usuario: la raiz ("Sin coleccion") y
    Temporal. Devuelve el id de la raiz."""
    root_id = ensure_folder_collection(conn, user_id, "")
    ensure_folder_collection(conn, user_id, TEMP_COLLECTION_NAME)
    return root_id

def place_book(conn, uid, book_id, new_rel):
    """Actualiza en el indice la ubicacion de un libro cuyo archivo YA esta en
    new_rel: ruta, coleccion, y los relojes de Temporal y de la papelera."""
    old = conn.execute("SELECT relpath, temp_since, deleted_at, deleted_from FROM books WHERE id=?", (book_id,)).fetchone()
    old_rel = old["relpath"] or ""
    now = now_sql()
    if is_trash_rel(new_rel):
        col_id, temp_since = None, None
        deleted_at = old["deleted_at"] or now
        # Al eliminar desde la app se conserva de donde vino; si alguien lo
        # metio a mano en .papelera/, la ruta de adentro hace de original.
        deleted_from = old["deleted_from"] or (old_rel if old_rel and not is_trash_rel(old_rel)
                                               else new_rel[len(TRASH_DIRNAME) + 1:])
    else:
        col_id = ensure_folder_collection(conn, uid, parent_rel(new_rel))
        deleted_at = deleted_from = None
        if not is_temp_rel(new_rel):
            temp_since = None
        elif is_temp_rel(old_rel) and old["temp_since"]:
            temp_since = old["temp_since"]  # se movio dentro de Temporal: el reloj sigue
        else:
            temp_since = now
    conn.execute(
        "UPDATE books SET relpath=?, filepath=?, filename=?, collection_id=?, temp_since=?, deleted_at=?, deleted_from=? WHERE id=?",
        (new_rel, rel_to_abs(uid, new_rel), new_rel.rsplit("/", 1)[-1], col_id, temp_since, deleted_at, deleted_from, book_id))

def move_book_file(conn, uid, book, folder_rel, filename=None):
    """Mueve el archivo de un libro a otra carpeta (o le cambia el nombre) y
    actualiza el indice. Devuelve la ruta nueva."""
    src = rel_to_abs(uid, book["relpath"])
    new_rel = unique_rel(conn, uid, folder_rel, filename or book["filename"], ignore_id=book["id"])
    if new_rel != book["relpath"]:
        dst = rel_to_abs(uid, new_rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        os.rename(src, dst)
    place_book(conn, uid, book["id"], new_rel)
    return new_rel

def insert_book(conn, uid, rel, title=None, **meta):
    """Indexa un archivo que ya esta en rel. Portada y paginas quedan
    pendientes (has_cover=-1) salvo que vengan en meta: se generan la primera
    vez que se pide la portada (ensure_book_meta)."""
    filename = rel.rsplit("/", 1)[-1]
    path = rel_to_abs(uid, rel)
    st = os.stat(path)
    if title is None:
        title = os.path.splitext(filename)[0].replace("_", " ").replace("-", " ")
    cur = conn.execute(
        "INSERT INTO books (title, filename, filepath, format, size, file_mtime, content_hash, cover_color, "
        "has_cover, page_count, view_mode, user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        (title, filename, path, filename.rsplit(".", 1)[1].upper(), st.st_size, int(st.st_mtime),
         meta.get("content_hash") or file_hash(path), meta.get("cover_color") or get_cover_color(filename),
         meta.get("has_cover", -1), meta.get("page_count", 0), meta.get("view_mode", "scroll"), uid))
    place_book(conn, uid, cur.lastrowid, rel)
    return cur.lastrowid

def count_pages(path, fmt):
    try:
        if fmt == "PDF":
            import fitz
            with fitz.open(path) as doc:
                return doc.page_count
        if fmt == "EPUB":
            import zipfile
            with zipfile.ZipFile(path) as z:
                return max(len([n for n in z.namelist() if n.endswith((".html", ".xhtml", ".htm"))]), 1)
    except Exception:
        pass
    return 0

def ensure_book_meta(conn, book):
    """Genera portada y cantidad de paginas si estaban pendientes."""
    if book["has_cover"] != -1:
        return
    path = rel_to_abs(book["user_id"], book["relpath"])
    has_cover = 1 if extract_cover(path, book["id"], book["format"], book["user_id"]) else 0
    conn.execute("UPDATE books SET has_cover=?, page_count=? WHERE id=?",
                 (has_cover, count_pages(path, book["format"]), book["id"]))
    conn.commit()

def drop_cover(uid, book_id):
    try: os.remove(os.path.join(user_covers_dir(uid), str(book_id) + ".jpg"))
    except OSError: pass

def purge_book(conn, uid, book):
    """Borrado definitivo: archivo, portada y todo lo que cuelga del id."""
    try: os.remove(rel_to_abs(uid, book["relpath"]))
    except (OSError, ValueError): pass
    drop_cover(uid, book["id"])
    for table in ("progress", "bookmarks", "highlights"):
        conn.execute(f"DELETE FROM {table} WHERE book_id=?", (book["id"],))
    conn.execute("DELETE FROM book_shares WHERE book_id=? AND status='pending'", (book["id"],))
    conn.execute("DELETE FROM books WHERE id=?", (book["id"],))

def trash_book(conn, uid, book):
    """Manda un libro a la papelera, conservando su ruta adentro para poder
    restaurarlo donde estaba. Progreso y bookmarks se quedan (vuelven con el)."""
    move_book_file(conn, uid, book, join_rel(TRASH_DIRNAME, parent_rel(book["relpath"])))
    # Igual que antes al borrar: un envio pendiente no puede aceptarse si el
    # libro ya no esta en la biblioteca de quien lo mando.
    conn.execute("DELETE FROM book_shares WHERE book_id=? AND status='pending'", (book["id"],))

def restore_book(conn, uid, book):
    """Vuelve a la carpeta original; si ya no existe, se recrea."""
    dest = book["deleted_from"] or book["filename"]
    return move_book_file(conn, uid, book, parent_rel(dest), dest.rsplit("/", 1)[-1])

def sweep_library(conn, uid):
    """Vence la papelera y Temporal. Corre al pedir la biblioteca: no hay
    cron, y con 2 workers un hilo de fondo correria duplicado."""
    with library_lock():
        for b in conn.execute("SELECT * FROM books WHERE user_id=? AND deleted_at IS NOT NULL "
                              "AND deleted_at < datetime('now', ?)", (uid, f"-{TRASH_DAYS} days")).fetchall():
            purge_book(conn, uid, b)
        for b in conn.execute("SELECT * FROM books WHERE user_id=? AND deleted_at IS NULL AND temp_since IS NOT NULL "
                              "AND temp_since < datetime('now', ?)", (uid, f"-{TEMP_DAYS} days")).fetchall():
            try: trash_book(conn, uid, b)
            except OSError as e: print("No se pudo mandar a la papelera", b["relpath"], e)
        conn.commit()

# ── Releer la biblioteca ──────────────────────────────────────────────────────
class ScanAborted(Exception):
    pass

IGNORED_FILES = {"thumbs.db", "desktop.ini"}
PARTIAL_SUFFIXES = (".part", ".crdownload", ".download", ".tmp", ".swp")

def _normalize_name(dirpath, name):
    """Nombres en NFC tambien en el disco: un Mac escribe NFD, y la ruta
    guardada en el indice no coincidiria byte a byte con la del archivo."""
    fixed = nfc(name)
    if fixed != name and not os.path.lexists(os.path.join(dirpath, fixed)):
        try:
            os.rename(os.path.join(dirpath, name), os.path.join(dirpath, fixed))
            return fixed
        except OSError:
            return None
    return fixed if fixed == name else None

def walk_library(uid):
    """Archivos legibles ({relpath: (size, mtime)}) y carpetas de la
    biblioteca. No sigue symlinks (uno a /etc no puede terminar servido) e
    ignora lo oculto, salvo la papelera, y los archivos a medio copiar."""
    root = user_upload_dir(uid)
    files, folders = {}, set()
    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = os.path.relpath(dirpath, root).replace(os.sep, "/")
        rel_dir = "" if rel_dir == "." else rel_dir
        keep = []
        for d in dirnames:
            if os.path.islink(os.path.join(dirpath, d)):
                continue
            if d.startswith(".") and not (rel_dir == "" and d == TRASH_DIRNAME):
                continue
            d = _normalize_name(dirpath, d)
            if d:
                keep.append(d)
        dirnames[:] = keep
        if rel_dir and not is_trash_rel(rel_dir):
            folders.add(rel_dir)
        for fn in filenames:
            low = fn.lower()
            if (fn.startswith(".") or fn.startswith("~$") or low in IGNORED_FILES
                    or low.endswith(PARTIAL_SUFFIXES) or not allowed_file(fn)
                    or os.path.islink(os.path.join(dirpath, fn))):
                continue
            fn = _normalize_name(dirpath, fn)
            if not fn:
                continue
            try:
                fn.encode("utf-8")
                st = os.stat(os.path.join(dirpath, fn))
            except (UnicodeEncodeError, OSError):
                continue
            files[join_rel(rel_dir, fn)] = (st.st_size, int(st.st_mtime))
    return files, folders

def rescan_library(conn, uid):
    """Reconcilia el disco con el indice. Un libro conserva su id si sigue en
    la misma ruta o si aparece en otra con el mismo contenido (se movio o se
    renombro a mano): asi no pierde progreso, bookmarks ni la copia offline.
    Aborta sin tocar nada si desapareceria mas de la mitad de la biblioteca
    (tipicamente: la carpeta no esta montada)."""
    with library_lock():
        root = user_upload_dir(uid)
        os.makedirs(rel_to_abs(uid, TEMP_COLLECTION_NAME), exist_ok=True)
        files, folders = walk_library(uid)
        rows = conn.execute("SELECT * FROM books WHERE user_id=?", (uid,)).fetchall()
        by_rel = {r["relpath"]: r for r in rows}

        changed = [r for r in rows if r["relpath"] in files
                   and files[r["relpath"]] != (r["size"], r["file_mtime"])]
        missing = [r for r in rows if r["relpath"] not in files]
        new = sorted(rel for rel in files if rel not in by_rel)

        by_hash = {}
        for r in missing:
            if r["content_hash"]:
                by_hash.setdefault(r["content_hash"], []).append(r)
        moved, added = [], []
        for rel in new:
            h = file_hash(rel_to_abs(uid, rel))
            cands = by_hash.get(h)
            if cands:
                moved.append((cands.pop(0), rel))
            else:
                added.append((rel, h))
        moved_ids = {r["id"] for r, _ in moved}
        gone = [r for r in missing if r["id"] not in moved_ids]

        if len(rows) >= 4 and len(gone) > len(rows) / 2:
            raise ScanAborted(
                f"Desaparecerian {len(gone)} de {len(rows)} libros: no se toco nada. "
                f"Revisa que la carpeta {root} este en su lugar.")

        for r in changed:
            size, mtime = files[r["relpath"]]
            conn.execute("UPDATE books SET size=?, file_mtime=?, content_hash=?, has_cover=-1, page_count=0 WHERE id=?",
                         (size, mtime, file_hash(rel_to_abs(uid, r["relpath"])), r["id"]))
            drop_cover(uid, r["id"])
        for r, rel in moved:
            size, mtime = files[rel]
            conn.execute("UPDATE books SET size=?, file_mtime=? WHERE id=?", (size, mtime, r["id"]))
            place_book(conn, uid, r["id"], rel)
        for rel, h in added:
            insert_book(conn, uid, rel, content_hash=h)
        for r in gone:
            purge_book(conn, uid, r)

        for f in sorted(folders):
            ensure_folder_collection(conn, uid, f)
        stale = conn.execute("SELECT id, path FROM collections WHERE user_id=? AND path NOT IN ('', ?)",
                             (uid, TEMP_COLLECTION_NAME)).fetchall()
        for c in stale:
            if c["path"] not in folders:
                conn.execute("DELETE FROM collections WHERE id=?", (c["id"],))
        ensure_default_collection(conn, uid)
        conn.commit()
        return {"nuevos": len(added), "movidos": len(moved), "actualizados": len(changed), "quitados": len(gone)}

# ── Migracion a carpetas (v1.14) ──────────────────────────────────────────────
def migrate_collections_to_folders(conn):
    """Hasta v1.13 las colecciones eran solo filas (nombre unico por usuario)
    y los archivos estaban todos sueltos en uploads/<usuario>/. Se agrega la
    ruta de cada coleccion y se rehace la tabla, porque ahora dos subcarpetas
    distintas pueden llamarse igual."""
    cols = [r["name"] for r in conn.execute("PRAGMA table_info(collections)").fetchall()]
    if "path" in cols:
        return
    try:
        shutil.copy2(DB_PATH, DB_PATH + ".pre-v1.14")
    except OSError as e:
        print("No se pudo copiar la DB antes de migrar:", e)
    conn.execute("""
        CREATE TABLE collections_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            user_id INTEGER,
            path TEXT NOT NULL DEFAULT '',
            parent_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, path)
        )""")
    rows = conn.execute("SELECT * FROM collections ORDER BY id").fetchall()
    names = {}
    for r in rows:
        names.setdefault(r["user_id"], set()).add(r["name"])
    used = {}
    for r in rows:
        uid = r["user_id"]
        taken = used.setdefault(uid, set())
        if r["name"] == DEFAULT_COLLECTION_NAME:
            path = ""
        else:
            name = r["name"]
            # Pedido del usuario: su coleccion "Temporales" pasa a ser la
            # coleccion temporal (si no tenia ya una "Temporal").
            if name == "Temporales" and TEMP_COLLECTION_NAME not in names[uid]:
                name = TEMP_COLLECTION_NAME
            path = clean_name(name) or f"Coleccion {r['id']}"
            while path.casefold() in taken:
                path = f"{path} ({r['id']})"
        if path.casefold() in taken:
            continue  # una segunda "Sin coleccion": sus libros caen en la raiz
        taken.add(path.casefold())
        conn.execute("INSERT INTO collections_new (id, name, user_id, path, parent_id, created_at) VALUES (?,?,?,?,NULL,?)",
                     (r["id"], path or DEFAULT_COLLECTION_NAME, uid, path, r["created_at"]))
        # La carpeta se crea aunque la coleccion este vacia: si no, el releer
        # no la encuentra en disco y la da de baja.
        if path and uid is not None:
            os.makedirs(rel_to_abs(uid, path), exist_ok=True)
    conn.execute("DROP TABLE collections")
    conn.execute("ALTER TABLE collections_new RENAME TO collections")
    conn.commit()

def migrate_books_to_folders(conn):
    """Mueve cada archivo a la carpeta de su coleccion. Libro por libro y con
    commit en cada uno: si se corta a la mitad, el proximo arranque sigue
    desde donde quedo (los que faltan tienen relpath NULL)."""
    rows = conn.execute("SELECT * FROM books WHERE relpath IS NULL ORDER BY id").fetchall()
    for b in rows:
        uid = b["user_id"]
        col = conn.execute("SELECT path FROM collections WHERE id=? AND user_id=?", (b["collection_id"], uid)).fetchone()
        folder = col["path"] if col else ""
        # El layout viejo era plano: el archivo se busca en la carpeta del
        # usuario por su nombre, sin confiar en la ruta absoluta guardada (y
        # sin tocar nunca nada fuera de esa carpeta).
        name = os.path.basename(b["filepath"] or "") or b["filename"]
        src = rel_to_abs(uid, name)
        target = join_rel(folder, name)
        if os.path.isfile(src):
            st = os.stat(src)
            conn.execute("UPDATE books SET content_hash=?, size=?, file_mtime=? WHERE id=?",
                         (file_hash(src), st.st_size, int(st.st_mtime), b["id"]))
            if target == name:
                rel = name  # "Sin coleccion": ya esta donde tiene que estar
            else:
                rel = unique_rel(conn, uid, folder, name)
                dst = rel_to_abs(uid, rel)
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                os.rename(src, dst)
        elif os.path.exists(rel_to_abs(uid, target)):
            # Un arranque anterior lo movio y se corto antes del commit.
            rel = target
            path = rel_to_abs(uid, rel)
            st = os.stat(path)
            conn.execute("UPDATE books SET content_hash=?, size=?, file_mtime=? WHERE id=?",
                         (file_hash(path), st.st_size, int(st.st_mtime), b["id"]))
        else:
            # El archivo ya no existia: queda indexado donde deberia estar y
            # el releer lo saca (con su freno si fueran demasiados).
            rel = target
        place_book(conn, uid, b["id"], rel)
        conn.commit()

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    os.makedirs(COVERS_FOLDER, exist_ok=True)
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            is_admin INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS collections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            user_id INTEGER,
            path TEXT NOT NULL DEFAULT '',
            parent_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, path)
        );
        CREATE TABLE IF NOT EXISTS books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            filename TEXT NOT NULL,
            filepath TEXT NOT NULL,
            format TEXT NOT NULL,
            size INTEGER,
            collection_id INTEGER,
            cover_color TEXT DEFAULT "#6366f1",
            has_cover INTEGER DEFAULT 0,
            page_count INTEGER DEFAULT 0,
            view_mode TEXT DEFAULT "scroll",
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (collection_id) REFERENCES collections(id)
        );
        CREATE TABLE IF NOT EXISTS progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL,
            device_id TEXT NOT NULL,
            progress_data TEXT DEFAULT "{}",
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(book_id, device_id)
        );
        CREATE TABLE IF NOT EXISTS bookmarks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL,
            device_id TEXT NOT NULL,
            label TEXT,
            position TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS highlights (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL,
            device_id TEXT NOT NULL,
            page INTEGER,
            text TEXT,
            color TEXT DEFAULT "#fbbf24",
            cfi TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS book_shares (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL,
            from_user_id INTEGER NOT NULL,
            to_user_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT "pending",
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            resolved_at TIMESTAMP
        );
    """)
    conn.commit()

    migrate_collections_table(conn)

    # Migraciones automaticas — nunca rompen si la columna ya existe
    for migration in [
        'ALTER TABLE books ADD COLUMN has_cover INTEGER DEFAULT 0',
        'ALTER TABLE books ADD COLUMN page_count INTEGER DEFAULT 0',
        'ALTER TABLE books ADD COLUMN view_mode TEXT DEFAULT "scroll"',
        'ALTER TABLE books ADD COLUMN user_id INTEGER',
        'ALTER TABLE book_shares ADD COLUMN seen INTEGER DEFAULT 0',
        # v1.14: biblioteca en carpetas
        'ALTER TABLE books ADD COLUMN relpath TEXT',
        'ALTER TABLE books ADD COLUMN content_hash TEXT',
        'ALTER TABLE books ADD COLUMN file_mtime INTEGER',
        'ALTER TABLE books ADD COLUMN temp_since TIMESTAMP',
        'ALTER TABLE books ADD COLUMN deleted_at TIMESTAMP',
        'ALTER TABLE books ADD COLUMN deleted_from TEXT',
    ]:
        try:
            conn.execute(migration)
            conn.commit()
        except:
            pass

    # "visto" (cerrar sin aceptar) ya no es un estado terminal, es solo un
    # flag: filas viejas de una version anterior que quedaron en un estado
    # que ya no existe vuelven a quedar pendientes (y marcadas como vistas),
    # para poder aceptarlas dentro de la ventana de 7 dias.
    conn.execute("UPDATE book_shares SET status='pending', seen=1 WHERE status IN ('dismissed', 'declined')")
    conn.commit()

    # Bootstrap: primera vez que corre el proyecto, se crea la cuenta de
    # administracion. El resto de los usuarios se crean desde /admin o manage.py.
    user_count = conn.execute("SELECT COUNT(*) as c FROM users").fetchone()["c"]
    if user_count == 0:
        conn.execute("INSERT INTO users (username, password_hash, is_admin) VALUES (?,?,1)",
                     ("admin", generate_password_hash("admin123")))
        conn.commit()

    with library_lock():
        migrate_collections_to_folders(conn)
        migrate_books_to_folders(conn)
    try:
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_books_relpath ON books(user_id, relpath)")
        conn.commit()
    except sqlite3.IntegrityError as e:
        print("Indice de rutas no creado (rutas repetidas):", e)

    # Al arrancar se relee la biblioteca de cada usuario: incorpora lo que se
    # haya dejado a mano mientras la app estaba apagada.
    for u in conn.execute("SELECT id FROM users WHERE is_admin=0").fetchall():
        ensure_default_collection(conn, u["id"])
        conn.commit()
        try:
            print("Biblioteca", u["id"], rescan_library(conn, u["id"]))
        except ScanAborted as e:
            print("Releer biblioteca", u["id"], "abortado:", e)
        sweep_library(conn, u["id"])

    conn.close()

def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if "user_id" not in session:
            if request.path.startswith("/api/"):
                return jsonify({"error": "No autenticado"}), 401
            return redirect(url_for("login_page"))
        return view(*args, **kwargs)
    return wrapped

def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if "user_id" not in session:
            return redirect(url_for("login_page"))
        if not session.get("is_admin"):
            abort(403)
        return view(*args, **kwargs)
    return wrapped

def current_user_id():
    return session["user_id"]

def get_owned_book(conn, book_id, include_trash=False):
    # Lo que esta en la papelera no existe para el resto de la app (lector,
    # progreso, compartir): solo para la papelera y su portada.
    trash = "" if include_trash else " AND deleted_at IS NULL"
    return conn.execute("SELECT * FROM books WHERE id=? AND user_id=?" + trash, (book_id, current_user_id())).fetchone()

def get_owned_share(conn, share_id):
    return conn.execute("SELECT * FROM book_shares WHERE id=? AND to_user_id=?", (share_id, current_user_id())).fetchone()

def sweep_expired_shares(conn):
    # Toda notificacion dura SHARE_CLEANUP_DAYS desde que se recibio, la haya
    # visto/aceptado o no — "visto" es solo un flag, no extiende ni acorta esto.
    conn.execute(
        "DELETE FROM book_shares WHERE created_at < datetime('now', ?)",
        (f"-{SHARE_CLEANUP_DAYS} days",)
    )
    conn.commit()

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def get_cover_color(filename):
    colors = ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444","#14b8a6"]
    return colors[int(hashlib.md5(filename.encode()).hexdigest(), 16) % len(colors)]

def extract_cover(filepath, book_id, fmt, user_id):
    cover_path = os.path.join(user_covers_dir(user_id), str(book_id) + ".jpg")
    try:
        if fmt == "PDF":
            import fitz
            doc = fitz.open(filepath)
            page = doc[0]
            mat = fitz.Matrix(2, 2)
            pix = page.get_pixmap(matrix=mat)
            pix.save(cover_path)
            doc.close()
            return True
        elif fmt == "EPUB":
            import zipfile
            from PIL import Image
            with zipfile.ZipFile(filepath, "r") as z:
                names = z.namelist()
                cover_candidates = [n for n in names if "cover" in n.lower() and any(n.lower().endswith(e) for e in [".jpg",".jpeg",".png",".gif"])]
                if not cover_candidates:
                    cover_candidates = [n for n in names if any(n.lower().endswith(e) for e in [".jpg",".jpeg",".png"]) and "image" in n.lower()]
                if cover_candidates:
                    data = z.read(cover_candidates[0])
                    img = Image.open(io.BytesIO(data))
                    img = img.convert("RGB")
                    img.save(cover_path, "JPEG", quality=85)
                    return True
    except Exception as e:
        print("Cover extraction error:", e)
    return False

# ---------------------------------------------------------------------------
# Autenticacion
# ---------------------------------------------------------------------------

@app.route("/login", methods=["GET", "POST"])
def login_page():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        conn = get_db()
        user = conn.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
        conn.close()
        if user and check_password_hash(user["password_hash"], password):
            session.clear()
            session.permanent = True
            session["user_id"] = user["id"]
            session["username"] = user["username"]
            session["is_admin"] = bool(user["is_admin"])
            return redirect(url_for("admin_panel") if user["is_admin"] else url_for("index"))
        flash("Usuario o contraseña incorrectos")
        return redirect(url_for("login_page"))

    if "user_id" in session:
        return redirect(url_for("admin_panel") if session.get("is_admin") else url_for("index"))
    errors = get_flashed_messages()
    return render_template("login.html", error=errors[0] if errors else None)

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login_page"))

# ---------------------------------------------------------------------------
# Panel de administracion (gestion de usuarios, sin biblioteca propia)
# ---------------------------------------------------------------------------

@app.route("/admin")
@admin_required
def admin_panel():
    conn = get_db()
    users = conn.execute("""
        SELECT u.id, u.username, u.is_admin, u.created_at, COUNT(b.id) as book_count
        FROM users u LEFT JOIN books b ON b.user_id = u.id
        GROUP BY u.id ORDER BY u.is_admin DESC, u.username
    """).fetchall()
    conn.close()
    errors = get_flashed_messages()
    return render_template("admin.html", users=users, error=errors[0] if errors else None)

@app.route("/admin/users", methods=["POST"])
@admin_required
def admin_create_user():
    username = request.form.get("username", "").strip()
    password = request.form.get("password", "")
    if not username or not password:
        flash("Usuario y contraseña son requeridos")
        return redirect(url_for("admin_panel"))
    conn = get_db()
    try:
        conn.execute("INSERT INTO users (username, password_hash, is_admin) VALUES (?,?,0)",
                     (username, generate_password_hash(password)))
        conn.commit()
        new_user = conn.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()
        ensure_default_collection(conn, new_user["id"])
        conn.commit()
    except sqlite3.IntegrityError:
        flash("Ese usuario ya existe")
    finally:
        conn.close()
    return redirect(url_for("admin_panel"))

@app.route("/admin/users/<int:user_id>/reset-password", methods=["POST"])
@admin_required
def admin_reset_password(user_id):
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    if not user:
        conn.close()
        abort(404)
    password = request.form.get("password", "")
    if not password:
        conn.close()
        flash("La contraseña no puede estar vacía")
        return redirect(url_for("admin_panel"))
    conn.execute("UPDATE users SET password_hash=? WHERE id=?", (generate_password_hash(password), user_id))
    conn.commit()
    conn.close()
    flash(f"Contraseña de '{user['username']}' actualizada")
    return redirect(url_for("admin_panel"))

@app.route("/admin/users/<int:user_id>/delete", methods=["POST"])
@admin_required
def admin_delete_user(user_id):
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    if not user:
        conn.close()
        abort(404)
    if user["is_admin"]:
        conn.close()
        flash("No se puede borrar la cuenta de administrador")
        return redirect(url_for("admin_panel"))

    books = conn.execute("SELECT id, filepath FROM books WHERE user_id=?", (user_id,)).fetchall()
    for b in books:
        try: os.remove(b["filepath"])
        except: pass
        try: os.remove(os.path.join(user_covers_dir(user_id), str(b["id"]) + ".jpg"))
        except: pass

    book_ids = [b["id"] for b in books]
    if book_ids:
        placeholders = ",".join("?" * len(book_ids))
        conn.execute(f"DELETE FROM progress WHERE book_id IN ({placeholders})", book_ids)
        conn.execute(f"DELETE FROM bookmarks WHERE book_id IN ({placeholders})", book_ids)
        conn.execute(f"DELETE FROM highlights WHERE book_id IN ({placeholders})", book_ids)

    conn.execute("DELETE FROM books WHERE user_id=?", (user_id,))
    conn.execute("DELETE FROM collections WHERE user_id=?", (user_id,))
    conn.execute("DELETE FROM book_shares WHERE from_user_id=? OR to_user_id=?", (user_id, user_id))
    conn.execute("DELETE FROM users WHERE id=?", (user_id,))
    conn.commit()
    conn.close()

    shutil.rmtree(os.path.join(UPLOAD_FOLDER, str(user_id)), ignore_errors=True)
    shutil.rmtree(os.path.join(COVERS_FOLDER, str(user_id)), ignore_errors=True)
    return redirect(url_for("admin_panel"))

# ---------------------------------------------------------------------------
# Biblioteca (por usuario)
# ---------------------------------------------------------------------------

@app.route("/sw.js")
def service_worker():
    # El alcance de un service worker es la carpeta donde vive el script: desde
    # /static/js/ solo podria controlar /static/js/. Servido desde la raiz
    # controla toda la app (biblioteca y lector), que es lo que necesita el
    # modo sin conexion. Sin login: es solo el script, no expone datos.
    return send_from_directory(
        os.path.join(app.root_path, "static", "js"), "sw.js",
        mimetype="application/javascript"
    )

@app.route("/")
@login_required
def index():
    if session.get("is_admin"):
        return redirect(url_for("admin_panel"))
    return render_template("index.html")

@app.route("/read/<int:book_id>")
@login_required
def reader(book_id):
    if session.get("is_admin"):
        return redirect(url_for("admin_panel"))
    conn = get_db()
    book = get_owned_book(conn, book_id)
    conn.close()
    if not book: abort(404)
    return render_template("reader.html", book_id=book_id)

def owned_collection(conn, col_id):
    return conn.execute("SELECT * FROM collections WHERE id=? AND user_id=?", (col_id, current_user_id())).fetchone()

def collection_error(conn, parent_path, name, except_id=None):
    """Mensaje de error si name no sirve como carpeta dentro de parent_path."""
    if not name:
        return "Nombre invalido"
    # Sin distinguir mayusculas: desde Windows o un Mac "Redes" y "redes"
    # serian la misma carpeta.
    for c in conn.execute("SELECT id, path FROM collections WHERE user_id=?", (current_user_id(),)).fetchall():
        if c["id"] != except_id and c["path"] and parent_rel(c["path"]) == parent_path \
                and c["path"].rsplit("/", 1)[-1].casefold() == name.casefold():
            return "Ya existe una coleccion con ese nombre ahi"
    if os.path.lexists(rel_to_abs(current_user_id(), join_rel(parent_path, name))) and except_id is None:
        return "Ya hay un archivo o carpeta con ese nombre ahi"
    return None

@app.route("/api/collections", methods=["GET"])
@login_required
def get_collections():
    uid = current_user_id()
    conn = get_db()
    with library_lock():
        ensure_default_collection(conn, uid)
        conn.commit()
    sweep_library(conn, uid)
    cols = [dict(r) for r in conn.execute(
        "SELECT id, name, path, parent_id, created_at FROM collections WHERE user_id=?", (uid,)).fetchall()]
    direct = dict(conn.execute(
        "SELECT collection_id, COUNT(*) FROM books WHERE user_id=? AND deleted_at IS NULL GROUP BY collection_id",
        (uid,)).fetchall())
    trash_count = conn.execute("SELECT COUNT(*) FROM books WHERE user_id=? AND deleted_at IS NOT NULL", (uid,)).fetchone()[0]
    conn.close()
    for c in cols:
        p = c["path"]
        c["is_root"] = p == ""
        c["is_temp"] = p == TEMP_COLLECTION_NAME
        c["direct_count"] = direct.get(c["id"], 0)
        # book_count es recursivo: una coleccion cuenta lo de sus subcarpetas.
        c["book_count"] = c["direct_count"] if not p else sum(
            direct.get(d["id"], 0) for d in cols if d["path"] == p or d["path"].startswith(p + "/"))
        c["trash_count"] = trash_count
    cols.sort(key=lambda c: c["path"].casefold())
    return jsonify(cols)

@app.route("/api/collections", methods=["POST"])
@login_required
def create_collection():
    data = request.json or {}
    name = clean_name(data.get("name", ""))
    uid = current_user_id()
    conn = get_db()
    parent_path = ""
    if data.get("parent_id"):
        parent = owned_collection(conn, data["parent_id"])
        if not parent:
            conn.close(); return jsonify({"error": "La coleccion de arriba no existe"}), 404
        parent_path = parent["path"]
    with library_lock():
        err = collection_error(conn, parent_path, name)
        if err:
            conn.close(); return jsonify({"error": err}), 409 if name else 400
        col_id = ensure_folder_collection(conn, uid, join_rel(parent_path, name))
        conn.commit()
        col = conn.execute("SELECT * FROM collections WHERE id=?", (col_id,)).fetchone()
    conn.close()
    return jsonify(dict(col)), 201

@app.route("/api/collections/<int:col_id>", methods=["DELETE"])
@login_required
def delete_collection(col_id):
    # Solo carpetas vacias: lo que tiene libros se vacia primero (o a mano).
    uid = current_user_id()
    conn = get_db()
    col = owned_collection(conn, col_id)
    if not col:
        conn.close(); abort(404)
    if col["path"] in ("", TEMP_COLLECTION_NAME):
        conn.close(); return jsonify({"error": "No se puede borrar"}), 400
    with library_lock():
        try:
            os.rmdir(rel_to_abs(uid, col["path"]))
        except FileNotFoundError:
            pass
        except OSError:
            conn.close(); return jsonify({"error": "La coleccion no esta vacia"}), 409
        conn.execute("DELETE FROM collections WHERE id=?", (col_id,))
        conn.commit()
    conn.close()
    return jsonify({"ok": True})

@app.route("/api/collections/<int:col_id>", methods=["PATCH"])
@login_required
def rename_collection(col_id):
    """Renombrar = renombrar la carpeta. Arrastra subcarpetas, libros, y la
    ruta original de lo que esta en la papelera (asi restaura al lugar nuevo)."""
    data = request.json or {}
    name = clean_name(data.get("name", ""))
    uid = current_user_id()
    conn = get_db()
    col = owned_collection(conn, col_id)
    if not col:
        conn.close(); abort(404)
    if col["path"] in ("", TEMP_COLLECTION_NAME):
        conn.close(); return jsonify({"error": "Esta coleccion no se puede renombrar"}), 400
    old = col["path"]
    new = join_rel(parent_rel(old), name)
    with library_lock():
        err = collection_error(conn, parent_rel(old), name, except_id=col_id)
        if err:
            conn.close(); return jsonify({"error": err}), 409 if name else 400
        if new != old:
            if os.path.lexists(rel_to_abs(uid, new)) and new.casefold() != old.casefold():
                conn.close(); return jsonify({"error": "Ya hay un archivo o carpeta con ese nombre ahi"}), 409
            os.rename(rel_to_abs(uid, old), rel_to_abs(uid, new))
            moved = lambda p: new + p[len(old):] if p == old or p.startswith(old + "/") else p
            for c in conn.execute("SELECT id, path FROM collections WHERE user_id=?", (uid,)).fetchall():
                if moved(c["path"]) != c["path"]:
                    conn.execute("UPDATE collections SET path=? WHERE id=?", (moved(c["path"]), c["id"]))
            conn.execute("UPDATE collections SET name=? WHERE id=?", (name, col_id))
            for b in conn.execute("SELECT id, relpath, deleted_from FROM books WHERE user_id=?", (uid,)).fetchall():
                rel, frm = moved(b["relpath"] or ""), moved(b["deleted_from"] or "")
                if rel != (b["relpath"] or "") or frm != (b["deleted_from"] or ""):
                    conn.execute("UPDATE books SET relpath=?, filepath=?, deleted_from=? WHERE id=?",
                                 (rel, rel_to_abs(uid, rel), frm or None, b["id"]))
            conn.commit()
        col = conn.execute("SELECT * FROM collections WHERE id=?", (col_id,)).fetchone()
    conn.close()
    return jsonify(dict(col))

# ── Progreso entre dispositivos ───────────────────────────────────────────────
# Cada dispositivo guarda su propia fila (el progreso es local primero, ver
# progress.js), pero lo que se muestra es el mejor de todos: el ultimo lugar
# donde se leyo, en cualquier dispositivo. Abrir un libro guarda la posicion
# en la que arranca (pagina 1, 0%): eso no cuenta como lectura, asi un
# dispositivo nuevo no tapa lo leido en otro.
def progress_is_start(d):
    try:
        if d.get("page") is not None:
            return int(d.get("page") or 0) <= 1
        if d.get("percentage") is not None:
            return float(d.get("percentage") or 0) <= 0
    except (TypeError, ValueError):
        pass
    return not d.get("cfi")

def best_progress(rows):
    """De las filas (progress_data, updated_at) de un libro, la que se
    muestra: lectura real antes que "abierto sin avanzar", y despues la mas
    reciente. Devuelve el dict con ts y updated_at, o None."""
    best = None
    for r in rows:
        try:
            d = json.loads(r["progress_data"] or "{}")
        except ValueError:
            continue
        if not isinstance(d, dict):
            continue
        ts = int(d.get("ts") or 0)
        if not ts and r["updated_at"]:
            ts = int(datetime.strptime(r["updated_at"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc).timestamp() * 1000)
        key = (0 if progress_is_start(d) else 1, ts)
        if best is None or key > best[0]:
            best = (key, dict(d, ts=ts, updated_at=r["updated_at"]))
    return best[1] if best else None

def attach_progress(conn, books):
    """Agrega a cada libro su mejor progreso entre dispositivos: las tarjetas
    de la biblioteca lo muestran sin un pedido por libro."""
    ids = [b["id"] for b in books]
    rows = {}
    for i in range(0, len(ids), 500):
        chunk = ids[i:i + 500]
        for r in conn.execute(f"SELECT book_id, progress_data, updated_at FROM progress WHERE book_id IN ({','.join('?' * len(chunk))})", chunk):
            rows.setdefault(r["book_id"], []).append(r)
    for b in books:
        b["progress"] = best_progress(rows.get(b["id"], []))
    return books

def book_json(r):
    b = dict(r)
    rel = b.get("relpath") or ""
    # La biblioteca general agrupa por coleccion de primer nivel.
    b["group_name"] = rel.split("/", 1)[0] if "/" in rel else DEFAULT_COLLECTION_NAME
    return b

BOOK_COLUMNS = ("b.*, c.name as collection_name, c.path as collection_path, "
                f"CASE WHEN b.temp_since IS NOT NULL THEN datetime(b.temp_since, '+{TEMP_DAYS} days') END as temp_expires_at")

@app.route("/api/books", methods=["GET"])
@login_required
def get_books():
    """Con collection_id: esa coleccion y todas sus subcarpetas (la raiz,
    "Sin coleccion", solo lo suelto). Sin parametro: toda la biblioteca."""
    uid = current_user_id()
    col_id = request.args.get("collection_id")
    conn = get_db()
    sweep_library(conn, uid)
    base = f"SELECT {BOOK_COLUMNS} FROM books b LEFT JOIN collections c ON c.id=b.collection_id WHERE b.user_id=? AND b.deleted_at IS NULL"
    if col_id:
        col = owned_collection(conn, col_id)
        if not col:
            conn.close(); return jsonify([])
        if col["path"]:
            rows = conn.execute(base + " AND substr(b.relpath, 1, ?) = ?",
                                (uid, len(col["path"]) + 1, col["path"] + "/")).fetchall()
        else:
            rows = conn.execute(base + " AND b.collection_id=?", (uid, col["id"])).fetchall()
    else:
        rows = conn.execute(base, (uid,)).fetchall()
    books = attach_progress(conn, [book_json(r) for r in rows])
    conn.close()
    books.sort(key=lambda b: (b["group_name"].casefold(), b["title"].casefold()))
    return jsonify(books)

@app.route("/api/books/upload", methods=["POST"])
@login_required
def upload_book():
    if "file" not in request.files: return jsonify({"error":"No file"}), 400
    file = request.files["file"]
    uid = current_user_id()
    # Algunos navegadores mandan la ruta entera; solo interesa el nombre.
    filename = clean_name((file.filename or "").replace("\\", "/").rsplit("/", 1)[-1])
    if not filename or not allowed_file(filename):
        return jsonify({"error":"Formato no soportado"}), 400
    conn = get_db()
    col = owned_collection(conn, request.form.get("collection_id")) if request.form.get("collection_id") else None
    folder = col["path"] if col else ""
    with library_lock():
        ensure_default_collection(conn, uid)
        rel = unique_rel(conn, uid, folder, filename)
        path = rel_to_abs(uid, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        file.save(path)
        book_id = insert_book(conn, uid, rel)
        conn.commit()
    ensure_book_meta(conn, conn.execute("SELECT * FROM books WHERE id=?", (book_id,)).fetchone())
    book = conn.execute("SELECT * FROM books WHERE id=?", (book_id,)).fetchone()
    conn.close()
    return jsonify(dict(book)), 201

@app.route("/api/books/<int:book_id>", methods=["GET"])
@login_required
def get_book(book_id):
    conn = get_db()
    book = get_owned_book(conn, book_id)
    conn.close()
    if not book: abort(404)
    return jsonify(dict(book))

@app.route("/api/books/<int:book_id>", methods=["PATCH"])
@login_required
def update_book(book_id):
    data = request.json or {}
    uid = current_user_id()
    conn = get_db()
    with library_lock():
        book = get_owned_book(conn, book_id)
        if not book:
            conn.close(); abort(404)
        if "title" in data:
            new_title = data["title"].strip()
            if new_title:
                # El nombre del archivo sigue al titulo (en su misma carpeta):
                # es lo que se ve al entrar a la carpeta por SSH.
                conn.execute("UPDATE books SET title=? WHERE id=?", (new_title, book_id))
                base = clean_name(new_title)
                if base:
                    try:
                        move_book_file(conn, uid, book, parent_rel(book["relpath"]),
                                       base + os.path.splitext(book["filename"])[1])
                    except OSError as e:
                        print("No se pudo renombrar el archivo:", e)
                book = get_owned_book(conn, book_id)
        if "collection_id" in data:
            target = owned_collection(conn, data["collection_id"])
            if target and target["path"] != parent_rel(book["relpath"]):
                move_book_file(conn, uid, book, target["path"])
        if "view_mode" in data:
            conn.execute("UPDATE books SET view_mode=? WHERE id=?", (data["view_mode"], book_id))
        conn.commit()
    book = conn.execute("SELECT * FROM books WHERE id=?", (book_id,)).fetchone()
    conn.close()
    return jsonify(dict(book))

@app.route("/api/books/<int:book_id>", methods=["DELETE"])
@login_required
def delete_book(book_id):
    # Eliminar manda a la papelera; el borrado definitivo es desde ahi.
    uid = current_user_id()
    conn = get_db()
    with library_lock():
        book = get_owned_book(conn, book_id)
        if not book: conn.close(); abort(404)
        trash_book(conn, uid, book)
        conn.commit()
    conn.close()
    return jsonify({"ok":True})

@app.route("/api/books/<int:book_id>/file")
@login_required
def serve_book_file(book_id):
    conn = get_db()
    book = get_owned_book(conn, book_id)
    conn.close()
    if not book: abort(404)
    download = request.args.get("download","0") == "1"
    path = rel_to_abs(book["user_id"], book["relpath"])
    if not os.path.isfile(path): abort(404)
    return send_file(path, as_attachment=download, download_name=book["filename"])

@app.route("/api/books/<int:book_id>/cover")
@login_required
def serve_cover(book_id):
    # Tambien para libros en la papelera, que se muestran con su portada.
    conn = get_db()
    book = get_owned_book(conn, book_id, include_trash=True)
    if not book:
        conn.close(); abort(404)
    ensure_book_meta(conn, book)
    conn.close()
    cover_path = os.path.join(user_covers_dir(current_user_id()), str(book_id) + ".jpg")
    if os.path.exists(cover_path):
        return send_file(cover_path, mimetype="image/jpeg")
    abort(404)

# ── Papelera y releer ────────────────────────────────────────────────────────
@app.route("/api/trash", methods=["GET"])
@login_required
def list_trash():
    uid = current_user_id()
    conn = get_db()
    sweep_library(conn, uid)
    rows = conn.execute(
        "SELECT b.*, datetime(b.deleted_at, ?) as trash_expires_at FROM books b "
        "WHERE b.user_id=? AND b.deleted_at IS NOT NULL ORDER BY b.deleted_at DESC",
        (f"+{TRASH_DAYS} days", uid)).fetchall()
    conn.close()
    out = []
    for r in rows:
        b = dict(r)
        b["original_collection"] = parent_rel(b["deleted_from"] or "") or DEFAULT_COLLECTION_NAME
        out.append(b)
    return jsonify(out)

def trashed_book(conn, book_id):
    return conn.execute("SELECT * FROM books WHERE id=? AND user_id=? AND deleted_at IS NOT NULL",
                        (book_id, current_user_id())).fetchone()

@app.route("/api/trash/<int:book_id>/restore", methods=["POST"])
@login_required
def restore_from_trash(book_id):
    uid = current_user_id()
    conn = get_db()
    with library_lock():
        book = trashed_book(conn, book_id)
        if not book:
            conn.close(); abort(404)
        rel = restore_book(conn, uid, book)
        conn.commit()
    conn.close()
    return jsonify({"ok": True, "collection": parent_rel(rel) or DEFAULT_COLLECTION_NAME})

@app.route("/api/trash/<int:book_id>", methods=["DELETE"])
@login_required
def delete_from_trash(book_id):
    uid = current_user_id()
    conn = get_db()
    with library_lock():
        book = trashed_book(conn, book_id)
        if not book:
            conn.close(); abort(404)
        purge_book(conn, uid, book)
        conn.commit()
    conn.close()
    return jsonify({"ok": True})

@app.route("/api/trash", methods=["DELETE"])
@login_required
def empty_trash():
    uid = current_user_id()
    conn = get_db()
    with library_lock():
        rows = conn.execute("SELECT * FROM books WHERE user_id=? AND deleted_at IS NOT NULL", (uid,)).fetchall()
        for b in rows:
            purge_book(conn, uid, b)
        conn.commit()
    conn.close()
    return jsonify({"ok": True, "borrados": len(rows)})

@app.route("/api/library/rescan", methods=["POST"])
@login_required
def rescan_endpoint():
    uid = current_user_id()
    conn = get_db()
    try:
        stats = rescan_library(conn, uid)
    except ScanAborted as e:
        conn.close()
        return jsonify({"error": str(e)}), 409
    sweep_library(conn, uid)
    conn.close()
    return jsonify(stats)

@app.route("/api/books/<int:book_id>/progress", methods=["GET","POST"])
@login_required
def book_progress(book_id):
    device_id = request.args.get("device_id","default")
    conn = get_db()
    book = get_owned_book(conn, book_id)
    if not book:
        conn.close(); abort(404)
    if request.method == "POST":
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            conn.close(); return jsonify({"error": "JSON invalido"}), 400
        # "ts" es el momento en que se leyo, en el reloj del telefono (ms). El
        # progreso se guarda local y se sincroniza despues, a veces horas mas
        # tarde y con reintentos que pueden llegar desordenados: un guardado
        # mas viejo que el que ya esta no tiene que pisarlo. Sin "ts" (clientes
        # viejos) se acepta siempre, como antes.
        # La comparacion va dentro del UPSERT (no un SELECT previo) para que
        # dos POST simultaneos en workers distintos no se crucen.
        try:
            ts = max(int(data.get("ts") or 0), 0)
        except (TypeError, ValueError):
            ts = 0
        data["ts"] = ts
        # updated_at es "cuando se leyo", no "cuando llego": ordena bien
        # "Continuar leyendo" aunque la sesion del gimnasio sincronice a la
        # noche. Acotado a ahora por si el reloj del telefono esta adelantado.
        now_s = int(_time.time())
        read_s = min(ts // 1000, now_s) if ts else now_s
        cur = conn.execute(
            "INSERT INTO progress (book_id, device_id, progress_data, updated_at) "
            "VALUES (?,?,?,datetime(?, 'unixepoch')) "
            "ON CONFLICT(book_id, device_id) DO UPDATE SET "
            "progress_data=excluded.progress_data, updated_at=excluded.updated_at "
            "WHERE ?=0 OR COALESCE(json_extract(progress.progress_data, '$.ts'), 0) < ?",
            (book_id, device_id, json.dumps(data), read_s, ts, ts))
        applied = cur.rowcount > 0
        conn.commit(); conn.close()
        return jsonify({"ok": True, "applied": applied})
    if request.args.get("latest"):
        # El mejor entre todos los dispositivos (ver best_progress).
        best = best_progress(conn.execute("SELECT progress_data, updated_at FROM progress WHERE book_id=?", (book_id,)).fetchall())
        conn.close()
        return jsonify(best or {})
    row = conn.execute("SELECT * FROM progress WHERE book_id=? AND device_id=?", (book_id, device_id)).fetchone()
    conn.close()
    if not row: return jsonify({})
    data = json.loads(row["progress_data"])
    data["updated_at"] = row["updated_at"]
    return jsonify(data)

@app.route("/api/books/<int:book_id>/bookmarks", methods=["GET","POST"])
@login_required
def book_bookmarks(book_id):
    device_id = request.args.get("device_id","default")
    conn = get_db()
    book = get_owned_book(conn, book_id)
    if not book:
        conn.close(); abort(404)
    if request.method == "POST":
        data = request.json
        conn.execute("INSERT INTO bookmarks (book_id, device_id, label, position) VALUES (?,?,?,?)", (book_id, device_id, data.get("label",""), json.dumps(data.get("position",{}))))
        conn.commit()
        bm = conn.execute("SELECT * FROM bookmarks WHERE book_id=? AND device_id=? ORDER BY id DESC LIMIT 1", (book_id, device_id)).fetchone()
        conn.close()
        return jsonify(dict(bm)), 201
    rows = conn.execute("SELECT * FROM bookmarks WHERE book_id=? AND device_id=? ORDER BY created_at DESC", (book_id, device_id)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route("/api/books/<int:book_id>/bookmarks/<int:bm_id>", methods=["DELETE"])
@login_required
def delete_bookmark(book_id, bm_id):
    conn = get_db()
    book = get_owned_book(conn, book_id)
    if not book:
        conn.close(); abort(404)
    conn.execute("DELETE FROM bookmarks WHERE id=? AND book_id=?", (bm_id, book_id))
    conn.commit(); conn.close()
    return jsonify({"ok":True})


@app.route("/api/books/recent")
@login_required
def recent_books():
    limit = int(request.args.get("limit", 10))
    conn = get_db()
    query = ("SELECT b.*, c.name as collection_name, MAX(p.updated_at) as last_read FROM progress p "
              "JOIN books b ON b.id = p.book_id LEFT JOIN collections c ON c.id = b.collection_id "
              "WHERE b.user_id=? AND b.deleted_at IS NULL GROUP BY b.id ORDER BY last_read DESC LIMIT ?")
    rows = conn.execute(query, (current_user_id(), limit)).fetchall()
    books = attach_progress(conn, [dict(r) for r in rows])
    conn.close()
    return jsonify(books)



@app.route("/api/books/<int:book_id>/highlights", methods=["GET","POST"])
@login_required
def book_highlights(book_id):
    device_id = request.args.get("device_id","default")
    conn = get_db()
    book = get_owned_book(conn, book_id)
    if not book:
        conn.close(); abort(404)
    if request.method == "POST":
        data = request.json
        conn.execute("INSERT INTO highlights (book_id, device_id, page, text, color, cfi) VALUES (?,?,?,?,?,?)", (book_id, device_id, data.get("page"), data.get("text",""), data.get("color","#fbbf24"), data.get("cfi")))
        conn.commit()
        h = conn.execute("SELECT * FROM highlights WHERE book_id=? AND device_id=? ORDER BY id DESC LIMIT 1", (book_id, device_id)).fetchone()
        conn.close()
        return jsonify(dict(h)), 201
    rows = conn.execute("SELECT * FROM highlights WHERE book_id=? AND device_id=? ORDER BY created_at DESC", (book_id, device_id)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route("/api/books/<int:book_id>/highlights/<int:h_id>", methods=["DELETE"])
@login_required
def delete_highlight(book_id, h_id):
    conn = get_db()
    book = get_owned_book(conn, book_id)
    if not book:
        conn.close(); abort(404)
    conn.execute("DELETE FROM highlights WHERE id=? AND book_id=?", (h_id, book_id))
    conn.commit(); conn.close()
    return jsonify({"ok": True})

# ---------------------------------------------------------------------------
# Envio de libros entre usuarios + notificaciones
# ---------------------------------------------------------------------------

@app.route("/api/me/password", methods=["POST"])
@login_required
def change_own_password():
    """Cambio de contraseña del usuario en sesión.

    Pide la actual además de la nueva: sin eso, cualquiera que agarre el
    teléfono desbloqueado con la sesión abierta podría dejar al dueño afuera
    de su propia cuenta. El admin sigue teniendo su reseteo aparte, que no la
    pide, porque justamente existe para cuando el usuario ya no la sabe.
    """
    data = request.get_json(silent=True) or {}
    actual = data.get("current", "")
    nueva  = data.get("new", "")

    if len(nueva) < 6:
        return jsonify({"error": "La contraseña nueva debe tener al menos 6 caracteres"}), 400

    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE id=?", (current_user_id(),)).fetchone()
    if not user:
        conn.close()
        return jsonify({"error": "Usuario no encontrado"}), 404
    if not check_password_hash(user["password_hash"], actual):
        conn.close()
        return jsonify({"error": "La contraseña actual no es correcta"}), 403
    if actual == nueva:
        conn.close()
        return jsonify({"error": "La contraseña nueva es igual a la actual"}), 400

    conn.execute("UPDATE users SET password_hash=? WHERE id=?",
                 (generate_password_hash(nueva), user["id"]))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

@app.route("/api/users")
@login_required
def list_other_users():
    conn = get_db()
    rows = conn.execute(
        "SELECT id, username FROM users WHERE is_admin=0 AND id != ? ORDER BY username",
        (current_user_id(),)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route("/api/books/<int:book_id>/share", methods=["POST"])
@login_required
def share_book(book_id):
    data = request.json or {}
    to_user_id = data.get("to_user_id")
    conn = get_db()
    book = get_owned_book(conn, book_id)
    if not book:
        conn.close(); abort(404)
    if not to_user_id or int(to_user_id) == current_user_id():
        conn.close()
        return jsonify({"error": "Destinatario invalido"}), 400
    recipient = conn.execute("SELECT id FROM users WHERE id=? AND is_admin=0", (to_user_id,)).fetchone()
    if not recipient:
        conn.close()
        return jsonify({"error": "Ese usuario no existe"}), 404
    existing = conn.execute(
        "SELECT id FROM book_shares WHERE book_id=? AND to_user_id=? AND status='pending'",
        (book_id, to_user_id)
    ).fetchone()
    if existing:
        conn.close()
        return jsonify({"error": "Ya le enviaste este libro, esta pendiente de que lo acepte"}), 409
    conn.execute(
        "INSERT INTO book_shares (book_id, from_user_id, to_user_id) VALUES (?,?,?)",
        (book_id, current_user_id(), to_user_id)
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True}), 201

@app.route("/api/notifications/<int:share_id>/cover")
@login_required
def serve_share_cover(share_id):
    conn = get_db()
    share = get_owned_share(conn, share_id)
    if not share:
        conn.close(); abort(404)
    book = conn.execute(
        "SELECT id, has_cover FROM books WHERE id=? AND user_id=?", (share["book_id"], share["from_user_id"])
    ).fetchone()
    conn.close()
    if not book or not book["has_cover"]:
        abort(404)
    cover_path = os.path.join(user_covers_dir(share["from_user_id"]), str(book["id"]) + ".jpg")
    if os.path.exists(cover_path):
        return send_file(cover_path, mimetype="image/jpeg")
    abort(404)

@app.route("/api/notifications")
@login_required
def list_notifications():
    conn = get_db()
    sweep_expired_shares(conn)
    rows = conn.execute("""
        SELECT s.id, s.status, s.seen, s.created_at, s.resolved_at,
               s.book_id, b.title as book_title, b.format as book_format, b.has_cover as book_has_cover,
               u.username as from_username
        FROM book_shares s
        LEFT JOIN books b ON b.id = s.book_id
        JOIN users u ON u.id = s.from_user_id
        WHERE s.to_user_id = ?
        ORDER BY s.created_at DESC
    """, (current_user_id(),)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route("/api/notifications/<int:share_id>/accept", methods=["POST"])
@login_required
def accept_notification(share_id):
    data = request.json or {}
    conn = get_db()
    share = get_owned_share(conn, share_id)
    if not share:
        conn.close(); abort(404)
    if share["status"] != "pending":
        conn.close()
        return jsonify({"error": "Esta notificacion ya fue resuelta"}), 409

    source = conn.execute(
        "SELECT * FROM books WHERE id=? AND user_id=? AND deleted_at IS NULL", (share["book_id"], share["from_user_id"])
    ).fetchone()
    if not source or not os.path.exists(source["filepath"]):
        conn.execute("UPDATE book_shares SET status='unavailable', resolved_at=CURRENT_TIMESTAMP WHERE id=?", (share_id,))
        conn.commit(); conn.close()
        return jsonify({"error": "Este libro ya no esta disponible"}), 410

    uid = current_user_id()
    new_collection_name = clean_name(data.get("new_collection_name") or "")
    with library_lock():
        if new_collection_name:
            # Una coleccion nueva de primer nivel (o la que ya se llame asi).
            existing = [c for c in conn.execute("SELECT id, path FROM collections WHERE user_id=? AND parent_id IS NULL AND path != ''", (uid,)).fetchall()
                        if c["path"].casefold() == new_collection_name.casefold()]
            folder = existing[0]["path"] if existing else new_collection_name
        else:
            col = owned_collection(conn, data.get("collection_id")) if data.get("collection_id") else None
            if not col:
                conn.close()
                return jsonify({"error": "Elegi una coleccion"}), 400
            folder = col["path"]

        # Se copia a la carpeta elegida del destinatario.
        rel = unique_rel(conn, uid, folder, source["filename"])
        dst = rel_to_abs(uid, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(source["filepath"], dst)
        new_id = insert_book(conn, uid, rel, title=source["title"], content_hash=source["content_hash"],
                             cover_color=source["cover_color"], has_cover=source["has_cover"],
                             page_count=source["page_count"], view_mode=source["view_mode"])
        conn.commit()

    if source["has_cover"] == 1:
        src_cover = os.path.join(user_covers_dir(share["from_user_id"]), str(source["id"]) + ".jpg")
        if os.path.exists(src_cover):
            dst_cover = os.path.join(user_covers_dir(uid), str(new_id) + ".jpg")
            try: shutil.copy2(src_cover, dst_cover)
            except: pass

    conn.execute("UPDATE book_shares SET status='accepted', resolved_at=CURRENT_TIMESTAMP WHERE id=?", (share_id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

@app.route("/api/notifications/<int:share_id>/seen", methods=["POST"])
@login_required
def mark_notification_seen(share_id):
    # Solo marca que ya se vio (para el contador de "nuevas") — sigue
    # pudiendose aceptar despues, no es un rechazo.
    conn = get_db()
    share = get_owned_share(conn, share_id)
    if not share:
        conn.close(); abort(404)
    conn.execute("UPDATE book_shares SET seen=1 WHERE id=?", (share_id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

@app.route("/api/about")
@login_required
def about():
    import sys, platform
    try:
        import fitz
        mupdf_ver = fitz.version[0]
    except:
        mupdf_ver = "N/A"
    try:
        import PIL
        pillow_ver = PIL.__version__
    except:
        pillow_ver = "N/A"
    try:
        import flask
        flask_ver = flask.__version__
    except:
        flask_ver = "N/A"
    try:
        import werkzeug
        werkzeug_ver = werkzeug.__version__
    except:
        werkzeug_ver = "N/A"
    return jsonify({
        "python": sys.version.split()[0],
        "platform": platform.system() + " " + platform.release(),
        "flask": flask_ver,
        "werkzeug": werkzeug_ver,
        "pymupdf": mupdf_ver,
        "pillow": pillow_ver,
        "sqlite": __import__("sqlite3").sqlite_version,
        "uploads_dir": UPLOAD_FOLDER,
        "data_dir": os.path.dirname(DB_PATH),
        "db_path": DB_PATH,
        "covers_dir": COVERS_FOLDER,
    })



@app.after_request
def no_cache_static(r):
    r.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    r.headers['Pragma'] = 'no-cache'
    r.headers['Expires'] = '0'
    return r

if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=False)
