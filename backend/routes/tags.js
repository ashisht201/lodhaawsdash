// backend/routes/tags.js
const router = require("express").Router();
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { pool } = require("../lib/db");

router.use(requireAuth);

// GET /api/tags
router.get("/", async (req, res) => {
  const { rows } = await pool.query("SELECT instance_id, label FROM tags");
  const map = {};
  rows.forEach(r => { map[r.instance_id] = r.label; });
  res.json(map);
});

// PUT /api/tags  — bulk upsert { instanceId: label }  (admin only)
router.put("/", requireAdmin, async (req, res) => {
  const map = req.body || {};
  for (const [instanceId, label] of Object.entries(map)) {
    await pool.query(
      `INSERT INTO tags (instance_id, label, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (instance_id) DO UPDATE SET label = $2, updated_at = NOW()`,
      [instanceId, label]
    );
  }
  res.json({ ok: true });
});

module.exports = router;
