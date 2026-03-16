// frontend/src/pages/UsersPage.jsx
import { useState, useEffect } from "react";
import { api } from "../api.js";
import { Card, Badge, Btn, Modal, Input } from "../components/ui.jsx";

export default function UsersPage({ currentUser, showToast }) {
  const [users,   setUsers]   = useState([]);
  const [modal,   setModal]   = useState(null); // "create" | "pw" | "reset:<id>"
  const [form,    setForm]    = useState({ username: "", password: "", confirm: "" });
  const [pwForm,  setPwForm]  = useState({ current: "", next: "", confirm: "" });
  const [error,   setError]   = useState("");

  useEffect(() => {
    api.listUsers().then(setUsers).catch(console.error);
  }, []);

  const set  = f => e => setForm(p  => ({ ...p, [f]: e.target.value }));
  const setPw = f => e => setPwForm(p => ({ ...p, [f]: e.target.value }));

  async function createUser() {
    setError("");
    if (!form.username || !form.password) { setError("Username and password required."); return; }
    if (form.password !== form.confirm)   { setError("Passwords don't match."); return; }
    if (form.password.length < 10)        { setError("Min 10 characters."); return; }
    try {
      const u = await api.createUser(form.username, form.password);
      setUsers(prev => [...prev, u]);
      setModal(null); setForm({ username: "", password: "", confirm: "" });
      showToast("Viewer account created.");
    } catch (e) { setError(e.message); }
  }

  async function deleteUser(id) {
    if (!confirm("Delete this user?")) return;
    try {
      await api.deleteUser(id);
      setUsers(prev => prev.filter(u => u.id !== id));
      showToast("User deleted.");
    } catch (e) { showToast(e.message, "err"); }
  }

  async function changeMyPassword() {
    setError("");
    if (pwForm.next !== pwForm.confirm) { setError("Passwords don't match."); return; }
    if (pwForm.next.length < 10)        { setError("Min 10 characters."); return; }
    try {
      await api.changePassword(pwForm.current, pwForm.next);
      setModal(null); setPwForm({ current: "", next: "", confirm: "" });
      showToast("Password changed.");
    } catch (e) { setError(e.message); }
  }

  async function resetViewerPassword() {
    setError("");
    const id = parseInt(modal.split(":")[1]);
    if (pwForm.next !== pwForm.confirm) { setError("Passwords don't match."); return; }
    if (pwForm.next.length < 10)        { setError("Min 10 characters."); return; }
    try {
      await api.resetPassword(id, pwForm.next);
      setModal(null); setPwForm({ current: "", next: "", confirm: "" });
      showToast("Password reset.");
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

      {/* User list */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <p className="text-sm font-semibold text-gray-600">All Users</p>
          <Btn onClick={() => { setModal("create"); setError(""); }}>+ New Viewer</Btn>
        </div>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {["Username","Role","Created",""].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} className={`border-b border-gray-50 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}>
                  <td className="px-5 py-3 font-medium text-gray-700">
                    {u.username}
                    {u.username === currentUser && <span className="ml-2 text-xs text-gray-400">(you)</span>}
                  </td>
                  <td className="px-5 py-3"><Badge text={u.role}/></td>
                  <td className="px-5 py-3 text-xs text-gray-400">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3 flex gap-3">
                    {u.role === "viewer" && (
                      <>
                        <button onClick={() => { setModal(`reset:${u.id}`); setError(""); setPwForm({ current: "", next: "", confirm: "" }); }}
                          className="text-xs text-blue-400 hover:text-blue-600">Reset pw</button>
                        <button onClick={() => deleteUser(u.id)}
                          className="text-xs text-red-400 hover:text-red-600">Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Change own password */}
      <div>
        <p className="text-sm font-semibold text-gray-600 mb-4">My Password</p>
        <Card className="p-5">
          <p className="text-xs text-gray-400 mb-4">Change your admin password. Minimum 10 characters.</p>
          <Btn variant="dark" onClick={() => { setModal("pw"); setError(""); setPwForm({ current: "", next: "", confirm: "" }); }}>
            Change Password
          </Btn>
        </Card>

        <Card className="p-5 mt-4 bg-blue-50 border-blue-100">
          <p className="text-sm font-semibold text-blue-800 mb-2">Viewer account rules</p>
          <ul className="text-xs text-blue-700 space-y-1">
            <li>• Can view all dashboards, charts, and alerts</li>
            <li>• Cannot create or delete users</li>
            <li>• Cannot add/edit tags, comments, or alerts</li>
            <li>• Cannot change another user's password</li>
          </ul>
        </Card>
      </div>

      {/* Create viewer modal */}
      {modal === "create" && (
        <Modal title="👤 New Viewer Account" onClose={() => setModal(null)}>
          <div className="space-y-3 mb-5">
            <Input label="Username" type="text" value={form.username} onChange={set("username")} autoComplete="off"/>
            <Input label="Password" type="password" value={form.password} onChange={set("password")}/>
            <Input label="Confirm Password" type="password" value={form.confirm} onChange={set("confirm")}/>
            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
            <Btn onClick={createUser}>Create Viewer</Btn>
          </div>
        </Modal>
      )}

      {/* Change my password modal */}
      {modal === "pw" && (
        <Modal title="🔐 Change My Password" onClose={() => setModal(null)}>
          <div className="space-y-3 mb-5">
            <Input label="Current Password" type="password" value={pwForm.current} onChange={setPw("current")}/>
            <Input label="New Password"     type="password" value={pwForm.next}    onChange={setPw("next")}/>
            <Input label="Confirm"          type="password" value={pwForm.confirm} onChange={setPw("confirm")}/>
            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
            <Btn variant="dark" onClick={changeMyPassword}>Change Password</Btn>
          </div>
        </Modal>
      )}

      {/* Reset viewer password modal */}
      {modal?.startsWith("reset:") && (
        <Modal title="🔑 Reset Viewer Password" onClose={() => setModal(null)}>
          <div className="space-y-3 mb-5">
            <Input label="New Password" type="password" value={pwForm.next}    onChange={setPw("next")}/>
            <Input label="Confirm"      type="password" value={pwForm.confirm} onChange={setPw("confirm")}/>
            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
            <Btn onClick={resetViewerPassword}>Reset Password</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
