// backend/routes/metrics.js
// Serves data from daily cache. No live AWS calls during browsing.
const router = require("express").Router();
const { requireAuth } = require("../middleware/auth");
const { pool }        = require("../lib/db");

router.use(requireAuth);

// GET /api/metrics/instances?accountId=N
router.get("/instances", async (req, res) => {
  try {
    const { accountId } = req.query;
    const where  = accountId ? "WHERE i.account_id = $1" : "";
    const params = accountId ? [accountId] : [];
    const { rows } = await pool.query(`
      SELECT i.id, i.account_id AS "accountId", i.aws_name AS "awsName",
             i.type, i.service, i.state, i.az, i.region,
             i.synced_at AS "syncedAt", t.label, a.display_name AS "accountName"
      FROM instances_cache i
      LEFT JOIN tags t ON t.instance_id = i.id
      LEFT JOIN accounts a ON a.id = i.account_id
      ${where}
      ORDER BY i.type DESC, i.id
    `, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "Failed to load instances" }); }
});

// GET /api/metrics/daily?instanceId=…&start=YYYY-MM-DD&end=YYYY-MM-DD
router.get("/daily", async (req, res) => {
  const { instanceId, start, end } = req.query;
  if (!instanceId) return res.status(400).json({ error: "instanceId required" });
  try {
    const startDate = (start || "").slice(0, 10);
    const endDate   = (end   || "").slice(0, 10);
    const query = startDate && endDate
      ? `SELECT date, bandwidth, bandwidth_max AS "bandwidthMax",
                cpu, cpu_max AS "cpuMax", ram, ram_max AS "ramMax",
                cost_server AS "costServer", cost_bandwidth AS "costBandwidth",
                cost_other AS "costOther"
         FROM metrics_cache
         WHERE instance_id = $1 AND date >= $2 AND date <= $3
           AND date LIKE '____-__-__'
         ORDER BY date ASC`
      : `SELECT date, bandwidth, bandwidth_max AS "bandwidthMax",
                cpu, cpu_max AS "cpuMax", ram, ram_max AS "ramMax",
                cost_server AS "costServer", cost_bandwidth AS "costBandwidth",
                cost_other AS "costOther"
         FROM metrics_cache
         WHERE instance_id = $1
           AND date LIKE '____-__-__'
         ORDER BY date ASC`;
    const params = startDate && endDate ? [instanceId, startDate, endDate] : [instanceId];
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "Failed to load metrics" }); }
});

// Keep /monthly as alias for backwards compat — redirects to /daily
router.get("/monthly", async (req, res) => {
  req.url = "/daily" + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "");
  res.redirect(307, `/api/metrics/daily?${new URLSearchParams(req.query)}`);
});

// GET /api/metrics/validate
router.get("/validate", async (req, res) => {
  try {
    const { accountId } = req.query;
    if (!accountId) return res.status(400).json({ error: "accountId required" });
    const { rows } = await pool.query("SELECT * FROM accounts WHERE id=$1", [accountId]);
    if (!rows[0]) return res.status(404).json({ error: "Account not found" });
    const { validateAccount } = require("../lib/awsClient");
    const identity = await validateAccount(rows[0]);
    res.json({ ok: true, account: identity.Account, arn: identity.Arn });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

module.exports = router;
