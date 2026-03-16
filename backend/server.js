// backend/server.js
require("dotenv").config();
const express    = require("express");
const helmet     = require("helmet");
const cors       = require("cors");
const rateLimit  = require("express-rate-limit");
const cron       = require("node-cron");
const bcrypt     = require("bcryptjs");

const { initSchema, pool } = require("./lib/db");
const { checkAlerts }      = require("./lib/alertEngine");
const { runSync }          = require("./lib/syncEngine");

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || "*", credentials: true }));
app.use(express.json());
app.set("trust proxy", 1); // Render sits behind a proxy

app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));
app.use("/api/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 15,
  message: { error: "Too many login attempts." } }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth",     require("./routes/auth"));
app.use("/api/metrics",  require("./routes/metrics"));
app.use("/api/tags",     require("./routes/tags"));
app.use("/api/comments", require("./routes/comments"));
app.use("/api/alerts",   require("./routes/alerts"));
app.use("/api/sync",     require("./routes/sync"));

app.get("/api/health", (req, res) => res.json({ ok: true }));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

// ── Startup ───────────────────────────────────────────────────────────────────
async function start() {
  await initSchema();

  // Seed admin user if no users exist yet
  const { rows } = await pool.query("SELECT COUNT(*) FROM users");
  if (parseInt(rows[0].count) === 0) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || "changeme123", 12);
    await pool.query(
      "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin')",
      [process.env.ADMIN_USERNAME || "admin", hash]
    );
    console.log("[startup] Admin user created. Change the default password immediately.");
  }

  // ── Daily sync — 2:00 AM UTC (5:30 AM IST) ─────────────────────────────────
  cron.schedule("0 2 * * *", () => {
    console.log("[cron] Daily sync triggered");
    runSync().catch(e => console.error("[cron/sync]", e.message));
  }, { timezone: "UTC" });

  // ── Alert engine — every 5 minutes ─────────────────────────────────────────
  cron.schedule("*/5 * * * *", () => {
    checkAlerts().catch(e => console.error("[cron/alerts]", e.message));
  });

  // ── Run an initial sync if the cache is empty ───────────────────────────────
  const { rows: cacheRows } = await pool.query("SELECT COUNT(*) FROM instances_cache");
  if (parseInt(cacheRows[0].count) === 0) {
    console.log("[startup] Cache empty — running initial sync in 5s…");
    setTimeout(() => {
      runSync().catch(e => console.error("[startup/sync]", e.message));
    }, 5000);
  }

  app.listen(PORT, () => console.log(`[server] Listening on port ${PORT}`));
}

start().catch(err => { console.error(err); process.exit(1); });
