// frontend/src/pages/TagsPage.jsx
import { useState, useEffect } from "react";
import { api } from "../api.js";
import { Card, Badge, Btn, Spinner } from "../components/ui.jsx";

export default function TagsPage({ tags, onSaveTags, isAdmin }) {
  const [instances,  setInstances]  = useState([]);
  const [localTags,  setLocalTags]  = useState({});
  const [loading,    setLoading]    = useState(false);
  const [saving,     setSaving]     = useState(false);

  useEffect(() => { setLocalTags({ ...tags }); }, [tags]);

  useEffect(() => {
    setLoading(true);
    api.instances()
      .then(setInstances)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try { await onSaveTags(localTags); }
    finally { setSaving(false); }
  }

  if (loading) return <Spinner text="Loading instances…"/>;

  return (
    <div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {["Instance ID","Service","Type","State","Friendly Name"].map(h => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {instances.map((inst, i) => (
              <tr key={inst.id} className={`border-b border-gray-50 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}>
                <td className="px-5 py-3 font-mono text-xs text-gray-500">{inst.id}</td>
                <td className="px-5 py-3 text-gray-600">{inst.service}</td>
                <td className="px-5 py-3 text-gray-600">{inst.type}</td>
                <td className="px-5 py-3"><Badge text={inst.state}/></td>
                <td className="px-5 py-3">
                  {isAdmin ? (
                    <input type="text" placeholder="e.g. api-server-prod"
                      value={localTags[inst.id] || ""}
                      onChange={e => setLocalTags(t => ({ ...t, [inst.id]: e.target.value }))}
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"/>
                  ) : (
                    <span className="text-gray-600">{tags[inst.id] || <span className="text-gray-400 italic">not set</span>}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {isAdmin && (
          <div className="px-5 py-4 flex justify-end border-t border-gray-100">
            <Btn onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Tags"}</Btn>
          </div>
        )}
      </Card>
      {!isAdmin && (
        <p className="text-xs text-gray-400 mt-3 text-center">Viewing only — contact admin to update tags</p>
      )}
    </div>
  );
}
