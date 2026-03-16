// backend/routes/comments.js
const router = require("express").Router();
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { pool } = require("../lib/db");

router.use(requireAuth);

// GET /api/comments?instanceId=…
router.get("/", async (req, res) => {
  const { instanceId } = req.query;
  const { rows } = instanceId
    ? await pool.query("SELECT * FROM comments WHERE instance_id = $1 ORDER BY created_at DESC", [instanceId])
    : await pool.query("SELECT * FROM comments ORDER BY created_at DESC");
  res.json(rows);
});

// POST /api/comments  (admin only — viewers read-only)
router.post("/", requireAdmin, async (req, res) => {
  const { instanceId, metric, month, body } = req.body || {};
  if (!instanceId || !metric || !month || !body) return res.status(400).json({ error: "All fields required" });
  const { rows } = await pool.query(
    "INSERT INTO comments (instance_id, metric, month, body, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *",
    [instanceId, metric, month, body, req.user.username]
  );
  res.json(rows[0]);
});

// DELETE /api/comments/:id  (admin only)
router.delete("/:id", requireAdmin, async (req, res) => {
  await pool.query("DELETE FROM comments WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
