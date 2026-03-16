// backend/routes/sync.js
const router = require("express").Router();
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { runSync, getLastSync, isSyncRunning } = require("../lib/syncEngine");

router.use(requireAuth);

// GET /api/sync/status  — last sync info for dashboard header
router.get("/status", async (req, res) => {
  try {
    const last    = await getLastSync();
    const running = await isSyncRunning();
    res.json({ last, running });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/sync/trigger  — manual sync (admin only)
router.post("/trigger", requireAdmin, async (req, res) => {
  try {
    const running = await isSyncRunning();
    if (running) return res.status(409).json({ error: "Sync already in progress" });
    // Fire and forget — respond immediately, sync runs in background
    res.json({ ok: true, message: "Sync started" });
    runSync().catch(e => console.error("[sync/trigger]", e.message));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/sync/history  — last 10 sync runs (admin only)
router.get("/history", requireAdmin, async (req, res) => {
  try {
    const { pool } = require("../lib/db");
    const { rows } = await pool.query(
      "SELECT * FROM sync_log ORDER BY started_at DESC LIMIT 10"
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
