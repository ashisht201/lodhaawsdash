// backend/routes/metrics.js
// All data is served from the PostgreSQL cache (metrics_cache, instances_cache).
// No live AWS calls happen here — the sync engine populates the cache daily.
const router = require("express").Router();
const { requireAuth } = require("../middleware/auth");
const { pool }        = require("../lib/db");

router.use(requireAuth);

// GET /api/metrics/instances
// Returns cached instance list, merged with friendly tags where available.
router.get("/instances", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        i.id,
        i.aws_name   AS "awsName",
        i.type,
        i.service,
        i.state,
        i.az,
        i.synced_at  AS "syncedAt",
        t.label      AS tag
      FROM instances_cache i
      LEFT JOIN tags t ON t.instance_id = i.id
      ORDER BY i.service, i.id
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/metrics/monthly?instanceId=…&start=YYYY-MM&end=YYYY-MM
// Returns cached monthly rows filtered by date range (YYYY-MM format).
router.get("/monthly", async (req, res) => {
  const { instanceId, start, end } = req.query;
  if (!instanceId) return res.status(400).json({ error: "instanceId required" });

  try {
    // Accept either YYYY-MM-DD or YYYY-MM
    const startMonth = (start || "").slice(0, 7);
    const endMonth   = (end   || "").slice(0, 7);

    const query = startMonth && endMonth
      ? await pool.query(`
          SELECT
            month,
            bandwidth,
            cpu,
            ram,
            cost_server    AS "costServer",
            cost_bandwidth AS "costBandwidth",
            cost_other     AS "costOther"
          FROM metrics_cache
          WHERE instance_id = $1
            AND month >= $2
            AND month <= $3
          ORDER BY month ASC
        `, [instanceId, startMonth, endMonth])
      : await pool.query(`
          SELECT
            month,
            bandwidth,
            cpu,
            ram,
            cost_server    AS "costServer",
            cost_bandwidth AS "costBandwidth",
            cost_other     AS "costOther"
          FROM metrics_cache
          WHERE instance_id = $1
          ORDER BY month ASC
        `, [instanceId]);

    res.json(query.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/metrics/validate  — test live AWS credentials (admin use / setup check)
router.get("/validate", async (req, res) => {
  try {
    const { validateCreds } = require("../lib/awsClient");
    const identity = await validateCreds();
    res.json({ ok: true, account: identity.Account, arn: identity.Arn });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

module.exports = router;
