// frontend/src/App.jsx
import { useState, useEffect } from "react";
import { api, saveToken, clearToken } from "./api.js";
import { Toast } from "./components/ui.jsx";
import SyncBadge  from "./components/SyncBadge.jsx";
import LoginPage   from "./pages/LoginPage.jsx";
import Dashboard   from "./pages/Dashboard.jsx";
import TagsPage    from "./pages/TagsPage.jsx";
import AlertsPage  from "./pages/AlertsPage.jsx";
import UsersPage   from "./pages/UsersPage.jsx";

export default function App() {
  const [user,    setUser]    = useState(null);   // { username, role }
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState("dashboard");
  const [toast,   setToast]   = useState(null);

  // Shared data loaded once after login
  const [tags,     setTags]     = useState({});
  const [comments, setComments] = useState([]);

  function showToast(msg, type = "ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  // Verify stored token on mount
  useEffect(() => {
    api.me()
      .then(me => { setUser(me); loadSharedData(); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function loadSharedData() {
    const [t, c] = await Promise.all([
      api.getTags().catch(() => ({})),
      api.getComments("").catch(() => []),
    ]);
    setTags(t);
    setComments(c);
  }

  async function handleLogin(username, password) {
    const { token, role } = await api.login(username, password);
    saveToken(token);
    setUser({ username, role });
    await loadSharedData();
  }

  function handleLogout() {
    clearToken();
    setUser(null);
    setTags({});
    setComments([]);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading…</div>
      </div>
    );
  }

  if (!user) return <LoginPage onLogin={handleLogin}/>;

  const isAdmin = user.role === "admin";

  const NAV = [
    { id: "dashboard", label: "Dashboard",  icon: "📊" },
    { id: "tags",      label: "Tags",        icon: "🏷️" },
    { id: "alerts",    label: "Alerts",      icon: "🔔" },
    ...(isAdmin ? [{ id: "users", label: "Users", icon: "👥" }] : []),
  ];

  const pageProps = { tags, isAdmin, showToast };

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-xl">☁️</span>
          <div>
            <h1 className="text-sm font-bold text-gray-800 tracking-tight">AWS Dashboard</h1>
            <p className="text-xs text-gray-400">Cost & Usage Monitor</p>
          </div>
        </div>

        <nav className="flex items-center gap-1">
          {NAV.map(n => (
            <button key={n.id} onClick={() => setPage(n.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                page === n.id ? "bg-blue-50 text-blue-600" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
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
          <h2 className="text-lg font-bold text-gray-800">
            {NAV.find(n => n.id === page)?.label}
          </h2>
        </div>

        {page === "dashboard" && (
          <Dashboard
            {...pageProps}
            comments={comments}
            onAddComment={handleAddComment}
            onDeleteComment={handleDeleteComment}
          />
        )}
        {page === "tags" && (
          <TagsPage {...pageProps} onSaveTags={handleSaveTags}/>
        )}
        {page === "alerts" && (
          <AlertsPage {...pageProps}/>
        )}
        {page === "users" && isAdmin && (
          <UsersPage currentUser={user.username} showToast={showToast}/>
        )}
      </main>

      <Toast toast={toast}/>
    </div>
  );
}
