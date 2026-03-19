// frontend/src/pages/Dashboard.jsx — NOC Dark Theme
import { useState, useEffect, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { api } from "../api.js";
import { Badge, Card, SectionTitle, Btn, Modal, Spinner, EmptyState } from "../components/ui.jsx";

// Neon palette for chart lines
const PALETTE = ["#00dcff","#00ff9d","#ffb800","#ff4466","#bf7fff","#00e5ff","#ff6b35","#a8ff3e"];

const METRICS = {
  bandwidth:     { label: "Bandwidth",        unit: "GB",  color: "#00dcff", maxKey: "bandwidthMax" },
  cpu:           { label: "CPU Utilisation",  unit: "%",   color: "#00ff9d", maxKey: "cpuMax"       },
  ram:           { label: "RAM Utilisation",  unit: "%",   color: "#bf7fff", maxKey: "ramMax"       },
  disk:          { label: "Disk Utilisation", unit: "%",   color: "#ff9d00", maxKey: null           },
  costServer:    { label: "Server Cost",      unit: "$",   color: "#ff4466", maxKey: null           },
  costBandwidth: { label: "Bandwidth Cost",   unit: "$",   color: "#ffb800", maxKey: null           },
  costOther:     { label: "Other Cost",       unit: "$",   color: "#00e5ff", maxKey: null           },
};

const DATE_PRESETS = [
  { value: "week",       label: "This Week" },
  { value: "lastweek",   label: "Last Week" },
  { value: "month",      label: "This Month" },
  { value: "lastmonth",  label: "Last Month" },
  { value: "quarter",    label: "This Quarter" },
  { value: "lastquarter",label: "Last Quarter" },
  { value: "year",       label: "This Year" },
  { value: "lastyear",   label: "Last Year" },
  { value: "2years",     label: "Last 2 Years" },
  { value: "all",        label: "All Data" },
  { value: "custom",     label: "Custom…" },
];

const SIZE_ORDER = ["nano","micro","small","medium","large","xlarge","2xlarge","4xlarge","8xlarge","12xlarge","16xlarge","24xlarge","32xlarge","48xlarge","metal"];
function instSizeRank(type = "") {
  const lower = type.toLowerCase();
  for (let i = SIZE_ORDER.length - 1; i >= 0; i--) { if (lower.endsWith(SIZE_ORDER[i])) return i; }
  return -1;
}
function sortInstances(instances) {
  return [...instances].sort((a, b) => instSizeRank(b.type) - instSizeRank(a.type));
}

function dateRangeFor(preset) {
  const now  = new Date();
  const fmt  = d => d.toISOString().slice(0, 10);
  const y    = now.getFullYear();
  const m    = now.getMonth(); // 0-indexed

  // Current quarter start month (0, 3, 6, or 9)
  const qStart = Math.floor(m / 3) * 3;

  switch (preset) {
    case "week":
      return { start: fmt(new Date(y, m, now.getDate() - 7)),  end: fmt(now) };
    case "lastweek": {
      const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() - 6);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return { start: fmt(mon), end: fmt(sun) };
    }
    case "month":
      // 1st of current month → today
      return { start: fmt(new Date(y, m, 1)), end: fmt(now) };
    case "lastmonth":
      // 1st → last day of previous calendar month
      return {
        start: fmt(new Date(y, m - 1, 1)),
        end:   fmt(new Date(y, m, 0)),       // day 0 of current month = last day of prev month
      };
    case "quarter":
      // 1st of current quarter → today
      return { start: fmt(new Date(y, qStart, 1)), end: fmt(now) };
    case "lastquarter": {
      const lqs = qStart - 3;
      return {
        start: fmt(new Date(y, lqs, 1)),
        end:   fmt(new Date(y, lqs + 3, 0)),
      };
    }
    case "year":
      // 1 Jan of current year → today
      return { start: fmt(new Date(y, 0, 1)), end: fmt(now) };
    case "lastyear":
      return { start: fmt(new Date(y - 1, 0, 1)), end: fmt(new Date(y - 1, 11, 31)) };
    case "2years":
      return { start: fmt(new Date(y - 2, m, now.getDate())), end: fmt(now) };
    case "all":
      return { start: null, end: null };  // no filter — fetch everything
    default:
      return { start: fmt(new Date(y, m, 1)), end: fmt(now) };
  }
}

// Dark tooltip
function CustomTooltip({ active, payload, label, comments, getLabel }) {
  if (!active || !payload?.length) return null;
  const relevant = comments.filter(c => c.month === label);
  return (
    <div style={{
      background:"var(--bg-elevated)", border:"1px solid var(--border-bright)",
      borderRadius:4, padding:"10px 14px", minWidth:160,
      boxShadow:"var(--glow-cyan)"
    }}>
      <p style={{ fontFamily:"var(--font-mono)", fontSize:"0.65rem", color:"var(--cyan)", marginBottom:8, letterSpacing:"0.08em" }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display:"flex", justifyContent:"space-between", gap:16, marginBottom:4 }}>
          <span style={{ fontFamily:"var(--font-mono)", fontSize:"0.62rem", color: p.color }}>{getLabel(p.dataKey)}</span>
          <span style={{ fontFamily:"var(--font-display)", fontSize:"0.72rem", fontWeight:600, color:"var(--text-primary)" }}>{p.value ?? "—"}</span>
        </div>
      ))}
      {relevant.map(c => (
        <div key={c.id} style={{ marginTop:8, paddingTop:8, borderTop:"1px solid var(--border)", fontFamily:"var(--font-mono)", fontSize:"0.6rem", color:"var(--amber)" }}>
          📌 {c.body}
        </div>
      ))}
    </div>
  );
}

export default function Dashboard({ tags, getLabel, comments, onAddComment, onDeleteComment, isAdmin, accounts = [] }) {
  const [allInstances,  setAllInstances]  = useState([]);
  const [selected,      setSelected]      = useState([]);
  const [datePreset,    setDatePreset]    = useState("year");
  const [customStart,   setCustomStart]   = useState("");
  const [customEnd,     setCustomEnd]     = useState("");
  const [cache,         setCache]         = useState({});
  const [loadingInst,   setLoadingInst]   = useState(false);
  const [loadingData,   setLoadingData]   = useState(false);
  const [commentModal,  setCommentModal]  = useState(null);
  const [newComment,    setNewComment]    = useState({ metric: "cpu", month: "", body: "" });

  const [filterEnv,     setFilterEnv]     = useState("");
  const [filterOwner,   setFilterOwner]   = useState("");
  const [filterRegion,  setFilterRegion]  = useState("");
  const [filterType,    setFilterType]    = useState("");
  const [filterWebsite, setFilterWebsite] = useState("");
  const [filterAccount, setFilterAccount] = useState("");
  const [showPeak,      setShowPeak]      = useState(false);  // toggle Average vs Peak

  const range = datePreset === "custom"
    ? { start: customStart, end: customEnd }
    : dateRangeFor(datePreset);
  // "All Data" has null start/end — fetch without date filter
  const hasRange = range.start && range.end;

  useEffect(() => {
    setLoadingInst(true);
    api.instances().then(data => setAllInstances(sortInstances(data))).catch(console.error).finally(() => setLoadingInst(false));
  }, []);

  const filterOptions = useMemo(() => {
    const envs = new Set(), owners = new Set(), regions = new Set(), types = new Set();
    allInstances.forEach(inst => {
      const t = tags[inst.id] || {};
      if (t.environment) envs.add(t.environment);
      if (t.owner)       owners.add(t.owner);
      if (inst.region)   regions.add(inst.region);
      if (inst.type)     types.add(inst.type);
    });
    return {
      envs:    [...envs].sort(),
      owners:  [...owners].sort(),
      regions: [...regions].sort(),
      types:   [...types].sort((a,b) => instSizeRank(b) - instSizeRank(a)),
    };
  }, [allInstances, tags]);

  const visibleInstances = useMemo(() => {
    return allInstances.filter(inst => {
      const t = tags[inst.id] || {};
      if (filterEnv     && (t.environment||"") !== filterEnv)    return false;
      if (filterOwner   && (t.owner      ||"") !== filterOwner)  return false;
      if (filterRegion  && (inst.region  ||"") !== filterRegion) return false;
      if (filterType    && (inst.type    ||"") !== filterType)   return false;
      if (filterAccount && String(inst.accountId) !== String(filterAccount)) return false;
      if (filterWebsite) { const s=(t.websites||"").toLowerCase(); if (!s.includes(filterWebsite.toLowerCase())) return false; }
      return true;
    });
  }, [allInstances, tags, filterEnv, filterOwner, filterRegion, filterType, filterWebsite, filterAccount]);

  useEffect(() => {
    const ids = new Set(visibleInstances.map(i => i.id));
    setSelected(prev => prev.filter(i => ids.has(i.id)));
  }, [visibleInstances]);

  useEffect(() => {
    if (!selected.length) return;
    if (datePreset === 'custom' && (!range.start || !range.end)) return;
    const missing = selected.filter(i => !cache[i.id]);
    if (!missing.length) return;
    setLoadingData(true);
    Promise.all(missing.map(inst => api.daily(inst.id, range.start || '', range.end || '').then(data => ({ id: inst.id, data })).catch(() => ({ id: inst.id, data: [] }))))
      .then(results => {
        const numFields = ["bandwidth","bandwidthMax","cpu","cpuMax","ram","ramMax","disk","diskMax","costServer","costBandwidth","costOther"];
        const patch = {};
        results.forEach(r => { patch[r.id] = r.data.map(row => { const c={...row}; numFields.forEach(f => { c[f]=row[f]!=null?Number(row[f]):null; }); return c; }); });
        setCache(prev => ({ ...prev, ...patch }));
      }).finally(() => setLoadingData(false));
  }, [selected, range.start, range.end]);

  useEffect(() => { setCache({}); }, [range.start, range.end, datePreset]);

  function toggleInst(inst) {
    setSelected(prev => prev.find(i => i.id === inst.id) ? prev.filter(i => i.id !== inst.id) : [...prev, inst]);
  }

  function buildChartData(metric) {
    const dateSet = new Set();
    selected.forEach(inst => (cache[inst.id]||[]).forEach(d => dateSet.add(d.date)));
    const metaKey = showPeak && METRICS[metric]?.maxKey ? METRICS[metric].maxKey : metric;
    return Array.from(dateSet).sort().map(date => {
      const row = { date };
      selected.forEach(inst => {
        const d = (cache[inst.id]||[]).find(x => x.date === date);
        row[inst.id] = d ? (Number(d[metaKey]) ?? null) : null;
      });
      return row;
    });
  }

  const availableDates  = [...new Set(selected.flatMap(inst => (cache[inst.id]||[]).map(d=>d.date)))].sort();

  async function submitComment() {
    if (!newComment.month || !newComment.body) return;
    await onAddComment({ instanceId: selected[0]?.id, metric: newComment.metric, month: newComment.month, body: newComment.body });
    setCommentModal(null);
    setNewComment({ metric: "cpu", month: "", body: "" });
  }

  const n = selected.length || 1;
  const totals = selected.reduce((acc, inst) => {
    const data = cache[inst.id]||[]; const last = data[data.length-1]||{};
    acc.costServer    = (acc.costServer   ||0)+(Number(last.costServer)   ||0);
    acc.costBandwidth = (acc.costBandwidth||0)+(Number(last.costBandwidth)||0);
    acc.cpu           = (acc.cpu          ||0)+(Number(last.cpu)          ||0);
    return acc;
  }, {});

  function clearFilters() { setFilterEnv(""); setFilterOwner(""); setFilterRegion(""); setFilterType(""); setFilterWebsite(""); setFilterAccount(""); }
  const hasFilters = filterEnv||filterOwner||filterRegion||filterType||filterWebsite||filterAccount;

  // ── Metric chart ────────────────────────────────────────────────────────────
  function MetricChart({ metric }) {
    const meta = METRICS[metric];
    const data = buildChartData(metric);
    const selectedIds   = new Set(selected.map(i => i.id));
    const instComments  = comments.filter(c => c.metric === metric && selectedIds.has(c.instance_id));
    const commentMonths = [...new Set(instComments.map(c => c.month))];

    // Check which selected instances have no data for this range
    const noDataInstances = selected.filter(inst => {
      const rows = cache[inst.id] || [];
      // If still loading, don't flag as no-data
      if (loadingData) return false;
      // Check if any row has a non-null value for this metric
      return rows.length === 0 || rows.every(row => row[metric] == null || row[metric] === 0);
    });
    const hasAnyData = data.length > 0 && data.some(row =>
      selected.some(inst => row[inst.id] != null)
    );

    return (
      <div className="chart-card noc-card-corner">
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1rem" }}>
          <div>
            <div className="chart-title" style={{ color: meta.color }}>{meta.label}</div>
            <div className="chart-unit">{meta.unit === "$" ? "USD · Monthly (spread daily)" : `${meta.unit} · Daily · ${showPeak && meta.maxKey ? "Peak" : "Average"}`}</div>
          </div>
          {isAdmin && (
            <button onClick={() => { setCommentModal({ metric }); setNewComment(c => ({ ...c, metric })); }}
              style={{ background:"none", border:"1px solid rgba(255,184,0,0.25)", borderRadius:3, padding:"4px 10px",
                fontFamily:"var(--font-mono)", fontSize:"0.58rem", letterSpacing:"0.08em", color:"var(--amber)",
                cursor:"pointer", transition:"var(--transition)" }}>
              📌 annotate
            </button>
          )}
        </div>

        {/* No data state — shown instead of blank chart */}
        {!hasAnyData && !loadingData ? (
          <div style={{
            height: 200, display:"flex", flexDirection:"column",
            alignItems:"center", justifyContent:"center", gap:8,
            border:"1px dashed var(--border)", borderRadius:4,
          }}>
            <span style={{ fontFamily:"var(--font-mono)", fontSize:"0.65rem", color:"var(--text-muted)", letterSpacing:"0.1em" }}>
              NO DATA FOR THIS PERIOD
            </span>
            {noDataInstances.length > 0 && noDataInstances.length < selected.length && (
              <span style={{ fontFamily:"var(--font-mono)", fontSize:"0.58rem", color:"var(--text-muted)", opacity:0.6 }}>
                {noDataInstances.map(i => getLabel(i.id)).join(", ")} — no readings recorded
              </span>
            )}
            {noDataInstances.length === selected.length && (
              <span style={{ fontFamily:"var(--font-mono)", fontSize:"0.58rem", color:"var(--text-muted)", opacity:0.6 }}>
                Instance may have been stopped, or metric not collected for this period
              </span>
            )}
          </div>
        ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              {selected.map((inst, idx) => (
                <linearGradient key={inst.id} id={`g${metric}${idx}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={PALETTE[idx % PALETTE.length]} stopOpacity={0.25}/>
                  <stop offset="95%" stopColor={PALETTE[idx % PALETTE.length]} stopOpacity={0}/>
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,220,255,0.06)"/>
            <XAxis dataKey="date" tick={{ fontFamily:"var(--font-mono)", fontSize:10, fill:"#4d7a96" }} axisLine={false} tickLine={false}/>
            <YAxis tick={{ fontFamily:"var(--font-mono)", fontSize:10, fill:"#4d7a96" }} axisLine={false} tickLine={false} width={44}
              tickFormatter={v => meta.unit === "$" ? `$${v}` : `${v}`}/>
            <Tooltip content={<CustomTooltip comments={instComments} getLabel={getLabel}/>}/>
            <Legend formatter={v => <span style={{ fontFamily:"var(--font-mono)", fontSize:"0.6rem", color:"var(--text-secondary)" }}>{getLabel(v)}</span>}
              iconType="circle" iconSize={6}/>
            {commentMonths.map(m => (
              <ReferenceLine key={m} x={m} stroke="var(--amber)" strokeDasharray="3 3"
                label={{ value:"📌", fontSize:10, fill:"var(--amber)", position:"top" }}/>
            ))}
            {selected.map((inst, idx) => (
              <Area key={inst.id} type="monotone" dataKey={inst.id} name={inst.id}
                stroke={PALETTE[idx % PALETTE.length]} strokeWidth={1.5}
                fill={`url(#g${metric}${idx})`} dot={false}
                activeDot={{ r:3, strokeWidth:0, fill: PALETTE[idx % PALETTE.length] }}/>
            ))}
          </AreaChart>
        </ResponsiveContainer>
        )} {/* end no-data conditional */}
        {instComments.length > 0 && (
          <div style={{ marginTop:10, paddingTop:10, borderTop:"1px solid var(--border)" }}>
            {instComments.map(c => (
              <div key={c.id} style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                <span style={{ fontFamily:"var(--font-mono)", fontSize:"0.6rem", color:"var(--amber)" }}>
                  📌 <span style={{ color:"var(--text-muted)" }}>{c.month}</span> — {c.body}
                </span>
                {isAdmin && (
                  <button onClick={() => onDeleteComment(c.id)}
                    style={{ background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", fontSize:"0.7rem", padding:"0 4px" }}>✕</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const selInput = `noc-input`;

  return (
    <div>
      {/* Filter bar */}
      <div style={{ background:"var(--bg-surface)", border:"1px solid var(--border)", borderRadius:6, padding:"0.75rem 1rem", marginBottom:"1.25rem" }}>
        <div style={{ display:"flex", flexWrap:"wrap", gap:"0.75rem", alignItems:"flex-end" }}>
          {[
            { label:"Date Range", value:datePreset, set:setDatePreset, opts:DATE_PRESETS.map(p=>({v:p.value,l:p.label})) },
            ...(filterOptions.envs.length    ? [{ label:"Environment", value:filterEnv,    set:setFilterEnv,    opts:filterOptions.envs.map(v=>({v,l:v})) }] : []),
            ...(filterOptions.owners.length  ? [{ label:"Owner",       value:filterOwner,  set:setFilterOwner,  opts:filterOptions.owners.map(v=>({v,l:v})) }] : []),
            ...(filterOptions.regions.length ? [{ label:"Region",      value:filterRegion, set:setFilterRegion, opts:filterOptions.regions.map(v=>({v,l:v})) }] : []),
            ...(filterOptions.types.length   ? [{ label:"Type",        value:filterType,   set:setFilterType,   opts:filterOptions.types.map(v=>({v,l:v})) }] : []),
            ...(accounts.length > 1          ? [{ label:"Account",     value:filterAccount,set:setFilterAccount,opts:accounts.map(a=>({v:String(a.id),l:a.display_name})) }] : []),
          ].map(f => (
            <div key={f.label} style={{ minWidth:130 }}>
              <label className="noc-label">{f.label}</label>
              <select value={f.value} onChange={e => f.set(e.target.value)} className={selInput}>
                <option value="">All</option>
                {f.opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
          ))}
          {datePreset === "custom" && (
            <>
              <div><label className="noc-label">Start</label><input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)} className={selInput}/></div>
              <div><label className="noc-label">End</label><input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)} className={selInput}/></div>
            </>
          )}
          <div style={{ minWidth:150 }}>
            <label className="noc-label">Website Search</label>
            <input type="text" placeholder="filter by website…" value={filterWebsite} onChange={e=>setFilterWebsite(e.target.value)} className={selInput}/>
          </div>
          {hasFilters && (
            <div style={{ alignSelf:"flex-end" }}>
              <button onClick={clearFilters} className="noc-btn noc-btn-ghost" style={{ padding:"7px 12px", fontSize:"0.65rem" }}>
                Clear ×
              </button>
            </div>
          )}
          {loadingData && <span style={{ alignSelf:"center", fontFamily:"var(--font-mono)", fontSize:"0.6rem", color:"var(--cyan-dim)", letterSpacing:"0.1em" }}>Fetching…</span>}
          <div style={{ alignSelf:"flex-end" }}>
            <label className="noc-label">View Mode</label>
            <button onClick={() => setShowPeak(p => !p)}
              className={`noc-btn ${showPeak ? "noc-btn-primary" : "noc-btn-ghost"}`}
              style={{ padding:"7px 14px", fontSize:"0.68rem" }}>
              {showPeak ? "⬆ Peak" : "∿ Average"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ display:"flex", gap:"1.25rem" }}>
        {/* Sidebar */}
        <div style={{ width:220, flexShrink:0 }}>
          <div className="noc-card" style={{ padding:"0.875rem" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"0.75rem" }}>
              <span className="noc-section-title" style={{ margin:0 }}>
                Instances
                {visibleInstances.length !== allInstances.length && (
                  <span style={{ color:"var(--cyan)", marginLeft:4 }}>({visibleInstances.length})</span>
                )}
              </span>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={() => setSelected(visibleInstances)} style={{ background:"none", border:"none", cursor:"pointer", fontFamily:"var(--font-mono)", fontSize:"0.6rem", color:"var(--cyan)", letterSpacing:"0.06em" }}>ALL</button>
                <button onClick={() => setSelected([])} style={{ background:"none", border:"none", cursor:"pointer", fontFamily:"var(--font-mono)", fontSize:"0.6rem", color:"var(--text-muted)", letterSpacing:"0.06em" }}>CLR</button>
              </div>
            </div>

            <div style={{ overflowY:"auto", maxHeight:"calc(100vh - 280px)" }}>
              {loadingInst ? <Spinner text="Loading…"/> :
               !visibleInstances.length ? (
                <p style={{ fontFamily:"var(--font-mono)", fontSize:"0.6rem", color:"var(--text-muted)", textAlign:"center", padding:"1rem 0", letterSpacing:"0.08em" }}>
                  No instances
                </p>
              ) : (
                [...visibleInstances].sort((a,b) => {
                  const as = !!selected.find(i=>i.id===a.id) ? 1 : 0;
                  const bs = !!selected.find(i=>i.id===b.id) ? 1 : 0;
                  return bs - as;
                }).map((inst) => {
                  const sel = !!selected.find(i => i.id === inst.id);
                  const globalIdx = allInstances.findIndex(i => i.id === inst.id);
                  const dotColor = PALETTE[globalIdx % PALETTE.length];
                  const t = tags[inst.id] || {};
                  const displayName = t.label
                    ? (t.environment ? `${t.label} — ${t.environment.toUpperCase()}` : t.label)
                    : inst.id.slice(0,18)+"…";
                  return (
                    <button key={inst.id} onClick={() => toggleInst(inst)}
                      className={`inst-item ${sel ? "selected" : ""}`}
                      style={sel ? { borderLeftColor: dotColor } : {}}>
                      <span className="inst-dot" style={{ background: sel ? dotColor : "var(--text-muted)", color: dotColor }}/>
                      <div style={{ minWidth:0 }}>
                        <div className="inst-name" style={sel ? { color: dotColor } : {}}>
                          {t.label
                            ? displayName
                            : <span style={{ fontFamily:"var(--font-mono)", fontSize:"0.58rem", color:"var(--text-muted)" }}>{displayName}</span>
                          }
                        </div>
                        <div className="inst-meta">{inst.type}</div>
                        <div className="inst-meta">{inst.region}</div>
                        {accounts.length > 1 && inst.accountName && (
                          <div className="inst-meta" style={{ color:"rgba(0,220,255,0.3)", fontSize:"0.55rem" }}>{inst.accountName}</div>
                        )}
                        <div style={{ marginTop:3 }}><Badge text={inst.state}/></div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Charts */}
        <div style={{ flex:1, minWidth:0 }}>
          {!selected.length ? (
            <EmptyState icon="◈" message="Select instances to view telemetry"/>
          ) : (
            <>
              {/* Summary row */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"0.75rem", marginBottom:"1.25rem" }}>
                {[
                  { label:"Server Cost // Last Month", value:`$${totals.costServer?.toFixed(2)||"0.00"}`,  color:"#ff4466" },
                  { label:"Bandwidth Cost",             value:`$${totals.costBandwidth?.toFixed(2)||"0.00"}`, color:"#ffb800" },
                  { label:"Avg CPU Utilisation",        value:`${(totals.cpu/n).toFixed(1)||"0.0"}%`,     color:"#00ff9d" },
                ].map(c => (
                  <div key={c.label} className="metric-card noc-card-corner">
                    <div className="metric-label">{c.label}</div>
                    <div className="metric-value" style={{ color: c.color, textShadow:`0 0 20px ${c.color}66` }}>{c.value}</div>
                  </div>
                ))}
              </div>

              <SectionTitle>Live Telemetry // Monthly</SectionTitle>
              {Object.keys(METRICS).map(m => <MetricChart key={m} metric={m}/>)}
            </>
          )}
        </div>
      </div>

      {/* Comment modal */}
      {commentModal && (
        <Modal title="📌 Annotate Chart" onClose={() => setCommentModal(null)}>
          <div style={{ display:"flex", flexDirection:"column", gap:"0.875rem", marginBottom:"1.25rem" }}>
            <div>
              <label className="noc-label">Metric</label>
              <select value={newComment.metric} onChange={e => setNewComment(c=>({...c,metric:e.target.value}))} className="noc-input">
                {Object.entries(METRICS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="noc-label">Month</label>
              <select value={newComment.month} onChange={e => setNewComment(c=>({...c,month:e.target.value}))} className="noc-input">
                <option value="">— Select —</option>
                {availableDates.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="noc-label">Annotation</label>
              <textarea rows={3} value={newComment.body} onChange={e => setNewComment(c=>({...c,body:e.target.value}))}
                placeholder="e.g. Traffic spike from product launch"
                className="noc-input" style={{ resize:"none" }}/>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
            <Btn variant="ghost" onClick={() => setCommentModal(null)}>Cancel</Btn>
            <Btn variant="amber" onClick={submitComment}>Save Annotation</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
