// frontend/src/pages/TagsPage.jsx
import { useState, useEffect } from "react";
import { api } from "../api.js";
import { Card, Badge, Btn, Spinner } from "../components/ui.jsx";

const FIELD_INPUT = "w-full bg-gray-50 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-100";

export default function TagsPage({ tags, onSaveTags, isAdmin }) {
  const [instances, setInstances] = useState([]);
  const [localTags, setLocalTags] = useState({});
  const [loading,   setLoading]   = useState(false);
  const [saving,    setSaving]    = useState(false);

  // Initialise localTags from prop — preserve existing object structure
  useEffect(() => {
    const copy = {};
    Object.entries(tags).forEach(([id, val]) => {
      copy[id] = typeof val === "object"
        ? { ...val }
        : { label: val, environment: "", owner: "", websites: "", purpose: "", ipAddress: "" };
    });
    setLocalTags(copy);
  }, [tags]);

  useEffect(() => {
    setLoading(true);
    api.instances()
      .then(setInstances)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function setField(instanceId, field, value) {
    setLocalTags(prev => ({
      ...prev,
      [instanceId]: { ...(prev[instanceId] || {}), [field]: value },
    }));
  }

  function getField(instanceId, field) {
    const t = localTags[instanceId];
    if (!t) return "";
    return typeof t === "object" ? (t[field] || "") : (field === "label" ? t : "");
  }

  async function save() {
    setSaving(true);
    try { await onSaveTags(localTags); }
    finally { setSaving(false); }
  }

  if (loading) return <Spinner text="Loading instances…"/>;

  const HEADERS = [
    "Instance ID", "Service", "Type", "State", "Region",
    "Friendly Name", "Environment", "Owner", "IP Address", "Websites", "Purpose",
  ];

  return (
    <div>
      <div className="overflow-x-auto">
        <Card className="overflow-hidden min-w-[1100px]">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {HEADERS.map(h => (
                  <th key={h} className="text-left px-3 py-3 font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {instances.map((inst, i) => (
                <tr key={inst.id} className="border-b border-gray-50">
                  <td className="px-3 py-2 font-mono text-gray-500 whitespace-nowrap">{inst.id}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{inst.service}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{inst.type}</td>
                  <td className="px-3 py-2 whitespace-nowrap"><Badge text={inst.state}/></td>
                  {/* Region — auto-populated from AWS, read-only */}
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{inst.region || "—"}</td>
                  {/* Editable fields */}
                  {["label","environment","owner","ipAddress","websites","purpose"].map(field => (
                    <td key={field} className="px-3 py-2">
                      {isAdmin ? (
                        <input type="text"
                          placeholder={field === "label" ? "e.g. api-server" : field === "websites" ? "e.g. app.example.com" : field === "ipAddress" ? "e.g. 10.0.1.42" : ""}
                          value={getField(inst.id, field)}
                          onChange={e => setField(inst.id, field, e.target.value)}
                          className={FIELD_INPUT}/>
                      ) : (
                        <span className="text-gray-600">{getField(inst.id, field) || <span className="text-gray-300 italic">—</span>}</span>
                      )}
                    </td>
                  ))}
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
      </div>
      {!isAdmin && (
        <p className="text-xs text-gray-400 mt-3 text-center">Viewing only — contact admin to update tags</p>
      )}
    </div>
  );
}
