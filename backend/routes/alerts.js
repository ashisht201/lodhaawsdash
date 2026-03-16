// backend/routes/alerts.js
const router = require("express").Router();
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { pool } = require("../lib/db");

router.use(requireAuth);

// GET /api/alerts
router.get("/", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM alerts ORDER BY created_at DESC");
  res.json(rows);
});

// POST /api/alerts  (admin only)
router.post("/", requireAdmin, async (req, res) => {
  const { instanceId, name, metric, condition, threshold, email } = req.body || {};
  if (!instanceId || !name || !metric || !condition || threshold == null || !email) {
    return res.status(400).json({ error: "All fields required" });
  }
  const { rows } = await pool.query(
    `INSERT INTO alerts (instance_id, name, metric, condition, threshold, email)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [instanceId, name, metric, condition, threshold, email]
  );
  res.json(rows[0]);
});

// PATCH /api/alerts/:id  — toggle active (admin only)
router.patch("/:id", requireAdmin, async (req, res) => {
  const { active } = req.body || {};
  const { rows } = await pool.query(
    "UPDATE alerts SET active = $1 WHERE id = $2 RETURNING *",
    [active, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

// DELETE /api/alerts/:id  (admin only)
router.delete("/:id", requireAdmin, async (req, res) => {
  await pool.query("DELETE FROM alerts WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
