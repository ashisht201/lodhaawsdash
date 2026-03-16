// frontend/src/App.jsx
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
    setTags(t);
    setComments(c);
    setAccounts(a);
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

  async function handleSaveTags(map) {
    await api.saveTags(map);
    setTags(map);
    showToast("Tags saved.");
  }

  async function handleAddComment(body) {
    const c = await api.addComment(body);
    setComments(prev => [...prev, c]);
    showToast("Comment saved.");
  }

  async function handleDeleteComment(id) {
    await api.deleteComment(id);
    setComments(prev => prev.filter(c => c.id !== id));
    showToast("Comment deleted.");
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-400 text-sm">Loading…</div>
    </div>
  );

  if (!user) return <LoginPage onLogin={handleLogin}/>;

  const isAdmin = user.role === "admin";

  const NAV = [
    { id: "dashboard",   label: "Lodha AWS Dashboard",   icon: "📊" },
    { id: "tags",        label: "Tags",         icon: "🏷️" },
    { id: "alerts",      label: "Alerts",       icon: "🔔" },
    ...(isAdmin ? [
      { id: "credentials", label: "Credentials", icon: "🔑" },
      { id: "users",       label: "Users",        icon: "👥" },
    ] : []),
  ];

  const sharedProps = { tags, getLabel, isAdmin, showToast };

  return (
    <div className="min-h-screen font-sans" style={{background: "radial-gradient(ellipse at 20% 20%, #e8ecf0 0%, #f1f4f7 40%, #eef1f5 100%)", backgroundImage: "radial-gradient(ellipse at 20% 20%, #e8ecf0 0%, #f1f4f7 40%, #eef1f5 100%), url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c8d0da' fill-opacity='0.18'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")"}}>
      <header className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-xl">☁️</span>
          <div>
            <h1 className="text-sm font-bold text-gray-800 tracking-tight">Lodha AWS Dashboard</h1>
            <p className="text-xs text-gray-400">Cost & Usage Monitor</p>
          </div>
        </div>
        <nav className="flex items-center gap-1">
          {NAV.map(n => (
            <button key={n.id} onClick={() => setPage(n.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                page === n.id ? "bg-blue-50 text-blue-600" : "text-gray-500 hover:bg-gray-100"
              }`}>
              <span>{n.icon}</span>{n.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <SyncBadge isAdmin={isAdmin}/>
          <div className="flex items-center gap-3">
            <div className="text-right hidden md:block">
              <p className="text-xs font-medium text-gray-700">{user.username}</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">{user.role}</p>
            </div>
            <button onClick={handleLogout}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded hover:bg-red-50">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-gray-800">{NAV.find(n => n.id === page)?.label}</h2>
        </div>
        {page === "dashboard"   && <Dashboard {...sharedProps} accounts={accounts} comments={comments}
                                    onAddComment={handleAddComment} onDeleteComment={handleDeleteComment}/>}
        {page === "tags"        && <TagsPage  {...sharedProps} onSaveTags={handleSaveTags}/>}
        {page === "alerts"      && <AlertsPage {...sharedProps}/>}
        {page === "credentials" && isAdmin && <CredentialsPage showToast={showToast}/>}
        {page === "users"       && isAdmin && <UsersPage currentUser={user.username} showToast={showToast}/>}
      </main>

      <Toast toast={toast}/>
      <footer className="max-w-7xl mx-auto px-4 pb-4 mt-2 flex justify-end">
        <p className="text-[10px] text-gray-400">Dashboard by Ashish Tewari, Lodha IT</p>
      </footer>
    </div>
  );
}
