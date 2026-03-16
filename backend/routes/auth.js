// backend/routes/auth.js
const router  = require("express").Router();
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const { pool }               = require("../lib/db");
const { requireAuth, requireAdmin } = require("../middleware/auth");

function makeToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );
}

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });
  const { rows } = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
  const user = rows[0];
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  res.json({ token: makeToken(user), role: user.role });
});

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role });
});

// POST /api/auth/change-password  (any logged-in user)
router.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: "Both fields required" });
  if (newPassword.length < 10) return res.status(400).json({ error: "Min 10 characters" });
  const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [req.user.id]);
  if (!rows[0] || !bcrypt.compareSync(currentPassword, rows[0].password_hash)) {
    return res.status(401).json({ error: "Current password incorrect" });
  }
  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2",
    [bcrypt.hashSync(newPassword, 12), req.user.id]);
  res.json({ ok: true });
});

// ── User management — admin only ─────────────────────────────────────────────

// GET /api/auth/users
router.get("/users", requireAdmin, async (req, res) => {
  const { rows } = await pool.query("SELECT id, username, role, created_at FROM users ORDER BY id");
  res.json(rows);
});

// POST /api/auth/users  — create a viewer account
router.post("/users", requireAdmin, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });
  if (password.length < 10) return res.status(400).json({ error: "Min 10 characters" });
  try {
    const hash = bcrypt.hashSync(password, 12);
    const { rows } = await pool.query(
      "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'viewer') RETURNING id, username, role, created_at",
      [username, hash]
    );
    res.json(rows[0]);
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "Username already exists" });
    throw e;
  }
});

// DELETE /api/auth/users/:id  — admin can delete viewers (not self, not other admins)
router.delete("/users/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: "Cannot delete your own account" });
  const { rows } = await pool.query("SELECT role FROM users WHERE id = $1", [id]);
  if (!rows[0]) return res.status(404).json({ error: "User not found" });
  if (rows[0].role === "admin") return res.status(403).json({ error: "Cannot delete another admin" });
  await pool.query("DELETE FROM users WHERE id = $1", [id]);
  res.json({ ok: true });
});

// POST /api/auth/users/:id/reset-password  — admin resets a viewer's password
router.post("/users/:id/reset-password", requireAdmin, async (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 10) return res.status(400).json({ error: "Min 10 characters" });
  const id = parseInt(req.params.id);
  const { rows } = await pool.query("SELECT role FROM users WHERE id = $1", [id]);
  if (!rows[0]) return res.status(404).json({ error: "User not found" });
  if (rows[0].role === "admin") return res.status(403).json({ error: "Cannot reset another admin's password" });
  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2",
    [bcrypt.hashSync(newPassword, 12), id]);
  res.json({ ok: true });
});

module.exports = router;
