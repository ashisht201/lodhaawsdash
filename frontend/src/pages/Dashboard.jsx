// frontend/src/pages/Dashboard.jsx
import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { api } from "../api.js";
import { Badge, Card, SectionTitle, Select, Btn, Modal, Spinner, EmptyState } from "../components/ui.jsx";

const PALETTE = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#06B6D4","#F97316","#84CC16"];

const METRICS = {
  bandwidth:     { label: "Bandwidth",        unit: "GB" },
  cpu:           { label: "CPU Utilisation",  unit: "%" },
  ram:           { label: "RAM Utilisation",  unit: "%" },
  costServer:    { label: "Server Cost",      unit: "$" },
  costBandwidth: { label: "Bandwidth Cost",   unit: "$" },
  costOther:     { label: "Other Cost",       unit: "$" },
};

const DATE_PRESETS = [
  { value: "week",      label: "This week" },
  { value: "lastweek",  label: "Last week" },
  { value: "month",     label: "This month" },
  { value: "lastmonth", label: "Last month" },
  { value: "quarter",   label: "This quarter" },
  { value: "year",      label: "This year" },
  { value: "custom",    label: "Custom…" },
];

function dateRangeFor(preset) {
  const now = new Date(); const fmt = d => d.toISOString().slice(0,10);
  const s = new Date(now);
  switch (preset) {
    case "week":      s.setDate(now.getDate()-7);            break;
    case "lastweek":  s.setDate(now.getDate()-14);           break;
    case "month":     s.setMonth(now.getMonth()-1);          break;
    case "lastmonth": s.setMonth(now.getMonth()-2);          break;
    case "quarter":   s.setMonth(now.getMonth()-3);          break;
    case "year":      s.setFullYear(now.getFullYear()-1);    break;
    default:          s.setMonth(now.getMonth()-1);
  }
  return { start: fmt(s), end: fmt(now) };
}

function CustomTooltip({ active, payload, label, comments }) {
  if (!active || !payload?.length) return null;
  const relevant = comments.filter(c => c.month === label);
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs min-w-[160px]">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex justify-between gap-4 mb-1">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-medium text-gray-800">{p.value ?? "—"}</span>
        </div>
      ))}
      {relevant.map(c => (
        <div key={c.id} className="mt-2 pt-2 border-t border-amber-100">
          <p className="text-amber-600">📌 {c.body}</p>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard({ tags, comments, onAddComment, onDeleteComment, isAdmin }) {
  const [instances,    setInstances]    = useState([]);
  const [selected,     setSelected]     = useState([]);   // array of instance objects
  const [datePreset,   setDatePreset]   = useState("year");
  const [customStart,  setCustomStart]  = useState("");
  const [customEnd,    setCustomEnd]    = useState("");
  const [cache,        setCache]        = useState({});   // instanceId -> monthly data[]
  const [loadingInst,  setLoadingInst]  = useState(false);
  const [loadingData,  setLoadingData]  = useState(false);
  const [commentModal, setCommentModal] = useState(null); // { metric }
  const [newComment,   setNewComment]   = useState({ metric: "cpu", month: "", body: "" });

  const range = datePreset === "custom"
    ? { start: customStart, end: customEnd }
    : dateRangeFor(datePreset);

  const getLabel = id => tags[id] || id;

  // Load instance list once
  useEffect(() => {
    setLoadingInst(true);
    api.instances()
      .then(setInstances)
      .catch(console.error)
      .finally(() => setLoadingInst(false));
  }, []);

  // Fetch metrics for newly selected instances
  useEffect(() => {
    if (!selected.length || !range.start || !range.end) return;
    const missing = selected.filter(i => !cache[i.id]);
    if (!missing.length) return;
    setLoadingData(true);
    Promise.all(
      missing.map(inst =>
        api.monthly(inst.id, range.start, range.end)
           .then(data => ({ id: inst.id, data }))
           .catch(() => ({ id: inst.id, data: [] }))
      )
    ).then(results => {
      const patch = {};
      const numFields = ["bandwidth","cpu","ram","costServer","costBandwidth","costOther"];
      results.forEach(r => {
        patch[r.id] = r.data.map(row => {
          const clean = { ...row };
          numFields.forEach(f => { clean[f] = row[f] != null ? Number(row[f]) : null; });
          return clean;
        });
      });
      setCache(prev => ({ ...prev, ...patch }));
    }).finally(() => setLoadingData(false));
  }, [selected, range.start, range.end]);

  // Invalidate cache when date range changes
  useEffect(() => { setCache({}); }, [range.start, range.end]);

  function toggleInst(inst) {
    setSelected(prev =>
      prev.find(i => i.id === inst.id)
        ? prev.filter(i => i.id !== inst.id)
        : [...prev, inst]
    );
  }

  function buildChartData(metric) {
    const monthSet = new Set();
    selected.forEach(inst => (cache[inst.id] || []).forEach(d => monthSet.add(d.month)));
    return Array.from(monthSet).sort().map(month => {
      const row = { month };
      selected.forEach(inst => {
        const d = (cache[inst.id] || []).find(x => x.month === month);
        row[inst.id] = d ? d[metric] : null;
      });
      return row;
    });
  }

  // Available months from loaded data (for comment modal)
  const availableMonths = [...new Set(
    selected.flatMap(inst => (cache[inst.id] || []).map(d => d.month))
  )].sort();

  async function submitComment() {
    if (!newComment.month || !newComment.body) return;
    await onAddComment({
      instanceId: selected[0]?.id,
      metric: newComment.metric,
      month: newComment.month,
      body: newComment.body,
    });
    setCommentModal(null);
    setNewComment({ metric: "cpu", month: "", body: "" });
  }

  // Summary totals from last data point
  const totals = selected.reduce((acc, inst) => {
    const data = cache[inst.id] || [];
    const last = data[data.length - 1] || {};
    acc.costServer    = (acc.costServer    || 0) + (Number(last.costServer)    || 0);
    acc.costBandwidth = (acc.costBandwidth || 0) + (Number(last.costBandwidth) || 0);
    acc.cpu           = (acc.cpu           || 0) + (Number(last.cpu)           || 0);
    return acc;
  }, {});
  const n = selected.length || 1;

  // ── Sub-component: one metric chart ──────────────────────────────────────
  function MetricChart({ metric }) {
    const meta = METRICS[metric];
    const data = buildChartData(metric);
    const instComments = comments.filter(c => c.metric === metric);
    const commentMonths = [...new Set(instComments.map(c => c.month))];

    return (
      <Card className="p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">{meta.label}</h3>
            <p className="text-xs text-gray-400">{meta.unit === "$" ? "USD" : meta.unit} · Monthly</p>
          </div>
          {isAdmin && (
            <button onClick={() => { setCommentModal({ metric }); setNewComment(c => ({ ...c, metric })); }}
              className="text-xs text-gray-400 hover:text-amber-500 transition-colors flex items-center gap-1">
              📌 Add comment
            </button>
          )}
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              {selected.map((inst, idx) => (
                <linearGradient key={inst.id} id={`g${metric}${idx}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={PALETTE[idx % PALETTE.length]} stopOpacity={0.15}/>
                  <stop offset="95%" stopColor={PALETTE[idx % PALETTE.length]} stopOpacity={0}/>
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6"/>
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false}/>
            <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={44}
              tickFormatter={v => meta.unit === "$" ? `$${v}` : `${v}${meta.unit}`}/>
            <Tooltip content={<CustomTooltip comments={instComments}/>}/>
            <Legend formatter={v => <span className="text-xs text-gray-600">{getLabel(v)}</span>}
              iconType="circle" iconSize={8}/>
            {commentMonths.map(m => (
              <ReferenceLine key={m} x={m} stroke="#F59E0B" strokeDasharray="4 4"
                label={{ value: "📌", fontSize: 12, fill: "#F59E0B", position: "top" }}/>
            ))}
            {selected.map((inst, idx) => (
              <Area key={inst.id} type="monotone" dataKey={inst.id} name={getLabel(inst.id)}
                stroke={PALETTE[idx % PALETTE.length]} strokeWidth={2}
                fill={`url(#g${metric}${idx})`} dot={false} activeDot={{ r: 4, strokeWidth: 0 }}/>
            ))}
          </AreaChart>
        </ResponsiveContainer>
        {/* Comments list under chart */}
        {instComments.length > 0 && (
          <div className="mt-3 space-y-1 border-t border-gray-50 pt-3">
            {instComments.map(c => (
              <div key={c.id} className="flex items-start justify-between gap-2 text-xs text-gray-500">
                <span>📌 <span className="font-medium text-amber-600">{c.month}</span> — {c.body}</span>
                {isAdmin && (
                  <button onClick={() => onDeleteComment(c.id)}
                    className="text-gray-300 hover:text-red-400 shrink-0">✕</button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    );
  }

  return (
    <div>
      {/* Controls */}
      <Card className="p-4 mb-5 flex flex-wrap gap-4 items-end">
        <div className="min-w-[180px]">
          <Select label="Date Range" value={datePreset} onChange={e => setDatePreset(e.target.value)}>
            {DATE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
        </div>
        {datePreset === "custom" && (
          <>
            <div>
              <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wider">Start</label>
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"/>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wider">End</label>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"/>
            </div>
          </>
        )}
        {loadingData && <p className="text-xs text-gray-400 self-center animate-pulse">Fetching AWS data…</p>}
      </Card>

      <div className="flex gap-5">
        {/* Instance sidebar */}
        <div className="w-60 shrink-0">
          <Card className="p-4 sticky top-4">
            <div className="flex items-center justify-between mb-3">
              <SectionTitle>Instances</SectionTitle>
              <div className="flex gap-2 text-xs">
                <button onClick={() => setSelected(instances)} className="text-blue-500 hover:underline">All</button>
                <button onClick={() => setSelected([])} className="text-gray-400 hover:underline">None</button>
              </div>
            </div>
            {loadingInst
              ? <Spinner text="Loading…"/>
              : !instances.length
                ? <p className="text-xs text-gray-400">No instances found</p>
                : instances.map((inst, idx) => {
                    const sel = !!selected.find(i => i.id === inst.id);
                    return (
                      <button key={inst.id} onClick={() => toggleInst(inst)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-xs mb-1 flex items-start gap-2 transition-all ${sel ? "bg-blue-50 border border-blue-200" : "bg-gray-50 border border-transparent hover:bg-gray-100"}`}>
                        <span className="mt-0.5 w-2 h-2 rounded-full shrink-0"
                          style={{ background: sel ? PALETTE[instances.indexOf(inst) % PALETTE.length] : "#D1D5DB" }}/>
                        <div className="min-w-0">
                          <p className={`font-medium truncate ${sel ? "text-blue-700" : "text-gray-700"}`}>
                            {tags[inst.id]
                              ? tags[inst.id]
                              : <span className="font-mono text-gray-500 text-[10px]">{inst.id.slice(0, 19)}…</span>
                            }
                          </p>
                          <p className="text-gray-400 mt-0.5">{inst.service} · {inst.type}</p>
                          <div className="mt-1"><Badge text={inst.state}/></div>
                        </div>
                      </button>
                    );
                  })
            }
          </Card>
        </div>

        {/* Charts area */}
        <div className="flex-1 min-w-0">
          {!selected.length
            ? <EmptyState icon="📊" message="Select one or more instances to view metrics"/>
            : (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {[
                    { label: "Server Cost (last mo.)", value: `$${totals.costServer?.toFixed(2)||"0.00"}` },
                    { label: "Bandwidth Cost",         value: `$${totals.costBandwidth?.toFixed(2)||"0.00"}` },
                    { label: "Avg CPU",                value: `${(totals.cpu/n).toFixed(1)||"—"}%` },
                  ].map(c => (
                    <Card key={c.label} className="p-4">
                      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{c.label}</p>
                      <p className="text-2xl font-light text-gray-800">{c.value}</p>
                    </Card>
                  ))}
                </div>
                <SectionTitle>Performance & Cost — Monthly</SectionTitle>
                {Object.keys(METRICS).map(m => <MetricChart key={m} metric={m}/>)}
              </>
            )
          }
        </div>
      </div>

      {/* Comment modal */}
      {commentModal && (
        <Modal title="📌 Add Chart Comment" onClose={() => setCommentModal(null)}>
          <div className="space-y-3 mb-5">
            <div>
              <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wider">Metric</label>
              <select value={newComment.metric} onChange={e => setNewComment(c => ({ ...c, metric: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100">
                {Object.entries(METRICS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wider">Month</label>
              <select value={newComment.month} onChange={e => setNewComment(c => ({ ...c, month: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100">
                <option value="">— Select month —</option>
                {availableMonths.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wider">Note</label>
              <textarea rows={3} value={newComment.body} onChange={e => setNewComment(c => ({ ...c, body: e.target.value }))}
                placeholder="e.g. Traffic spike from product launch"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none"/>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="ghost" onClick={() => setCommentModal(null)}>Cancel</Btn>
            <Btn variant="amber" onClick={submitComment}>Save Comment</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
