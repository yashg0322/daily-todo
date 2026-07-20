require("dotenv").config();

const express = require("express");
const path = require("path");
const authRoutes = require("./routes/auth");
const apiRoutes = require("./routes/api");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "daily-todo" });
});

app.use("/api/auth", authRoutes);
app.use("/api", apiRoutes);

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Daily Todo running at http://localhost:${PORT}`);
});
