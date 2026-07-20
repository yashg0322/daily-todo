const express = require("express");
const crypto = require("crypto");
const { db, rowToTask, taskToRow } = require("../db");
const { authRequired } = require("../middleware/auth");

const router = express.Router();
router.use(authRequired);

router.get("/bootstrap", (req, res) => {
  const userId = req.userId;

  const taskRows = db
    .prepare("SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId);
  const reflectionRows = db
    .prepare("SELECT * FROM reflections WHERE user_id = ?")
    .all(userId);
  const intentionRows = db
    .prepare("SELECT * FROM intentions WHERE user_id = ?")
    .all(userId);
  const prefsRow = db.prepare("SELECT data FROM prefs WHERE user_id = ?").get(userId);

  const reflections = {};
  reflectionRows.forEach((r) => {
    reflections[r.date] = {
      mood: r.mood,
      wentWell: r.went_well,
      improve: r.improve,
      notes: r.notes,
    };
  });

  const intentions = {};
  intentionRows.forEach((r) => {
    intentions[r.date] = r.text;
  });

  let prefs = { filter: "all", sort: "smart", category: "all", theme: "dark", view: "dashboard" };
  if (prefsRow) {
    try {
      prefs = { ...prefs, ...JSON.parse(prefsRow.data) };
    } catch {
      /* keep defaults */
    }
  }

  res.json({
    tasks: taskRows.map(rowToTask),
    reflections,
    intentions,
    prefs,
  });
});

router.put("/prefs", (req, res) => {
  const data = JSON.stringify(req.body || {});
  db.prepare(
    "INSERT INTO prefs (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data"
  ).run(req.userId, data);
  res.json({ ok: true });
});

router.post("/tasks", (req, res) => {
  const task = req.body || {};
  if (!task.text?.trim()) {
    return res.status(400).json({ error: "Task text is required" });
  }

  const normalized = {
    id: task.id || crypto.randomUUID(),
    text: task.text.trim(),
    section: task.section || "inbox",
    dueDate: task.dueDate || null,
    startTime: task.startTime || null,
    endTime: task.endTime || null,
    completed: Boolean(task.completed),
    priority: task.priority || "medium",
    category: task.category || "personal",
    notes: task.notes || "",
    resourceUrl: task.resourceUrl || "",
    createdAt: task.createdAt || Date.now(),
  };

  const row = taskToRow(req.userId, normalized);
  db.prepare(`
    INSERT INTO tasks (id, user_id, text, section, due_date, start_time, end_time, completed, priority, category, notes, resource_url, created_at)
    VALUES (@id, @user_id, @text, @section, @due_date, @start_time, @end_time, @completed, @priority, @category, @notes, @resource_url, @created_at)
  `).run(row);

  res.status(201).json(rowToTask(row));
});

router.put("/tasks/:id", (req, res) => {
  const { id } = req.params;
  const existing = db
    .prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?")
    .get(id, req.userId);

  if (!existing) return res.status(404).json({ error: "Task not found" });

  const task = req.body || {};
  const updated = {
    id,
    text: (task.text ?? existing.text).trim(),
    section: task.section ?? existing.section,
    dueDate: task.dueDate !== undefined ? task.dueDate : existing.due_date,
    startTime: task.startTime !== undefined ? task.startTime : existing.start_time,
    endTime: task.endTime !== undefined ? task.endTime : existing.end_time,
    completed: task.completed !== undefined ? Boolean(task.completed) : Boolean(existing.completed),
    priority: task.priority ?? existing.priority,
    category: task.category ?? existing.category,
    notes: task.notes ?? existing.notes,
    resourceUrl: task.resourceUrl ?? existing.resource_url,
    createdAt: existing.created_at,
  };

  const row = taskToRow(req.userId, updated);
  db.prepare(`
    UPDATE tasks SET
      text = @text, section = @section, due_date = @due_date,
      start_time = @start_time, end_time = @end_time, completed = @completed,
      priority = @priority, category = @category, notes = @notes,
      resource_url = @resource_url
    WHERE id = @id AND user_id = @user_id
  `).run(row);

  res.json(rowToTask(row));
});

router.delete("/tasks/:id", (req, res) => {
  const result = db
    .prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.userId);

  if (result.changes === 0) return res.status(404).json({ error: "Task not found" });
  res.json({ ok: true });
});

router.delete("/tasks", (req, res) => {
  if (req.query.completed !== "true") {
    return res.status(400).json({ error: "Use ?completed=true to clear completed tasks" });
  }
  const result = db
    .prepare("DELETE FROM tasks WHERE user_id = ? AND completed = 1")
    .run(req.userId);
  res.json({ deleted: result.changes });
});

router.put("/reflections/:date", (req, res) => {
  const { date } = req.params;
  const { mood = 0, wentWell = "", improve = "", notes = "" } = req.body || {};

  db.prepare(`
    INSERT INTO reflections (user_id, date, mood, went_well, improve, notes)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET
      mood = excluded.mood,
      went_well = excluded.went_well,
      improve = excluded.improve,
      notes = excluded.notes
  `).run(req.userId, date, mood, wentWell, improve, notes);

  res.json({ date, mood, wentWell, improve, notes });
});

router.put("/intentions/:date", (req, res) => {
  const { date } = req.params;
  const text = (req.body?.text ?? "").trim();

  db.prepare(`
    INSERT INTO intentions (user_id, date, text) VALUES (?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET text = excluded.text
  `).run(req.userId, date, text);

  res.json({ date, text });
});

router.post("/import", (req, res) => {
  const { tasks = [], reflections = {}, intentions = {}, prefs = null } = req.body || {};

  const importTasks = db.transaction((items) => {
    items.forEach((t) => {
      if (!t.text?.trim()) return;
      const normalized = {
        id: t.id || crypto.randomUUID(),
        text: t.text.trim(),
        section: t.section || "inbox",
        dueDate: t.dueDate || null,
        startTime: t.startTime || null,
        endTime: t.endTime || null,
        completed: Boolean(t.completed),
        priority: t.priority || "medium",
        category: t.category || "personal",
        notes: t.notes || "",
        resourceUrl: t.resourceUrl || "",
        createdAt: t.createdAt || Date.now(),
      };
      const row = taskToRow(req.userId, normalized);
      db.prepare(`
        INSERT OR REPLACE INTO tasks (id, user_id, text, section, due_date, start_time, end_time, completed, priority, category, notes, resource_url, created_at)
        VALUES (@id, @user_id, @text, @section, @due_date, @start_time, @end_time, @completed, @priority, @category, @notes, @resource_url, @created_at)
      `).run(row);
    });
  });

  importTasks(tasks);

  Object.entries(reflections).forEach(([date, r]) => {
    db.prepare(`
      INSERT INTO reflections (user_id, date, mood, went_well, improve, notes)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, date) DO UPDATE SET mood=excluded.mood, went_well=excluded.went_well, improve=excluded.improve, notes=excluded.notes
    `).run(req.userId, date, r.mood || 0, r.wentWell || "", r.improve || "", r.notes || "");
  });

  Object.entries(intentions).forEach(([date, text]) => {
    db.prepare(`
      INSERT INTO intentions (user_id, date, text) VALUES (?, ?, ?)
      ON CONFLICT(user_id, date) DO UPDATE SET text = excluded.text
    `).run(req.userId, date, text || "");
  });

  if (prefs) {
    db.prepare(
      "INSERT INTO prefs (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data"
    ).run(req.userId, JSON.stringify(prefs));
  }

  res.json({ ok: true, imported: tasks.length });
});

module.exports = router;
