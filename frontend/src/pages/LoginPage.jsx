// frontend/src/pages/LoginPage.jsx — NOC Dark Theme
import { useState } from "react";

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(""); setLoading(true);
    try { await onLogin(username, password); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="login-bg">
      <div className="login-card">
        <span className="login-logo">☁️</span>
        <h1 className="login-title">Lodha AWS</h1>
        <p className="login-sub">Infrastructure Dashboard // Secure Access</p>

        <form onSubmit={submit} style={{ display:"flex", flexDirection:"column", gap:"1rem" }}>
          <div>
            <label className="noc-label">Username</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)}
              autoComplete="username" required className="noc-input"
              placeholder="enter username"/>
          </div>
          <div>
            <label className="noc-label">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              autoComplete="current-password" required className="noc-input"
              placeholder="••••••••••"/>
          </div>
          {error && (
            <div style={{
              padding:"8px 12px", borderRadius:"4px",
              background:"rgba(255,68,102,0.08)", border:"1px solid rgba(255,68,102,0.3)",
              color:"var(--red)", fontFamily:"var(--font-mono)", fontSize:"0.68rem"
            }}>{error}</div>
          )}
          <button type="submit" disabled={loading} className="noc-btn noc-btn-primary" style={{ marginTop:"0.5rem", width:"100%" }}>
            {loading ? "Authenticating…" : "Access Dashboard →"}
          </button>
        </form>
      </div>
    </div>
  );
}
