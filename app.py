
import os, sqlite3, json, hashlib, io, shutil, secrets
from functools import wraps
from datetime import timedelta
from flask import (
    Flask, request, jsonify, send_from_directory, render_template, abort,
    send_file, session, redirect, url_for, flash, get_flashed_messages
)
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
UPLOAD_FOLDER = "/app/uploads"
COVERS_FOLDER = "/app/data/covers"
DB_PATH = "/app/data/bookshelf.db"
SECRET_KEY_PATH = "/app/data/secret_key"
ALLOWED_EXTENSIONS = {"pdf","epub","mobi","cbz","cbr","djvu","fb2","txt","doc","docx"}
DEFAULT_COLLECTION_NAME = "Sin coleccion"
SHARE_CLEANUP_DAYS = 7

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

def ensure_default_collection(conn, user_id):
    row = conn.execute("SELECT id FROM collections WHERE user_id=? AND name=?", (user_id, DEFAULT_COLLECTION_NAME)).fetchone()
    if row:
        return row["id"]
    conn.execute("INSERT INTO collections (name, user_id) VALUES (?,?)", (DEFAULT_COLLECTION_NAME, user_id))
    return conn.execute("SELECT id FROM collections WHERE user_id=? AND name=?", (user_id, DEFAULT_COLLECTION_NAME)).fetchone()["id"]

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
            name TEXT NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

def get_owned_book(conn, book_id):
    return conn.execute("SELECT * FROM books WHERE id=? AND user_id=?", (book_id, current_user_id())).fetchone()

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

@app.route("/api/collections", methods=["GET"])
@login_required
def get_collections():
    conn = get_db()
    cols = conn.execute(
        "SELECT c.*, COUNT(b.id) as book_count FROM collections c LEFT JOIN books b ON b.collection_id=c.id AND b.user_id=c.user_id "
        "WHERE c.user_id=? GROUP BY c.id ORDER BY c.name", (current_user_id(),)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in cols])

@app.route("/api/collections", methods=["POST"])
@login_required
def create_collection():
    data = request.json
    name = data.get("name","").strip()
    if not name: return jsonify({"error":"Nombre requerido"}), 400
    conn = get_db()
    try:
        conn.execute("INSERT INTO collections (name, user_id) VALUES (?,?)", (name, current_user_id()))
        conn.commit()
        col = conn.execute("SELECT * FROM collections WHERE name=? AND user_id=?", (name, current_user_id())).fetchone()
        conn.close()
        return jsonify(dict(col)), 201
    except:
        conn.close()
        return jsonify({"error":"Ya existe"}), 409

@app.route("/api/collections/<int:col_id>", methods=["DELETE"])
@login_required
def delete_collection(col_id):
    conn = get_db()
    col = conn.execute("SELECT * FROM collections WHERE id=? AND user_id=?", (col_id, current_user_id())).fetchone()
    if not col:
        conn.close(); abort(404)
    if col["name"] == DEFAULT_COLLECTION_NAME:
        conn.close()
        return jsonify({"error":"No se puede borrar"}), 400
    default_col_id = ensure_default_collection(conn, current_user_id())
    conn.execute("UPDATE books SET collection_id=? WHERE collection_id=? AND user_id=?", (default_col_id, col_id, current_user_id()))
    conn.execute("DELETE FROM collections WHERE id=? AND user_id=?", (col_id, current_user_id()))
    conn.commit(); conn.close()
    return jsonify({"ok":True})


@app.route("/api/collections/<int:col_id>", methods=["PATCH"])
@login_required
def rename_collection(col_id):
    data = request.json
    name = data.get("name", "").strip()
    if not name: return jsonify({"error": "Nombre requerido"}), 400
    conn = get_db()
    col = conn.execute("SELECT * FROM collections WHERE id=? AND user_id=?", (col_id, current_user_id())).fetchone()
    if not col:
        conn.close(); abort(404)
    try:
        conn.execute("UPDATE collections SET name=? WHERE id=? AND user_id=?", (name, col_id, current_user_id()))
        conn.commit()
        col = conn.execute("SELECT * FROM collections WHERE id=?", (col_id,)).fetchone()
        conn.close()
        return jsonify(dict(col))
    except:
        conn.close()
        return jsonify({"error": "Ya existe ese nombre"}), 409

@app.route("/api/books", methods=["GET"])
@login_required
def get_books():
    col_id = request.args.get("collection_id")
    conn = get_db()
    if col_id:
        books = conn.execute(
            "SELECT b.*, c.name as collection_name FROM books b LEFT JOIN collections c ON c.id=b.collection_id "
            "WHERE b.collection_id=? AND b.user_id=? ORDER BY b.title", (col_id, current_user_id())
        ).fetchall()
    else:
        books = conn.execute(
            "SELECT b.*, c.name as collection_name FROM books b LEFT JOIN collections c ON c.id=b.collection_id "
            "WHERE b.user_id=? ORDER BY c.name, b.title", (current_user_id(),)
        ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in books])

@app.route("/api/books/upload", methods=["POST"])
@login_required
def upload_book():
    if "file" not in request.files: return jsonify({"error":"No file"}), 400
    file = request.files["file"]
    uid = current_user_id()
    conn = get_db()
    collection_id = request.form.get("collection_id")
    if collection_id:
        owned_col = conn.execute("SELECT id FROM collections WHERE id=? AND user_id=?", (collection_id, uid)).fetchone()
        collection_id = owned_col["id"] if owned_col else ensure_default_collection(conn, uid)
    else:
        collection_id = ensure_default_collection(conn, uid)
    conn.commit()

    if not file.filename or not allowed_file(file.filename):
        conn.close()
        return jsonify({"error":"Formato no soportado"}), 400
    filename = secure_filename(file.filename)
    base, ext = os.path.splitext(filename)
    upload_dir = user_upload_dir(uid)
    counter = 1
    final_path = os.path.join(upload_dir, filename)
    while os.path.exists(final_path):
        filename = base + "_" + str(counter) + ext
        final_path = os.path.join(upload_dir, filename)
        counter += 1
    file.save(final_path)
    size = os.path.getsize(final_path)
    fmt = filename.rsplit(".",1)[1].upper()
    title = base.replace("_"," ").replace("-"," ")
    color = get_cover_color(filename)
    conn.execute(
        "INSERT INTO books (title, filename, filepath, format, size, collection_id, cover_color, has_cover, user_id) VALUES (?,?,?,?,?,?,?,0,?)",
        (title, filename, final_path, fmt, size, collection_id, color, uid)
    )
    conn.commit()
    book = conn.execute("SELECT * FROM books WHERE filename=? AND user_id=?", (filename, uid)).fetchone()
    book_id = book["id"]
    has_cover = 1 if extract_cover(final_path, book_id, fmt, uid) else 0
    page_count = 0
    if fmt == "PDF":
        try:
            import fitz as _fitz
            _doc = _fitz.open(final_path)
            page_count = _doc.page_count
            _doc.close()
        except: pass
    elif fmt == "EPUB":
        try:
            import zipfile
            with zipfile.ZipFile(final_path) as z:
                items = [n for n in z.namelist() if n.endswith(('.html','.xhtml','.htm'))]
                page_count = max(len(items), 1)
        except: pass
    conn.execute("UPDATE books SET has_cover=?, page_count=? WHERE id=?", (has_cover, page_count, book_id))
    conn.commit()
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
    data = request.json
    conn = get_db()
    book = get_owned_book(conn, book_id)
    if not book:
        conn.close(); abort(404)
    if "title" in data:
        new_title = data["title"].strip()
        if new_title:
            # Renombrar archivo en disco
            old_path = book["filepath"]
            ext = os.path.splitext(book["filename"])[1]
            new_filename = secure_filename(new_title + ext)
            # Evitar colisiones
            base_fn = new_filename
            counter = 1
            upload_dir = user_upload_dir(current_user_id())
            new_path = os.path.join(upload_dir, new_filename)
            while os.path.exists(new_path) and new_path != old_path:
                new_filename = os.path.splitext(base_fn)[0] + "_" + str(counter) + ext
                new_path = os.path.join(upload_dir, new_filename)
                counter += 1
            try:
                if old_path != new_path:
                    os.rename(old_path, new_path)
                    conn.execute("UPDATE books SET title=?, filename=?, filepath=? WHERE id=?", (new_title, new_filename, new_path, book_id))
                else:
                    conn.execute("UPDATE books SET title=? WHERE id=?", (new_title, book_id))
            except Exception as e:
                conn.execute("UPDATE books SET title=? WHERE id=?", (new_title, book_id))
    if "collection_id" in data:
        owned_col = conn.execute("SELECT id FROM collections WHERE id=? AND user_id=?", (data["collection_id"], current_user_id())).fetchone()
        if owned_col:
            conn.execute("UPDATE books SET collection_id=? WHERE id=?", (owned_col["id"], book_id))
    if "view_mode" in data:
        conn.execute("UPDATE books SET view_mode=? WHERE id=?", (data["view_mode"], book_id))
    conn.commit()
    book = conn.execute("SELECT * FROM books WHERE id=?", (book_id,)).fetchone()
    conn.close()
    return jsonify(dict(book))

@app.route("/api/books/<int:book_id>", methods=["DELETE"])
@login_required
def delete_book(book_id):
    conn = get_db()
    book = get_owned_book(conn, book_id)
    if not book: conn.close(); abort(404)
    try: os.remove(book["filepath"])
    except: pass
    cover_path = os.path.join(user_covers_dir(current_user_id()), str(book_id) + ".jpg")
    try: os.remove(cover_path)
    except: pass
    conn.execute("DELETE FROM books WHERE id=?", (book_id,))
    conn.execute("DELETE FROM progress WHERE book_id=?", (book_id,))
    conn.execute("DELETE FROM bookmarks WHERE book_id=?", (book_id,))
    conn.execute("DELETE FROM highlights WHERE book_id=?", (book_id,))
    conn.execute("DELETE FROM book_shares WHERE book_id=? AND status='pending'", (book_id,))
    conn.commit(); conn.close()
    return jsonify({"ok":True})

@app.route("/api/books/<int:book_id>/file")
@login_required
def serve_book_file(book_id):
    conn = get_db()
    book = get_owned_book(conn, book_id)
    conn.close()
    if not book: abort(404)
    download = request.args.get("download","0") == "1"
    directory = os.path.dirname(book["filepath"])
    return send_from_directory(directory, book["filename"], as_attachment=download, download_name=book["filename"])

@app.route("/api/books/<int:book_id>/cover")
@login_required
def serve_cover(book_id):
    conn = get_db()
    book = get_owned_book(conn, book_id)
    conn.close()
    if not book: abort(404)
    cover_path = os.path.join(user_covers_dir(current_user_id()), str(book_id) + ".jpg")
    if os.path.exists(cover_path):
        return send_file(cover_path, mimetype="image/jpeg")
    abort(404)

@app.route("/api/books/<int:book_id>/progress", methods=["GET","POST"])
@login_required
def book_progress(book_id):
    device_id = request.args.get("device_id","default")
    conn = get_db()
    book = get_owned_book(conn, book_id)
    if not book:
        conn.close(); abort(404)
    if request.method == "POST":
        data = request.json
        conn.execute("INSERT INTO progress (book_id, device_id, progress_data, updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(book_id, device_id) DO UPDATE SET progress_data=excluded.progress_data, updated_at=CURRENT_TIMESTAMP", (book_id, device_id, json.dumps(data)))
        conn.commit(); conn.close()
        return jsonify({"ok":True})
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
              "WHERE b.user_id=? GROUP BY b.id ORDER BY last_read DESC LIMIT ?")
    rows = conn.execute(query, (current_user_id(), limit)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])



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
        "SELECT * FROM books WHERE id=? AND user_id=?", (share["book_id"], share["from_user_id"])
    ).fetchone()
    if not source or not os.path.exists(source["filepath"]):
        conn.execute("UPDATE book_shares SET status='unavailable', resolved_at=CURRENT_TIMESTAMP WHERE id=?", (share_id,))
        conn.commit(); conn.close()
        return jsonify({"error": "Este libro ya no esta disponible"}), 410

    uid = current_user_id()
    collection_id = data.get("collection_id")
    new_collection_name = (data.get("new_collection_name") or "").strip()
    if new_collection_name:
        try:
            conn.execute("INSERT INTO collections (name, user_id) VALUES (?,?)", (new_collection_name, uid))
            conn.commit()
        except sqlite3.IntegrityError:
            pass
        col = conn.execute("SELECT id FROM collections WHERE name=? AND user_id=?", (new_collection_name, uid)).fetchone()
        collection_id = col["id"] if col else None
    elif collection_id:
        owned_col = conn.execute("SELECT id FROM collections WHERE id=? AND user_id=?", (collection_id, uid)).fetchone()
        collection_id = owned_col["id"] if owned_col else None

    if not collection_id:
        conn.close()
        return jsonify({"error": "Elegi una coleccion"}), 400

    # Copiar el archivo a la carpeta del destinatario, evitando colisiones de nombre
    upload_dir = user_upload_dir(uid)
    filename = source["filename"]
    base, ext = os.path.splitext(filename)
    counter = 1
    final_path = os.path.join(upload_dir, filename)
    while os.path.exists(final_path):
        filename = base + "_" + str(counter) + ext
        final_path = os.path.join(upload_dir, filename)
        counter += 1
    shutil.copy2(source["filepath"], final_path)

    conn.execute(
        "INSERT INTO books (title, filename, filepath, format, size, collection_id, cover_color, has_cover, page_count, view_mode, user_id) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        (source["title"], filename, final_path, source["format"], source["size"], collection_id,
         source["cover_color"], source["has_cover"], source["page_count"], source["view_mode"], uid)
    )
    conn.commit()
    new_book = conn.execute("SELECT id FROM books WHERE filename=? AND user_id=?", (filename, uid)).fetchone()

    if source["has_cover"]:
        src_cover = os.path.join(user_covers_dir(share["from_user_id"]), str(source["id"]) + ".jpg")
        if os.path.exists(src_cover):
            dst_cover = os.path.join(user_covers_dir(uid), str(new_book["id"]) + ".jpg")
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
