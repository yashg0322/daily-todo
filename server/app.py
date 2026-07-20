"""Daily Todo multi-user API server."""

import json
import os
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

import bcrypt
import jwt
from dotenv import load_dotenv
from flask import Flask, g, jsonify, request, send_from_directory
from flask_cors import CORS

load_dotenv()

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "daily-todo.db"

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
JWT_EXPIRES_DAYS = int(os.getenv("JWT_EXPIRES_DAYS", "30"))

app = Flask(__name__, static_folder=str(PUBLIC), static_url_path="")
CORS(app)


def get_db():
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            text TEXT NOT NULL,
            section TEXT NOT NULL DEFAULT 'inbox',
            due_date TEXT,
            start_time TEXT,
            end_time TEXT,
            completed INTEGER NOT NULL DEFAULT 0,
            priority TEXT NOT NULL DEFAULT 'medium',
            category TEXT NOT NULL DEFAULT 'personal',
            notes TEXT NOT NULL DEFAULT '',
            resource_url TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
        CREATE TABLE IF NOT EXISTS reflections (
            user_id TEXT NOT NULL,
            date TEXT NOT NULL,
            mood INTEGER NOT NULL DEFAULT 0,
            went_well TEXT NOT NULL DEFAULT '',
            improve TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (user_id, date),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS intentions (
            user_id TEXT NOT NULL,
            date TEXT NOT NULL,
            text TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (user_id, date),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS prefs (
            user_id TEXT PRIMARY KEY,
            data TEXT NOT NULL DEFAULT '{}',
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """
    )
    db.commit()
    db.close()


def row_to_task(row):
    return {
        "id": row["id"],
        "text": row["text"],
        "section": row["section"],
        "dueDate": row["due_date"],
        "startTime": row["start_time"],
        "endTime": row["end_time"],
        "completed": bool(row["completed"]),
        "priority": row["priority"],
        "category": row["category"],
        "notes": row["notes"],
        "resourceUrl": row["resource_url"],
        "createdAt": row["created_at"],
    }


def sign_token(user_id, email):
    exp = datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRES_DAYS)
    return jwt.encode(
        {"sub": user_id, "email": email, "exp": exp},
        JWT_SECRET,
        algorithm="HS256",
    )


def auth_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return jsonify({"error": "Authentication required"}), 401
        token = header[7:]
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            g.user_id = payload["sub"]
        except jwt.PyJWTError:
            return jsonify({"error": "Invalid or expired token"}), 401
        return f(*args, **kwargs)

    return wrapper


DEFAULT_PREFS = {
    "filter": "all",
    "sort": "smart",
    "category": "all",
    "theme": "dark",
    "view": "dashboard",
}


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "service": "daily-todo"})


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not name or not email or not password:
        return jsonify({"error": "Name, email, and password are required"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    db = get_db()
    if db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone():
        return jsonify({"error": "An account with this email already exists"}), 409

    user_id = str(uuid.uuid4())
    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    created = int(datetime.now(timezone.utc).timestamp() * 1000)

    db.execute(
        "INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
        (user_id, name, email, pw_hash, created),
    )
    db.execute(
        "INSERT INTO prefs (user_id, data) VALUES (?, ?)",
        (user_id, json.dumps(DEFAULT_PREFS)),
    )
    db.commit()

    user = {"id": user_id, "name": name, "email": email}
    return jsonify({"token": sign_token(user_id, email), "user": user}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    db = get_db()
    row = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not row or not bcrypt.checkpw(password.encode(), row["password_hash"].encode()):
        return jsonify({"error": "Invalid email or password"}), 401

    user = {"id": row["id"], "name": row["name"], "email": row["email"]}
    return jsonify({"token": sign_token(row["id"], row["email"]), "user": user})


@app.get("/api/auth/me")
@auth_required
def me():
    db = get_db()
    row = db.execute(
        "SELECT id, name, email, created_at FROM users WHERE id = ?", (g.user_id,)
    ).fetchone()
    if not row:
        return jsonify({"error": "User not found"}), 404
    return jsonify(
        {
            "id": row["id"],
            "name": row["name"],
            "email": row["email"],
            "createdAt": row["created_at"],
        }
    )


@app.get("/api/bootstrap")
@auth_required
def bootstrap():
    db = get_db()
    uid = g.user_id

    tasks = [
        row_to_task(r)
        for r in db.execute(
            "SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC", (uid,)
        ).fetchall()
    ]

    reflections = {}
    for r in db.execute("SELECT * FROM reflections WHERE user_id = ?", (uid,)).fetchall():
        reflections[r["date"]] = {
            "mood": r["mood"],
            "wentWell": r["went_well"],
            "improve": r["improve"],
            "notes": r["notes"],
        }

    intentions = {
        r["date"]: r["text"]
        for r in db.execute("SELECT * FROM intentions WHERE user_id = ?", (uid,)).fetchall()
    }

    prefs_row = db.execute("SELECT data FROM prefs WHERE user_id = ?", (uid,)).fetchone()
    prefs = DEFAULT_PREFS.copy()
    if prefs_row:
        try:
            prefs.update(json.loads(prefs_row["data"]))
        except json.JSONDecodeError:
            pass

    return jsonify(
        {"tasks": tasks, "reflections": reflections, "intentions": intentions, "prefs": prefs}
    )


@app.put("/api/prefs")
@auth_required
def save_prefs():
    data = request.get_json(silent=True) or {}
    db = get_db()
    db.execute(
        """
        INSERT INTO prefs (user_id, data) VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET data = excluded.data
        """,
        (g.user_id, json.dumps(data)),
    )
    db.commit()
    return jsonify({"ok": True})


@app.post("/api/tasks")
@auth_required
def create_task():
    task = request.get_json(silent=True) or {}
    text = (task.get("text") or "").strip()
    if not text:
        return jsonify({"error": "Task text is required"}), 400

    task_id = task.get("id") or str(uuid.uuid4())
    created = task.get("createdAt") or int(datetime.now(timezone.utc).timestamp() * 1000)

    db = get_db()
    db.execute(
        """
        INSERT INTO tasks (
            id, user_id, text, section, due_date, start_time, end_time,
            completed, priority, category, notes, resource_url, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            task_id,
            g.user_id,
            text,
            task.get("section") or "inbox",
            task.get("dueDate"),
            task.get("startTime"),
            task.get("endTime"),
            1 if task.get("completed") else 0,
            task.get("priority") or "medium",
            task.get("category") or "personal",
            task.get("notes") or "",
            task.get("resourceUrl") or "",
            created,
        ),
    )
    db.commit()

    row = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    return jsonify(row_to_task(row)), 201


@app.put("/api/tasks/<task_id>")
@auth_required
def update_task(task_id):
    db = get_db()
    existing = db.execute(
        "SELECT * FROM tasks WHERE id = ? AND user_id = ?", (task_id, g.user_id)
    ).fetchone()
    if not existing:
        return jsonify({"error": "Task not found"}), 404

    task = request.get_json(silent=True) or {}
    db.execute(
        """
        UPDATE tasks SET
            text = ?, section = ?, due_date = ?, start_time = ?, end_time = ?,
            completed = ?, priority = ?, category = ?, notes = ?, resource_url = ?
        WHERE id = ? AND user_id = ?
        """,
        (
            (task.get("text") or existing["text"]).strip(),
            task.get("section", existing["section"]),
            task.get("dueDate") if "dueDate" in task else existing["due_date"],
            task.get("startTime") if "startTime" in task else existing["start_time"],
            task.get("endTime") if "endTime" in task else existing["end_time"],
            1 if task.get("completed", existing["completed"]) else 0,
            task.get("priority", existing["priority"]),
            task.get("category", existing["category"]),
            task.get("notes", existing["notes"]),
            task.get("resourceUrl", existing["resource_url"]),
            task_id,
            g.user_id,
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    return jsonify(row_to_task(row))


@app.delete("/api/tasks/<task_id>")
@auth_required
def delete_task(task_id):
    db = get_db()
    result = db.execute(
        "DELETE FROM tasks WHERE id = ? AND user_id = ?", (task_id, g.user_id)
    )
    db.commit()
    if result.rowcount == 0:
        return jsonify({"error": "Task not found"}), 404
    return jsonify({"ok": True})


@app.delete("/api/tasks")
@auth_required
def clear_completed():
    if request.args.get("completed") != "true":
        return jsonify({"error": "Use ?completed=true to clear completed tasks"}), 400
    db = get_db()
    result = db.execute(
        "DELETE FROM tasks WHERE user_id = ? AND completed = 1", (g.user_id,)
    )
    db.commit()
    return jsonify({"deleted": result.rowcount})


@app.put("/api/reflections/<date>")
@auth_required
def save_reflection(date):
    data = request.get_json(silent=True) or {}
    db = get_db()
    db.execute(
        """
        INSERT INTO reflections (user_id, date, mood, went_well, improve, notes)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, date) DO UPDATE SET
            mood = excluded.mood,
            went_well = excluded.went_well,
            improve = excluded.improve,
            notes = excluded.notes
        """,
        (
            g.user_id,
            date,
            data.get("mood", 0),
            data.get("wentWell", ""),
            data.get("improve", ""),
            data.get("notes", ""),
        ),
    )
    db.commit()
    return jsonify({"date": date, **data})


@app.put("/api/intentions/<date>")
@auth_required
def save_intention(date):
    text = (request.get_json(silent=True) or {}).get("text", "").strip()
    db = get_db()
    db.execute(
        """
        INSERT INTO intentions (user_id, date, text) VALUES (?, ?, ?)
        ON CONFLICT(user_id, date) DO UPDATE SET text = excluded.text
        """,
        (g.user_id, date, text),
    )
    db.commit()
    return jsonify({"date": date, "text": text})


@app.post("/api/import")
@auth_required
def import_data():
    payload = request.get_json(silent=True) or {}
    tasks = payload.get("tasks") or []
    reflections = payload.get("reflections") or {}
    intentions = payload.get("intentions") or {}
    prefs = payload.get("prefs")

    db = get_db()
    uid = g.user_id

    for t in tasks:
        text = (t.get("text") or "").strip()
        if not text:
            continue
        task_id = t.get("id") or str(uuid.uuid4())
        db.execute(
            """
            INSERT OR REPLACE INTO tasks (
                id, user_id, text, section, due_date, start_time, end_time,
                completed, priority, category, notes, resource_url, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                task_id,
                uid,
                text,
                t.get("section") or "inbox",
                t.get("dueDate"),
                t.get("startTime"),
                t.get("endTime"),
                1 if t.get("completed") else 0,
                t.get("priority") or "medium",
                t.get("category") or "personal",
                t.get("notes") or "",
                t.get("resourceUrl") or "",
                t.get("createdAt") or int(datetime.now(timezone.utc).timestamp() * 1000),
            ),
        )

    for date, r in reflections.items():
        db.execute(
            """
            INSERT INTO reflections (user_id, date, mood, went_well, improve, notes)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, date) DO UPDATE SET
                mood=excluded.mood, went_well=excluded.went_well,
                improve=excluded.improve, notes=excluded.notes
            """,
            (uid, date, r.get("mood", 0), r.get("wentWell", ""), r.get("improve", ""), r.get("notes", "")),
        )

    for date, text in intentions.items():
        db.execute(
            """
            INSERT INTO intentions (user_id, date, text) VALUES (?, ?, ?)
            ON CONFLICT(user_id, date) DO UPDATE SET text = excluded.text
            """,
            (uid, date, text or ""),
        )

    if prefs:
        db.execute(
            """
            INSERT INTO prefs (user_id, data) VALUES (?, ?)
            ON CONFLICT(user_id) DO UPDATE SET data = excluded.data
            """,
            (uid, json.dumps(prefs)),
        )

    db.commit()
    return jsonify({"ok": True, "imported": len(tasks)})


@app.get("/")
def index():
    return send_from_directory(PUBLIC, "index.html")


@app.errorhandler(404)
def not_found(_e):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Not found"}), 404
    return send_from_directory(PUBLIC, "index.html")


if __name__ == "__main__":
    init_db()
    port = int(os.getenv("PORT", "3000"))
    import socket

    hostname = socket.gethostname()
    try:
        lan_ip = socket.gethostbyname(hostname)
    except OSError:
        lan_ip = None

    print(f"\n  Daily Todo is running!\n")
    print(f"  On this PC:     http://localhost:{port}")
    if lan_ip and not lan_ip.startswith("127."):
        print(f"  On your Wi-Fi:  http://{lan_ip}:{port}")
    print(f"\n  Share the Wi-Fi link with people on the same network.")
    print(f"  For internet access, see DEPLOY.md\n")
    app.run(host="0.0.0.0", port=port, debug=False)
else:
    init_db()
