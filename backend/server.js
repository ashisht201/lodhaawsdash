// backend/server.js
require("dotenv").config();
const express   = require("express");
const helmet    = require("helmet");
const cors      = require("cors");
const rateLimit = require("express-rate-limit");
const cron      = require("node-cron");
const bcrypt    = require("bcryptjs");

const { initSchema, pool } = require("./lib/db");
const { checkAlerts }      = require("./lib/alertEngine");
const { runSync }          = require("./lib/syncEngine");
const { encrypt }          = require("./lib/crypto");

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || "*", credentials: true }));
app.use(express.json());
app.set("trust proxy", 1);
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));
app.use("/api/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 15,
  message: { error: "Too many login attempts." } }));

app.use("/api/auth",     require("./routes/auth"));
app.use("/api/accounts", require("./routes/accounts"));
app.use("/api/metrics",  require("./routes/metrics"));
app.use("/api/tags",     require("./routes/tags"));
app.use("/api/comments", require("./routes/comments"));
app.use("/api/alerts",   require("./routes/alerts"));
app.use("/api/sync",     require("./routes/sync"));

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

async function start() {
  // Warn if CREDENTIAL_SECRET not set — required for multi-account
  if (!process.env.CREDENTIAL_SECRET) {
    console.warn("[startup] WARNING: CREDENTIAL_SECRET env var not set. Add it in Render → Environment.");
  }

  await initSchema();

  // ── Seed admin user ────────────────────────────────────────────────────────
  const { rows: userRows } = await pool.query("SELECT COUNT(*) FROM users");
  if (parseInt(userRows[0].count) === 0) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || "changeme123", 12);
    await pool.query(
      "INSERT INTO users (username, password_hash, role) VALUES ($1,$2,'admin')",
      [process.env.ADMIN_USERNAME || "admin", hash]
    );
    console.log("[startup] Admin user created.");
  }

  // ── Auto-migrate account 1 from env vars if DB is empty ───────────────────
  const { rows: accRows } = await pool.query("SELECT COUNT(*) FROM accounts");
  if (parseInt(accRows[0].count) === 0) {
    const keyId     = process.env.AWS_ACCESS_KEY_ID;
    const keySecret = process.env.AWS_SECRET_ACCESS_KEY;
    const regions   = process.env.AWS_REGIONS || process.env.AWS_REGION || "us-east-1";

    if (keyId && keySecret && process.env.CREDENTIAL_SECRET) {
      await pool.query(`
        INSERT INTO accounts (display_name, regions, access_key_id, secret_key_enc, active)
        VALUES ($1,$2,$3,$4,TRUE)
      `, ["Account 1 (migrated)", regions, keyId, encrypt(keySecret)]);
      console.log("[startup] Auto-migrated Account 1 from environment variables.");
    } else if (keyId && keySecret) {
      console.warn("[startup] AWS credentials found in env vars but CREDENTIAL_SECRET not set — cannot migrate. Set CREDENTIAL_SECRET and redeploy.");
    } else {
      console.log("[startup] No accounts in DB and no env var credentials — add accounts via the Credentials page.");
    }
  }

  // ── Daily sync — 2:00 AM UTC ───────────────────────────────────────────────
  cron.schedule("0 2 * * *", () => {
    console.log("[cron] Daily sync triggered");
    runSync().catch(e => console.error("[cron/sync]", e.message));
  }, { timezone: "UTC" });

  // ── Alert engine — every 5 minutes ────────────────────────────────────────
  cron.schedule("*/5 * * * *", () => {
    checkAlerts().catch(e => console.error("[cron/alerts]", e.message));
  });

  // ── Initial sync if cache empty ────────────────────────────────────────────
  const { rows: cacheRows } = await pool.query("SELECT COUNT(*) FROM instances_cache");
  if (parseInt(cacheRows[0].count) === 0) {
    console.log("[startup] Cache empty — running initial sync in 5s…");
    setTimeout(() => runSync().catch(e => console.error("[startup/sync]", e.message)), 5000);
  }

  app.listen(PORT, () => console.log(`[server] Listening on port ${PORT}`));
}

start().catch(err => { console.error(err); process.exit(1); });
