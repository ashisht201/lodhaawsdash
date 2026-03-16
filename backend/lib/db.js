// backend/lib/db.js
// PostgreSQL connection via the DATABASE_URL env var Render provides automatically.
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
});

// Run once on startup — idempotent CREATE TABLE IF NOT EXISTS
async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          SERIAL PRIMARY KEY,
      username    TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role        TEXT NOT NULL DEFAULT 'viewer',   -- 'admin' | 'viewer'
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tags (
      id          SERIAL PRIMARY KEY,
      instance_id TEXT NOT NULL,
      label       TEXT NOT NULL,
      updated_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(instance_id)
    );

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

    -- Stores the full instance list fetched from AWS
    CREATE TABLE IF NOT EXISTS instances_cache (
      id         TEXT PRIMARY KEY,   -- instance ID e.g. i-0abc123
      aws_name   TEXT,
      type       TEXT,
      service    TEXT,
      state      TEXT,
      az         TEXT,
      region     TEXT,
      synced_at  TIMESTAMPTZ DEFAULT NOW()
    );

    -- Add region column if upgrading from earlier version
    ALTER TABLE instances_cache ADD COLUMN IF NOT EXISTS region TEXT;

    -- Stores monthly rolled-up metric data per instance
    -- One row per (instance_id, month). Upserted on each sync.
    CREATE TABLE IF NOT EXISTS metrics_cache (
      id            SERIAL PRIMARY KEY,
      instance_id   TEXT NOT NULL,
      month         TEXT NOT NULL,    -- YYYY-MM
      bandwidth     NUMERIC,          -- GB
      cpu           NUMERIC,          -- %
      ram           NUMERIC,          -- % (null if CW Agent not installed)
      cost_server   NUMERIC,          -- USD
      cost_bandwidth NUMERIC,         -- USD
      cost_other    NUMERIC,          -- USD
      synced_at     TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(instance_id, month)
    );

    -- One row per sync run — tracks history and status
    CREATE TABLE IF NOT EXISTS sync_log (
      id           SERIAL PRIMARY KEY,
      started_at   TIMESTAMPTZ DEFAULT NOW(),
      finished_at  TIMESTAMPTZ,
      status       TEXT DEFAULT 'running',   -- 'running' | 'ok' | 'error'
      instances_synced INT DEFAULT 0,
      error_msg    TEXT
    );
  `);
  console.log("[db] Schema ready.");
}

module.exports = { pool, initSchema };
