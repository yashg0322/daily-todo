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
from werkzeug.exceptions import HTTPException

load_dotenv()

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
DATA_DIR = Path(os.getenv("DATA_DIR", str(ROOT / "data")))
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
        ensure_schema(g.db)
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def ensure_schema(db):
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
            recur TEXT NOT NULL DEFAULT 'none',
            parent_id TEXT,
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
    cols = {r[1] for r in db.execute("PRAGMA table_info(tasks)").fetchall()}
    for name, ddl in (
        ("notes", "ALTER TABLE tasks ADD COLUMN notes TEXT DEFAULT ''"),
        ("resource_url", "ALTER TABLE tasks ADD COLUMN resource_url TEXT DEFAULT ''"),
        ("recur", "ALTER TABLE tasks ADD COLUMN recur TEXT DEFAULT 'none'"),
        ("parent_id", "ALTER TABLE tasks ADD COLUMN parent_id TEXT"),
        ("section", "ALTER TABLE tasks ADD COLUMN section TEXT DEFAULT 'inbox'"),
        ("due_date", "ALTER TABLE tasks ADD COLUMN due_date TEXT"),
        ("start_time", "ALTER TABLE tasks ADD COLUMN start_time TEXT"),
        ("end_time", "ALTER TABLE tasks ADD COLUMN end_time TEXT"),
        ("completed", "ALTER TABLE tasks ADD COLUMN completed INTEGER DEFAULT 0"),
        ("priority", "ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT 'medium'"),
        ("category", "ALTER TABLE tasks ADD COLUMN category TEXT DEFAULT 'personal'"),
        ("created_at", "ALTER TABLE tasks ADD COLUMN created_at INTEGER DEFAULT 0"),
    ):
        if name not in cols:
            db.execute(ddl)
    db.commit()


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    ensure_schema(db)
    db.close()


def today_iso():
    return datetime.now(timezone.utc).astimezone().date().isoformat()


def _col(row, name, default=None):
    try:
        val = row[name]
        return default if val is None and default is not None else val
    except (IndexError, KeyError):
        return default


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
        "notes": _col(row, "notes", "") or "",
        "resourceUrl": _col(row, "resource_url", "") or "",
        "createdAt": row["created_at"],
        "recur": _col(row, "recur", "none") or "none",
        "parentId": _col(row, "parent_id", None),
    }


def should_generate_today(recur, today):
    if not recur or recur == "none":
        return False
    weekday = today.weekday()  # Mon=0
    if recur == "daily":
        return True
    if recur == "weekdays":
        return weekday < 5
    if recur == "weekly":
        return True
    return False


def generate_recurring_for_user(db, user_id):
    """Create today's instance for each recurring template if missing."""
    try:
        today = datetime.now(timezone.utc).astimezone().date()
        today_str = today.isoformat()
        templates = db.execute(
            """
            SELECT * FROM tasks
            WHERE user_id = ? AND IFNULL(recur, 'none') != 'none' AND parent_id IS NULL
            """,
            (user_id,),
        ).fetchall()

        created = 0
        for t in templates:
            recur = _col(t, "recur", "none") or "none"
            if not should_generate_today(recur, today):
                continue
            if recur == "weekly":
                anchor = _col(t, "due_date", None) or today_str
                try:
                    anchor_weekday = datetime.fromisoformat(str(anchor)[:10]).weekday()
                except ValueError:
                    anchor_weekday = today.weekday()
                if today.weekday() != anchor_weekday:
                    continue

            exists = db.execute(
                """
                SELECT id FROM tasks
                WHERE user_id = ? AND parent_id = ? AND due_date = ?
                LIMIT 1
                """,
                (user_id, t["id"], today_str),
            ).fetchone()
            if exists:
                continue

            db.execute(
                """
                INSERT INTO tasks (
                    id, user_id, text, section, due_date, start_time, end_time,
                    completed, priority, category, notes, resource_url, created_at,
                    recur, parent_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'none', ?)
                """,
                (
                    str(uuid.uuid4()),
                    user_id,
                    t["text"],
                    t["section"],
                    today_str,
                    t["start_time"],
                    t["end_time"],
                    t["priority"],
                    t["category"],
                    _col(t, "notes", "") or "",
                    _col(t, "resource_url", "") or "",
                    int(datetime.now(timezone.utc).timestamp() * 1000),
                    t["id"],
                ),
            )
            created += 1

        if created:
            db.commit()
        return created
    except Exception as exc:
        print(f"generate_recurring_for_user failed: {exc}")
        try:
            db.rollback()
        except Exception:
            pass
        return 0

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

        # Render free disk can wipe the DB while JWTs remain in browsers
        db = get_db()
        user = db.execute("SELECT id FROM users WHERE id = ?", (g.user_id,)).fetchone()
        if not user:
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
    generate_recurring_for_user(db, uid)

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


@app.get("/api/insights/weekly")
@auth_required
def weekly_insights():
    db = get_db()
    uid = g.user_id
    today = datetime.now(timezone.utc).astimezone().date()
    start = today - timedelta(days=6)
    start_str = start.isoformat()
    today_str = today.isoformat()

    tasks = db.execute(
        "SELECT * FROM tasks WHERE user_id = ?", (uid,)
    ).fetchall()

    completed = []
    for t in tasks:
        if not t["completed"]:
            continue
        # Prefer due_date as completion day proxy; fall back to created
        day = t["due_date"]
        if not day:
            created = t["created_at"] or 0
            try:
                day = (
                    datetime.fromtimestamp(int(created) / 1000, tz=timezone.utc)
                    .astimezone()
                    .date()
                    .isoformat()
                )
            except (OSError, OverflowError, ValueError, TypeError):
                continue
        day = str(day)[:10]
        if start_str <= day <= today_str:
            completed.append({**row_to_task(t), "_day": day})

    by_day = { (start + timedelta(days=i)).isoformat(): 0 for i in range(7) }
    by_section = {}
    wins = []
    for t in completed:
        day = t["_day"]
        if day in by_day:
            by_day[day] += 1
        by_section[t["section"]] = by_section.get(t["section"], 0) + 1
        if t["section"] == "top3" or t.get("notes"):
            wins.append({"text": t["text"], "section": t["section"], "day": day})

    reflections = db.execute(
        "SELECT * FROM reflections WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date",
        (uid, start_str, today_str),
    ).fetchall()
    mood_series = []
    mood_sum = 0
    mood_count = 0
    reflection_wins = []
    for r in reflections:
        if r["mood"]:
            mood_series.append({"date": r["date"], "mood": r["mood"]})
            mood_sum += r["mood"]
            mood_count += 1
        if r["went_well"]:
            reflection_wins.append({"date": r["date"], "text": r["went_well"]})

    top3_done = sum(1 for t in completed if t["section"] == "top3")
    learning_done = sum(1 for t in completed if t["section"] == "learning")

    return jsonify(
        {
            "range": {"start": start_str, "end": today_str},
            "completedCount": len(completed),
            "byDay": by_day,
            "bySection": by_section,
            "top3Completed": top3_done,
            "learningCompleted": learning_done,
            "avgMood": round(mood_sum / mood_count, 1) if mood_count else None,
            "moodSeries": mood_series,
            "reflectionDays": len(reflections),
            "wins": (reflection_wins + [{"date": w["day"], "text": w["text"]} for w in wins])[:8],
        }
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
    recur = task.get("recur") or "none"
    if recur not in ("none", "daily", "weekly", "weekdays"):
        recur = "none"

    values = (
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
        recur,
        task.get("parentId"),
    )

    db = get_db()
    try:
        db.execute(
            """
            INSERT INTO tasks (
                id, user_id, text, section, due_date, start_time, end_time,
                completed, priority, category, notes, resource_url, created_at,
                recur, parent_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            values,
        )
    except sqlite3.OperationalError as exc:
        # Recover from older DBs missing columns (must rollback first)
        print(f"create_task schema recovery: {exc}")
        try:
            db.rollback()
        except Exception:
            pass
        ensure_schema(db)
        db.execute(
            """
            INSERT INTO tasks (
                id, user_id, text, section, due_date, start_time, end_time,
                completed, priority, category, notes, resource_url, created_at,
                recur, parent_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            values,
        )

    db.commit()
    if recur != "none":
        generate_recurring_for_user(db, g.user_id)

    row = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        return jsonify({"error": "Task was created but could not be loaded"}), 500
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
    recur = task.get("recur", _col(existing, "recur", "none") or "none")
    if recur not in ("none", "daily", "weekly", "weekdays"):
        recur = "none"

    completed_val = task["completed"] if "completed" in task else bool(existing["completed"])
    values = (
        (task.get("text") or existing["text"]).strip(),
        task.get("section", existing["section"]),
        task.get("dueDate") if "dueDate" in task else existing["due_date"],
        task.get("startTime") if "startTime" in task else existing["start_time"],
        task.get("endTime") if "endTime" in task else existing["end_time"],
        1 if completed_val else 0,
        task.get("priority", existing["priority"]),
        task.get("category", existing["category"]),
        task.get("notes", _col(existing, "notes", "") or ""),
        task.get("resourceUrl", _col(existing, "resource_url", "") or ""),
        recur,
        task_id,
        g.user_id,
    )

    try:
        db.execute(
            """
            UPDATE tasks SET
                text = ?, section = ?, due_date = ?, start_time = ?, end_time = ?,
                completed = ?, priority = ?, category = ?, notes = ?, resource_url = ?,
                recur = ?
            WHERE id = ? AND user_id = ?
            """,
            values,
        )
    except sqlite3.OperationalError as exc:
        print(f"update_task schema recovery: {exc}")
        try:
            db.rollback()
        except Exception:
            pass
        ensure_schema(db)
        db.execute(
            """
            UPDATE tasks SET
                text = ?, section = ?, due_date = ?, start_time = ?, end_time = ?,
                completed = ?, priority = ?, category = ?, notes = ?, resource_url = ?,
                recur = ?
            WHERE id = ? AND user_id = ?
            """,
            values,
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
                completed, priority, category, notes, resource_url, created_at,
                recur, parent_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                t.get("recur") or "none",
                t.get("parentId"),
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


@app.errorhandler(500)
def server_error(err):
    print(f"500 error on {request.path}: {err}")
    if request.path.startswith("/api/"):
        detail = getattr(err, "original_exception", None) or err
        return jsonify({
            "error": f"Server error: {type(detail).__name__}: {detail}"
        }), 500
    return jsonify({"error": "Internal server error"}), 500


@app.errorhandler(Exception)
def unhandled_exception(err):
    if isinstance(err, HTTPException):
        if request.path.startswith("/api/"):
            return jsonify({"error": err.description or err.name}), err.code
        return err
    print(f"Unhandled error on {request.path}: {err}")
    if request.path.startswith("/api/"):
        return jsonify({
            "error": f"Server error: {type(err).__name__}: {err}"
        }), 500
    raise err

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
