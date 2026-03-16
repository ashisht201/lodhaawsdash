// frontend/src/pages/LoginPage.jsx
import { useState } from "react";
import { Input, Btn } from "../components/ui.jsx";

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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">☁️</div>
          <h1 className="text-2xl font-bold text-gray-800">AWS Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">Cost & Usage Monitor</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-8">
          <form onSubmit={submit} className="space-y-4">
            <Input label="Username" type="text" value={username}
              onChange={e => setUsername(e.target.value)} autoComplete="username" required />
            <Input label="Password" type="password" value={password}
              onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}
            <Btn type="submit" disabled={loading} className="w-full justify-center">
              {loading ? "Signing in…" : "Sign in"}
            </Btn>
          </form>
        </div>
      </div>
    </div>
  );
}
