// frontend/src/pages/CredentialsPage.jsx
import { useState, useEffect } from "react";
import { api } from "../api.js";
import { Card, Badge, Btn, Modal, Input } from "../components/ui.jsx";

const REGIONS_HELP = "e.g. ap-south-1,us-east-1";

const blank = { displayName: "", regions: "", accessKeyId: "", secretAccessKey: "" };

export default function CredentialsPage({ showToast }) {
  const [accounts, setAccounts] = useState([]);
  const [modal,    setModal]    = useState(false);
  const [form,     setForm]     = useState(blank);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  useEffect(() => {
    api.listAccounts().then(setAccounts).catch(console.error);
  }, []);

  const set = f => e => setForm(p => ({ ...p, [f]: e.target.value }));

  async function addAccount() {
    setError("");
    if (!form.displayName || !form.regions || !form.accessKeyId || !form.secretAccessKey) {
      setError("All fields are required."); return;
    }
    setSaving(true);
    try {
      const a = await api.addAccount(form);
      setAccounts(prev => [...prev, a]);
      setModal(false); setForm(blank);
      showToast("Account added and credentials validated.");
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function toggleAccount(id) {
    try {
      const updated = await api.toggleAccount(id);
      setAccounts(prev => prev.map(a => a.id === updated.id ? { ...a, active: updated.active } : a));
      showToast(updated.active ? "Account enabled." : "Account disabled.");
    } catch (e) { showToast(e.message, "err"); }
  }

  async function deleteAccount(id) {
    if (!confirm("Delete this account? All cached instance data for this account will also be removed.")) return;
    try {
      await api.deleteAccount(id);
      setAccounts(prev => prev.filter(a => a.id !== id));
      showToast("Account deleted.");
    } catch (e) { showToast(e.message, "err"); }
  }

  async function triggerSync(id) {
    try {
      await api.syncTrigger(id);
      showToast("Sync started for this account.");
    } catch (e) { showToast(e.message, "err"); }
  }

  return (
    <div className="max-w-4xl">
      <div className="flex justify-between items-center mb-5">
        <p className="text-sm text-gray-500">
          Credentials are stored AES-256 encrypted in the database.
          Secret keys are never sent to the browser.
        </p>
        <Btn onClick={() => { setModal(true); setError(""); setForm(blank); }}>+ Add Account</Btn>
      </div>

      {!accounts.length ? (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2 border border-dashed border-gray-200 rounded-xl">
          <span className="text-3xl">🔑</span>
          <p className="text-sm">No AWS accounts added yet</p>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {["Name","AWS Account ID","Regions","Access Key","Status",""].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc, i) => (
                <tr key={acc.id} className="border-b border-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-700">{acc.display_name}</td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-500">{acc.aws_account_id || "—"}</td>
                  <td className="px-5 py-3 text-xs text-gray-500">{acc.regions}</td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-400">{acc.access_key_id}</td>
                  <td className="px-5 py-3">
                    <button onClick={() => toggleAccount(acc.id)}
                      className={`text-xs px-2 py-0.5 rounded border font-medium transition-colors ${acc.active?"bg-green-50 text-green-600 border-green-200":"bg-gray-100 text-gray-500 border-gray-200"}`}>
                      {acc.active ? "active" : "disabled"}
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-3">
                      <button onClick={() => triggerSync(acc.id)}
                        className="text-xs text-blue-400 hover:text-blue-600">Sync now</button>
                      <button onClick={() => deleteAccount(acc.id)}
                        className="text-xs text-red-400 hover:text-red-600">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Add account modal */}
      {modal && (
        <Modal title="🔑 Add AWS Account" onClose={() => setModal(false)}>
          <div className="space-y-3 mb-5">
            <Input label="Display Name" type="text" placeholder="e.g. Production — Mumbai"
              value={form.displayName} onChange={set("displayName")}/>
            <div>
              <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wider">Regions</label>
              <input type="text" placeholder={REGIONS_HELP}
                value={form.regions} onChange={set("regions")}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"/>
              <p className="text-xs text-gray-400 mt-1">Comma-separated. {REGIONS_HELP}</p>
            </div>
            <Input label="Access Key ID" type="text" placeholder="AKIAIOSFODNN7EXAMPLE"
              value={form.accessKeyId} onChange={set("accessKeyId")} autoComplete="off"/>
            <Input label="Secret Access Key" type="password" placeholder="wJalrXUtnFEMI…"
              value={form.secretAccessKey} onChange={set("secretAccessKey")} autoComplete="off"/>
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700">
              ℹ Credentials are validated against AWS STS before saving, then encrypted with AES-256.
            </div>
            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn onClick={addAccount} disabled={saving}>{saving ? "Validating…" : "Add Account"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
