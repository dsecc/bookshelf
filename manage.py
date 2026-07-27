#!/usr/bin/env python3
"""CLI de administracion de usuarios de Bookshelf.

Pensado para correr dentro del contenedor (via manage.sh / docker exec),
para poder crear el primer usuario o gestionar cuentas sin depender del
panel web de administracion.
"""
import argparse
import getpass
import sys

from werkzeug.security import generate_password_hash

import app as bookshelf


def cmd_create_user(args):
    password = args.password or getpass.getpass("Contraseña: ")
    if not password:
        print("La contraseña no puede estar vacia.")
        sys.exit(1)
    conn = bookshelf.get_db()
    try:
        conn.execute(
            "INSERT INTO users (username, password_hash, is_admin) VALUES (?,?,?)",
            (args.username, generate_password_hash(password), 1 if args.admin else 0),
        )
        conn.commit()
        user = conn.execute("SELECT id FROM users WHERE username=?", (args.username,)).fetchone()
        if not args.admin:
            bookshelf.ensure_default_collection(conn, user["id"])
            conn.commit()
        print(f"Usuario '{args.username}' creado ({'admin' if args.admin else 'usuario normal'}).")
    except Exception as e:
        print(f"Error: no se pudo crear el usuario ({e})")
        sys.exit(1)
    finally:
        conn.close()


def cmd_list_users(args):
    conn = bookshelf.get_db()
    rows = conn.execute(
        """SELECT u.id, u.username, u.is_admin, u.created_at, COUNT(b.id) as book_count
           FROM users u LEFT JOIN books b ON b.user_id = u.id
           GROUP BY u.id ORDER BY u.is_admin DESC, u.username"""
    ).fetchall()
    conn.close()
    if not rows:
        print("No hay usuarios todavia.")
        return
    for r in rows:
        role = "admin" if r["is_admin"] else "usuario"
        print(f"[{r['id']}] {r['username']:<20} {role:<8} {r['book_count']} libro(s)  (creado {r['created_at']})")


def cmd_delete_user(args):
    conn = bookshelf.get_db()
    user = conn.execute("SELECT * FROM users WHERE username=?", (args.username,)).fetchone()
    if not user:
        print(f"No existe el usuario '{args.username}'.")
        conn.close()
        sys.exit(1)
    if user["is_admin"]:
        print("No se puede borrar la cuenta de administrador.")
        conn.close()
        sys.exit(1)
    if not args.yes:
        confirm = input(f"Esto borra a '{args.username}' y TODOS sus libros. Escribi 'si' para confirmar: ")
        if confirm.strip().lower() != "si":
            print("Cancelado.")
            conn.close()
            return
    import os, shutil
    books = conn.execute("SELECT id, filepath FROM books WHERE user_id=?", (user["id"],)).fetchall()
    for b in books:
        try: os.remove(b["filepath"])
        except: pass
        try: os.remove(os.path.join(bookshelf.user_covers_dir(user["id"]), str(b["id"]) + ".jpg"))
        except: pass
    book_ids = [b["id"] for b in books]
    if book_ids:
        placeholders = ",".join("?" * len(book_ids))
        conn.execute(f"DELETE FROM progress WHERE book_id IN ({placeholders})", book_ids)
        conn.execute(f"DELETE FROM bookmarks WHERE book_id IN ({placeholders})", book_ids)
        conn.execute(f"DELETE FROM highlights WHERE book_id IN ({placeholders})", book_ids)
    conn.execute("DELETE FROM books WHERE user_id=?", (user["id"],))
    conn.execute("DELETE FROM collections WHERE user_id=?", (user["id"],))
    conn.execute("DELETE FROM users WHERE id=?", (user["id"],))
    conn.commit()
    conn.close()
    shutil.rmtree(os.path.join(bookshelf.UPLOAD_FOLDER, str(user["id"])), ignore_errors=True)
    shutil.rmtree(os.path.join(bookshelf.COVERS_FOLDER, str(user["id"])), ignore_errors=True)
    print(f"Usuario '{args.username}' borrado.")


def cmd_reset_password(args):
    password = args.password or getpass.getpass("Nueva contraseña: ")
    if not password:
        print("La contraseña no puede estar vacia.")
        sys.exit(1)
    conn = bookshelf.get_db()
    user = conn.execute("SELECT id FROM users WHERE username=?", (args.username,)).fetchone()
    if not user:
        print(f"No existe el usuario '{args.username}'.")
        conn.close()
        sys.exit(1)
    conn.execute("UPDATE users SET password_hash=? WHERE id=?", (generate_password_hash(password), user["id"]))
    conn.commit()
    conn.close()
    print(f"Contraseña de '{args.username}' actualizada.")


def main():
    parser = argparse.ArgumentParser(description="Administracion de usuarios de Bookshelf")
    sub = parser.add_subparsers(dest="command", required=True)

    p_create = sub.add_parser("create-user", help="Crear un usuario nuevo")
    p_create.add_argument("username")
    p_create.add_argument("password", nargs="?", help="Si se omite, se pide de forma interactiva")
    p_create.add_argument("--admin", action="store_true", help="Crear como cuenta de administrador (sin biblioteca)")
    p_create.set_defaults(func=cmd_create_user)

    p_list = sub.add_parser("list-users", help="Listar usuarios")
    p_list.set_defaults(func=cmd_list_users)

    p_delete = sub.add_parser("delete-user", help="Borrar un usuario y toda su biblioteca")
    p_delete.add_argument("username")
    p_delete.add_argument("-y", "--yes", action="store_true", help="No pedir confirmacion")
    p_delete.set_defaults(func=cmd_delete_user)

    p_reset = sub.add_parser("reset-password", help="Cambiar la contraseña de un usuario")
    p_reset.add_argument("username")
    p_reset.add_argument("password", nargs="?", help="Si se omite, se pide de forma interactiva")
    p_reset.set_defaults(func=cmd_reset_password)

    args = parser.parse_args()
    bookshelf.init_db()
    args.func(args)


if __name__ == "__main__":
    main()
