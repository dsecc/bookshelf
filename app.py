
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
    """)
    conn.commit()

    migrate_collections_table(conn)

    # Migraciones automaticas — nunca rompen si la columna ya existe
    for migration in [
        'ALTER TABLE books ADD COLUMN has_cover INTEGER DEFAULT 0',
        'ALTER TABLE books ADD COLUMN page_count INTEGER DEFAULT 0',
        'ALTER TABLE books ADD COLUMN view_mode TEXT DEFAULT "scroll"',
        'ALTER TABLE books ADD COLUMN user_id INTEGER',
    ]:
        try:
            conn.execute(migration)
            conn.commit()
        except:
            pass

    # Bootstrap: primera vez que corre esta version del proyecto.
    # Una instalacion nueva (clonada desde cero) no tiene libros ni
    # colecciones previos, asi que solo se crea el admin. La cuenta de
    # migracion de mas abajo SOLO se crea si se detecta contenido real de
    # una version anterior sin login (upgrade in-place).
    user_count = conn.execute("SELECT COUNT(*) as c FROM users").fetchone()["c"]
    if user_count == 0:
        conn.execute("INSERT INTO users (username, password_hash, is_admin) VALUES (?,?,1)",
                     ("admin", generate_password_hash("admin123")))
        conn.commit()

        has_legacy_data = conn.execute("""
            SELECT (EXISTS(SELECT 1 FROM books WHERE user_id IS NULL)
                 OR EXISTS(SELECT 1 FROM collections WHERE user_id IS NULL)) AS c
        """).fetchone()["c"]

        if has_legacy_data:
            conn.execute("INSERT INTO users (username, password_hash, is_admin) VALUES (?,?,0)",
                         ("usuario", generate_password_hash("cambiar123")))
            conn.commit()

            legacy_id = conn.execute("SELECT id FROM users WHERE username=?", ("usuario",)).fetchone()["id"]

            # Primero se asignan las colecciones preexistentes (incluida la
            # vieja "Sin coleccion" global) a esta cuenta, y recien despues se
            # busca/crea el default — si ya existia, ensure_default_collection
            # la reusa en vez de duplicarla (evitaria violar el
            # UNIQUE(user_id, name)).
            conn.execute("UPDATE collections SET user_id=? WHERE user_id IS NULL", (legacy_id,))
            conn.commit()
            default_col_id = ensure_default_collection(conn, legacy_id)
            conn.commit()

            conn.execute("UPDATE books SET user_id=?, collection_id=COALESCE(collection_id, ?) WHERE user_id IS NULL",
                         (legacy_id, default_col_id))
            conn.commit()

            # Mover a disco los archivos que estaban sueltos en la raiz compartida
            dest_upload = user_upload_dir(legacy_id)
            for name in os.listdir(UPLOAD_FOLDER):
                src = os.path.join(UPLOAD_FOLDER, name)
                if os.path.isfile(src):
                    shutil.move(src, os.path.join(dest_upload, name))

            dest_covers = user_covers_dir(legacy_id)
            for name in os.listdir(COVERS_FOLDER):
                src = os.path.join(COVERS_FOLDER, name)
                if os.path.isfile(src):
                    shutil.move(src, os.path.join(dest_covers, name))

            for b in conn.execute("SELECT id, filename FROM books WHERE user_id=?", (legacy_id,)).fetchall():
                conn.execute("UPDATE books SET filepath=? WHERE id=?",
                             (os.path.join(dest_upload, b["filename"]), b["id"]))
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
    conn.execute("DELETE FROM users WHERE id=?", (user_id,))
    conn.commit()
    conn.close()

    shutil.rmtree(os.path.join(UPLOAD_FOLDER, str(user_id)), ignore_errors=True)
    shutil.rmtree(os.path.join(COVERS_FOLDER, str(user_id)), ignore_errors=True)
    return redirect(url_for("admin_panel"))

# ---------------------------------------------------------------------------
# Biblioteca (por usuario)
# ---------------------------------------------------------------------------

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
