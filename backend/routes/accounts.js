// backend/routes/accounts.js
const router  = require("express").Router();
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { pool }           = require("../lib/db");
const { encrypt, decrypt } = require("../lib/crypto");
const { validateAccount }  = require("../lib/awsClient");

router.use(requireAuth);

// GET /api/accounts — list all accounts (no secret keys)
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, display_name, aws_account_id, regions, access_key_id, active, created_at FROM accounts ORDER BY id"
    );
    // Mask key ID
    const safe = rows.map(r => ({
      ...r,
      access_key_id: r.access_key_id
        ? `${r.access_key_id.slice(0,4)}••••${r.access_key_id.slice(-4)}`
        : "—",
    }));
    res.json(safe);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/accounts — add a new account (admin only)
router.post("/", requireAdmin, async (req, res) => {
  const { displayName, regions, accessKeyId, secretAccessKey } = req.body || {};
  if (!displayName || !regions || !accessKeyId || !secretAccessKey) {
    return res.status(400).json({ error: "displayName, regions, accessKeyId, secretAccessKey required" });
  }

  // Build a temporary account object to validate before saving
  const tempAccount = {
    id: 0,
    display_name:   displayName,
    regions,
    access_key_id:  accessKeyId,
    secret_key_enc: encrypt(secretAccessKey),
  };

  // Validate credentials against STS
  let identity;
  try {
    identity = await validateAccount(tempAccount);
  } catch (e) {
    return res.status(400).json({ error: `Credential validation failed: ${e.message}` });
  }

  try {
    const { rows } = await pool.query(`
      INSERT INTO accounts (display_name, aws_account_id, regions, access_key_id, secret_key_enc)
      VALUES ($1,$2,$3,$4,$5) RETURNING id, display_name, aws_account_id, regions, access_key_id, active, created_at
    `, [displayName, identity.Account, regions, accessKeyId, encrypt(secretAccessKey)]);

    const row = rows[0];
    res.json({
      ...row,
      access_key_id: `${row.access_key_id.slice(0,4)}••••${row.access_key_id.slice(-4)}`,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/accounts/:id/toggle — enable/disable (admin only)
router.patch("/:id/toggle", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE accounts SET active = NOT active WHERE id = $1 RETURNING id, display_name, active",
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Account not found" });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/accounts/:id (admin only)
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM accounts WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
