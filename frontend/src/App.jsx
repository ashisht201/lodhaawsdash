// frontend/src/App.jsx — NOC Dark Theme
import { useState, useEffect } from "react";
import { api, saveToken, clearToken } from "./api.js";
import { Toast } from "./components/ui.jsx";
import SyncBadge       from "./components/SyncBadge.jsx";
import LoginPage       from "./pages/LoginPage.jsx";
import Dashboard       from "./pages/Dashboard.jsx";
import TagsPage        from "./pages/TagsPage.jsx";
import AlertsPage      from "./pages/AlertsPage.jsx";
import UsersPage       from "./pages/UsersPage.jsx";
import CredentialsPage from "./pages/CredentialsPage.jsx";

export default function App() {
  const [user,     setUser]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [page,     setPage]     = useState("dashboard");
  const [toast,    setToast]    = useState(null);
  const [tags,     setTags]     = useState({});
  const [comments, setComments] = useState([]);
  const [accounts, setAccounts] = useState([]);

  function showToast(msg, type = "ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  function getLabel(instanceId) {
    const t = tags[instanceId];
    return (typeof t === "object" ? t?.label : t) || instanceId;
  }

  useEffect(() => {
    api.me()
      .then(me => { setUser(me); loadSharedData(); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function loadSharedData() {
    const [t, c, a] = await Promise.all([
      api.getTags().catch(() => ({})),
      api.getComments("").catch(() => []),
      api.listAccounts().catch(() => []),
    ]);
    setTags(t); setComments(c); setAccounts(a);
  }

  async function handleLogin(username, password) {
    const { token, role } = await api.login(username, password);
    saveToken(token);
    setUser({ username, role });
    await loadSharedData();
  }

  function handleLogout() {
    clearToken();
    setUser(null); setTags({}); setComments([]); setAccounts([]);
    setPage("dashboard");
  }

  async function handleSaveTags(map) { await api.saveTags(map); setTags(map); showToast("Tags saved."); }
  async function handleAddComment(body) { const c = await api.addComment(body); setComments(prev => [...prev, c]); showToast("Comment saved."); }
  async function handleDeleteComment(id) { await api.deleteComment(id); setComments(prev => prev.filter(c => c.id !== id)); showToast("Comment deleted."); }

  if (loading) return (
    <div className="login-bg">
      <div style={{ fontFamily:"var(--font-mono)", fontSize:"0.7rem", letterSpacing:"0.15em", color:"var(--cyan-dim)", textTransform:"uppercase" }}>
        Initialising…
      </div>
    </div>
  );

  if (!user) return <LoginPage onLogin={handleLogin}/>;

  const isAdmin = user.role === "admin";

  const NAV = [
    { id: "dashboard",   label: "Dashboard",   icon: "◈" },
    { id: "tags",        label: "Tags",         icon: "◎" },
    { id: "alerts",      label: "Alerts",       icon: "◉" },
    ...(isAdmin ? [
      { id: "credentials", label: "Credentials", icon: "◆" },
      { id: "users",       label: "Users",        icon: "◇" },
    ] : []),
  ];

  const sharedProps = { tags, getLabel, isAdmin, showToast };

  return (
    <div className="lodha-bg" style={{ minHeight:"100vh" }}>
      {/* Header */}
      <header className="noc-header">
        <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
          <span className="noc-logo-icon">☁️</span>
          <div>
            <div className="noc-title">Lodha AWS Dashboard</div>
            <div className="noc-subtitle">Infrastructure Monitor // Real-time</div>
          </div>
        </div>

        <nav style={{ display:"flex", alignItems:"center", gap:"4px" }}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setPage(n.id)}
              className={`nav-btn ${page === n.id ? "active" : ""}`}>
              <span style={{ fontSize:"0.65rem" }}>{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>

        <div style={{ display:"flex", alignItems:"center", gap:"16px" }}>
          <SyncBadge isAdmin={isAdmin}/>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontFamily:"var(--font-display)", fontSize:"0.72rem", fontWeight:600, color:"var(--text-secondary)", letterSpacing:"0.04em" }}>
              {user.username}
            </div>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:"0.55rem", color:"var(--text-muted)", letterSpacing:"0.1em", textTransform:"uppercase" }}>
              {user.role}
            </div>
          </div>
          <button onClick={handleLogout} className="noc-btn noc-btn-ghost" style={{ padding:"5px 10px", fontSize:"0.65rem" }}>
            Exit
          </button>
        </div>
      </header>

      {/* Main */}
      <main style={{ maxWidth:"1280px", margin:"0 auto", padding:"1.5rem 1rem" }}>
        <div className="page-heading">
          {page === "dashboard" ? "Lodha AWS Dashboard" : NAV.find(n => n.id === page)?.label}
        </div>

        {page === "dashboard"   && <Dashboard {...sharedProps} accounts={accounts} comments={comments}
                                    onAddComment={handleAddComment} onDeleteComment={handleDeleteComment}/>}
        {page === "tags"        && <TagsPage  {...sharedProps} onSaveTags={handleSaveTags}/>}
        {page === "alerts"      && <AlertsPage {...sharedProps}/>}
        {page === "credentials" && isAdmin && <CredentialsPage showToast={showToast}/>}
        {page === "users"       && isAdmin && <UsersPage currentUser={user.username} showToast={showToast}/>}
      </main>

      {/* Footer */}
      <footer style={{ maxWidth:"1280px", margin:"0 auto", padding:"0.5rem 1rem 1.5rem", display:"flex", justifyContent:"flex-end" }}>
        <span className="noc-footer">Dashboard by Ashish Tewari // Lodha IT</span>
      </footer>

      <Toast toast={toast}/>
    </div>
  );
}
