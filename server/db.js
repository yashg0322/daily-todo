const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "daily-todo.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
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
`);

function rowToTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    text: row.text,
    section: row.section,
    dueDate: row.due_date,
    startTime: row.start_time,
    endTime: row.end_time,
    completed: Boolean(row.completed),
    priority: row.priority,
    category: row.category,
    notes: row.notes,
    resourceUrl: row.resource_url,
    createdAt: row.created_at,
  };
}

function taskToRow(userId, task) {
  return {
    id: task.id,
    user_id: userId,
    text: task.text,
    section: task.section || "inbox",
    due_date: task.dueDate || null,
    start_time: task.startTime || null,
    end_time: task.endTime || null,
    completed: task.completed ? 1 : 0,
    priority: task.priority || "medium",
    category: task.category || "personal",
    notes: task.notes || "",
    resource_url: task.resourceUrl || "",
    created_at: task.createdAt || Date.now(),
  };
}

module.exports = { db, rowToTask, taskToRow };
