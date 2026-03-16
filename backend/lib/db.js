// backend/lib/db.js
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
});

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'viewer',
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );

    -- Stores AWS account credentials (secret_key is AES-256-GCM encrypted)
    CREATE TABLE IF NOT EXISTS accounts (
      id             SERIAL PRIMARY KEY,
      display_name   TEXT NOT NULL,
      aws_account_id TEXT,
      regions        TEXT NOT NULL,   -- comma-separated e.g. "ap-south-1,us-east-1"
      access_key_id  TEXT NOT NULL,
      secret_key_enc TEXT NOT NULL,   -- encrypted with CREDENTIAL_SECRET
      active         BOOLEAN DEFAULT TRUE,
      created_at     TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tags (
      id          SERIAL PRIMARY KEY,
      instance_id TEXT NOT NULL,
      label       TEXT,
      environment TEXT,
      owner       TEXT,
      websites    TEXT,
      purpose     TEXT,
      updated_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(instance_id)
    );

    ALTER TABLE tags ADD COLUMN IF NOT EXISTS label       TEXT;
    ALTER TABLE tags ADD COLUMN IF NOT EXISTS environment TEXT;
    ALTER TABLE tags ADD COLUMN IF NOT EXISTS owner       TEXT;
    ALTER TABLE tags ADD COLUMN IF NOT EXISTS websites    TEXT;
    ALTER TABLE tags ADD COLUMN IF NOT EXISTS purpose     TEXT;

    CREATE TABLE IF NOT EXISTS comments (
      id          SERIAL PRIMARY KEY,
      instance_id TEXT NOT NULL,
      metric      TEXT NOT NULL,
      month       TEXT NOT NULL,
      body        TEXT NOT NULL,
      created_by  TEXT NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id            SERIAL PRIMARY KEY,
      instance_id   TEXT NOT NULL,
      name          TEXT NOT NULL,
      metric        TEXT NOT NULL,
      condition     TEXT NOT NULL,
      threshold     NUMERIC NOT NULL,
      email         TEXT NOT NULL,
      active        BOOLEAN DEFAULT TRUE,
      last_fired_at TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS instances_cache (
      id          TEXT PRIMARY KEY,
      account_id  INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
      aws_name    TEXT,
      type        TEXT,
      service     TEXT,
      state       TEXT,
      az          TEXT,
      region      TEXT,
      synced_at   TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE instances_cache ADD COLUMN IF NOT EXISTS region     TEXT;
    ALTER TABLE instances_cache ADD COLUMN IF NOT EXISTS account_id INTEGER;

    CREATE TABLE IF NOT EXISTS metrics_cache (
      id             SERIAL PRIMARY KEY,
      instance_id    TEXT NOT NULL,
      account_id     INTEGER,
      month          TEXT NOT NULL,
      bandwidth      NUMERIC,
      cpu            NUMERIC,
      ram            NUMERIC,
      cost_server    NUMERIC,
      cost_bandwidth NUMERIC,
      cost_other     NUMERIC,
      synced_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(instance_id, month)
    );

    ALTER TABLE metrics_cache ADD COLUMN IF NOT EXISTS account_id INTEGER;

    CREATE TABLE IF NOT EXISTS sync_log (
      id               SERIAL PRIMARY KEY,
      account_id       INTEGER,
      started_at       TIMESTAMPTZ DEFAULT NOW(),
      finished_at      TIMESTAMPTZ,
      status           TEXT DEFAULT 'running',
      instances_synced INT DEFAULT 0,
      error_msg        TEXT
    );

    ALTER TABLE sync_log ADD COLUMN IF NOT EXISTS account_id INTEGER;
  `);
  console.log("[db] Schema ready.");
}

module.exports = { pool, initSchema };
