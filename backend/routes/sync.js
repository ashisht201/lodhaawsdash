// backend/routes/sync.js
const router = require("express").Router();
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { runSync, getLastSync, isSyncRunning } = require("../lib/syncEngine");
const { pool } = require("../lib/db");

router.use(requireAuth);

// GET /api/sync/status
router.get("/status", async (req, res) => {
  try {
    const last    = await getLastSync();
    const running = await isSyncRunning();
    res.json({ last, running });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/sync/trigger?accountId=N  — optional accountId for per-account sync
router.post("/trigger", requireAdmin, async (req, res) => {
  try {
    const running = await isSyncRunning();
    if (running) return res.status(409).json({ error: "Sync already in progress" });
    const accountId = req.query.accountId ? parseInt(req.query.accountId) : null;
    res.json({ ok: true, message: "Sync started" });
    runSync(accountId).catch(e => console.error("[sync/trigger]", e.message));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/sync/history
router.get("/history", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.*, a.display_name AS account_name
      FROM sync_log s
      LEFT JOIN accounts a ON a.id = s.account_id
      ORDER BY s.started_at DESC LIMIT 20
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
