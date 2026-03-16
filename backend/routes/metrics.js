// backend/routes/metrics.js
// All data served from cache. No live AWS calls during browsing.
const router = require("express").Router();
const { requireAuth } = require("../middleware/auth");
const { pool }        = require("../lib/db");

router.use(requireAuth);

// GET /api/metrics/instances?accountId=N
router.get("/instances", async (req, res) => {
  try {
    const { accountId } = req.query;
    const query = accountId
      ? `SELECT i.id, i.account_id AS "accountId", i.aws_name AS "awsName",
                i.type, i.service, i.state, i.az, i.region, i.synced_at AS "syncedAt",
                t.label, a.display_name AS "accountName"
         FROM instances_cache i
         LEFT JOIN tags t ON t.instance_id = i.id
         LEFT JOIN accounts a ON a.id = i.account_id
         WHERE i.account_id = $1
         ORDER BY i.type DESC, i.id`
      : `SELECT i.id, i.account_id AS "accountId", i.aws_name AS "awsName",
                i.type, i.service, i.state, i.az, i.region, i.synced_at AS "syncedAt",
                t.label, a.display_name AS "accountName"
         FROM instances_cache i
         LEFT JOIN tags t ON t.instance_id = i.id
         LEFT JOIN accounts a ON a.id = i.account_id
         ORDER BY i.type DESC, i.id`;
    const params = accountId ? [accountId] : [];
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/metrics/monthly?instanceId=…&start=YYYY-MM&end=YYYY-MM
router.get("/monthly", async (req, res) => {
  const { instanceId, start, end } = req.query;
  if (!instanceId) return res.status(400).json({ error: "instanceId required" });
  try {
    const startMonth = (start || "").slice(0, 7);
    const endMonth   = (end   || "").slice(0, 7);
    const query = startMonth && endMonth
      ? `SELECT month, bandwidth, cpu, ram,
                cost_server AS "costServer", cost_bandwidth AS "costBandwidth", cost_other AS "costOther"
         FROM metrics_cache WHERE instance_id=$1 AND month>=$2 AND month<=$3 ORDER BY month`
      : `SELECT month, bandwidth, cpu, ram,
                cost_server AS "costServer", cost_bandwidth AS "costBandwidth", cost_other AS "costOther"
         FROM metrics_cache WHERE instance_id=$1 ORDER BY month`;
    const params = startMonth && endMonth ? [instanceId, startMonth, endMonth] : [instanceId];
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/metrics/validate — test credentials for a specific account
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
