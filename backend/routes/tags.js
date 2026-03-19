// backend/routes/tags.js
const router = require("express").Router();
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { pool } = require("../lib/db");

router.use(requireAuth);

// GET /api/tags — returns map of instanceId -> { label, environment, owner, websites, purpose }
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT instance_id, label, environment, owner, websites, purpose, ip_address FROM tags"
    );
    const map = {};
    rows.forEach(r => {
      map[r.instance_id] = {
        label:       r.label       || "",
        environment: r.environment || "",
        owner:       r.owner       || "",
        websites:    r.websites    || "",
        purpose:     r.purpose     || "",
        ipAddress:   r.ip_address  || "",
      };
    });
    res.json(map);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/tags — bulk upsert
// Body: { instanceId: { label, environment, owner, websites, purpose } }
router.put("/", requireAdmin, async (req, res) => {
  try {
    const map = req.body || {};
    for (const [instanceId, data] of Object.entries(map)) {
      await pool.query(`
        INSERT INTO tags (instance_id, label, environment, owner, websites, purpose, ip_address, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
        ON CONFLICT (instance_id) DO UPDATE SET
          label       = EXCLUDED.label,
          environment = EXCLUDED.environment,
          owner       = EXCLUDED.owner,
          websites    = EXCLUDED.websites,
          purpose     = EXCLUDED.purpose,
          ip_address  = EXCLUDED.ip_address,
          updated_at  = NOW()
      `, [
        instanceId,
        data.label       || "",
        data.environment || "",
        data.owner       || "",
        data.websites    || "",
        data.purpose     || "",
        data.ipAddress   || "",
      ]);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
