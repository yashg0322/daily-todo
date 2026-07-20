const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { db } = require("../db");
const { signToken, authRequired } = require("../middleware/auth");

const router = express.Router();

router.post("/register", (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: "Name, email, and password are required" });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail);
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  const id = crypto.randomUUID();
  const passwordHash = bcrypt.hashSync(password, 10);
  const createdAt = Date.now();

  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, name.trim(), normalizedEmail, passwordHash, createdAt);

  db.prepare("INSERT INTO prefs (user_id, data) VALUES (?, ?)").run(
    id,
    JSON.stringify({ filter: "all", sort: "smart", category: "all", theme: "dark", view: "dashboard" })
  );

  const user = { id, name: name.trim(), email: normalizedEmail };
  const token = signToken(user);

  res.status(201).json({ token, user });
});

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};

  if (!email?.trim() || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(normalizedEmail);

  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const user = { id: row.id, name: row.name, email: row.email };
  res.json({ token: signToken(user), user });
});

router.get("/me", authRequired, (req, res) => {
  const row = db.prepare("SELECT id, name, email, created_at FROM users WHERE id = ?").get(req.userId);
  if (!row) return res.status(404).json({ error: "User not found" });
  res.json({ id: row.id, name: row.name, email: row.email, createdAt: row.created_at });
});

module.exports = router;
