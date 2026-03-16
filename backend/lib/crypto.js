// backend/lib/crypto.js
// AES-256-GCM encryption for storing AWS credentials in PostgreSQL.
// CREDENTIAL_SECRET env var must be set — generate with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
const crypto = require("crypto");

const ALG  = "aes-256-gcm";
const SALT = "awsdash-credential-salt-v1";

function getKey() {
  const secret = process.env.CREDENTIAL_SECRET;
  if (!secret) throw new Error("CREDENTIAL_SECRET env var not set");
  return crypto.pbkdf2Sync(secret, SALT, 100_000, 32, "sha256");
}

function encrypt(plaintext) {
  const key = getKey();
  const iv  = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const enc  = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag  = cipher.getAuthTag();
  // Store as hex:hex:hex (iv:tag:ciphertext)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

function decrypt(stored) {
  const key = getKey();
  const [ivHex, tagHex, dataHex] = stored.split(":");
  const decipher = crypto.createDecipheriv(ALG, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(Buffer.from(dataHex, "hex")) + decipher.final("utf8");
}

module.exports = { encrypt, decrypt };
