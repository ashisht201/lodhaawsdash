// frontend/src/pages/AlertsPage.jsx
import { useState, useEffect } from "react";
import { api } from "../api.js";
import { Card, Badge, Btn, Modal, Select, EmptyState } from "../components/ui.jsx";

const METRICS = {
  cpu:           { label: "CPU Utilisation", unit: "%" },
  ram:           { label: "RAM Utilisation", unit: "%" },
  bandwidth:     { label: "Bandwidth",       unit: "GB" },
  costServer:    { label: "Server Cost",     unit: "$"  },
  costBandwidth: { label: "Bandwidth Cost",  unit: "$"  },
  costOther:     { label: "Other Cost",      unit: "$"  },
};

const blank = { instanceId: "", name: "", metric: "cpu", condition: ">", threshold: "", email: "" };

export default function AlertsPage({ tags, isAdmin, showToast }) {
  const [alerts,    setAlerts]    = useState([]);
  const [instances, setInstances] = useState([]);
  const [modal,     setModal]     = useState(false);
  const [form,      setForm]      = useState(blank);

  useEffect(() => {
    api.getAlerts().then(setAlerts).catch(console.error);
    api.instances().then(setInstances).catch(console.error);
  }, []);

  const getLabel = id => (typeof tags[id] === 'object' ? tags[id]?.label : tags[id]) || id;
  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }));

  async function create() {
    if (!form.instanceId || !form.name || !form.threshold || !form.email) {
      showToast("Please fill all fields.", "err"); return;
    }
    try {
      const a = await api.createAlert(form);
      setAlerts(prev => [a, ...prev]);
      setModal(false); setForm(blank);
      showToast("Alert created.");
    } catch (e) { showToast(e.message, "err"); }
  }

  async function toggle(alert) {
    try {
      const updated = await api.toggleAlert(alert.id, !alert.active);
      setAlerts(prev => prev.map(a => a.id === alert.id ? updated : a));
    } catch (e) { showToast(e.message, "err"); }
  }

  async function remove(id) {
    try {
      await api.deleteAlert(id);
      setAlerts(prev => prev.filter(a => a.id !== id));
      showToast("Alert deleted.");
    } catch (e) { showToast(e.message, "err"); }
  }

  return (
    <div>
      {isAdmin && (
        <div className="flex justify-end mb-5">
          <Btn onClick={() => setModal(true)}>+ New Alert</Btn>
        </div>
      )}

      {!alerts.length
        ? <EmptyState icon="🔔" message="No alerts configured yet"/>
        : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {["Name","Instance","Metric","Condition","Email","Status",""].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alerts.map((a, i) => (
                  <tr key={a.id} className="border-b border-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-700">{a.name}</td>
                    <td className="px-5 py-3 text-xs text-gray-500 font-mono">{getLabel(a.instance_id)}</td>
                    <td className="px-5 py-3 text-gray-600">{METRICS[a.metric]?.label}</td>
                    <td className="px-5 py-3">
                      <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs">
                        {a.condition} {a.threshold}{METRICS[a.metric]?.unit}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">{a.email}</td>
                    <td className="px-5 py-3">
                      {isAdmin
                        ? (
                          <button onClick={() => toggle(a)}
                            className={`text-xs px-2 py-0.5 rounded border font-medium transition-colors ${a.active ? "bg-green-50 text-green-600 border-green-200 hover:bg-green-100" : "bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200"}`}>
                            {a.active ? "active" : "paused"}
                          </button>
                        )
                        : <Badge text={a.active ? "active" : "stopped"}/>
                      }
                    </td>
                    <td className="px-5 py-3">
                      {isAdmin && (
                        <button onClick={() => remove(a.id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      }

      {modal && (
        <Modal title="🔔 New Alert" onClose={() => { setModal(false); setForm(blank); }}>
          <div className="space-y-3 mb-5">
            <div>
              <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wider">Alert Name</label>
              <input type="text" placeholder="e.g. High CPU on api-server" value={form.name} onChange={set("name")}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"/>
            </div>
            <Select label="Instance" value={form.instanceId} onChange={set("instanceId")}>
              <option value="">— Select —</option>
              {instances.map(i => <option key={i.id} value={i.id}>{getLabel(i.id)} ({i.service})</option>)}
            </Select>
            <div className="grid grid-cols-3 gap-3">
              <Select label="Metric" value={form.metric} onChange={set("metric")}>
                {Object.entries(METRICS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
              <Select label="When" value={form.condition} onChange={set("condition")}>
                {[">","<",">=","<="].map(c => <option key={c}>{c}</option>)}
              </Select>
              <div>
                <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wider">Value</label>
                <input type="number" placeholder="80" value={form.threshold} onChange={set("threshold")}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"/>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wider">Alert Email</label>
              <input type="email" placeholder="you@company.com" value={form.email} onChange={set("email")}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"/>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="ghost" onClick={() => { setModal(false); setForm(blank); }}>Cancel</Btn>
            <Btn onClick={create}>Create Alert</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
