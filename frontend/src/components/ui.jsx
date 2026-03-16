// frontend/src/components/ui.jsx — NOC Dark Theme

export function Badge({ text }) {
  const cls = {
    running:   "badge-running",
    stopped:   "badge-stopped",
    available: "badge-available",
    active:    "badge-active",
    admin:     "badge-admin",
    viewer:    "badge-viewer",
  };
  return <span className={`noc-badge ${cls[text] || "badge-stopped"}`}>{text}</span>;
}

export function Card({ children, className = "" }) {
  return <div className={`noc-card ${className}`}>{children}</div>;
}

export function SectionTitle({ children }) {
  return <p className="noc-section-title">{children}</p>;
}

export function Input({ label, ...props }) {
  return (
    <div>
      {label && <label className="noc-label">{label}</label>}
      <input {...props} className="noc-input"/>
    </div>
  );
}

export function Select({ label, children, ...props }) {
  return (
    <div>
      {label && <label className="noc-label">{label}</label>}
      <select {...props} className="noc-input">{children}</select>
    </div>
  );
}

export function Btn({ children, variant = "primary", className = "", ...props }) {
  const v = {
    primary: "noc-btn-primary",
    danger:  "noc-btn-danger",
    ghost:   "noc-btn-ghost",
    amber:   "noc-btn-amber",
    dark:    "noc-btn-dark",
  };
  return (
    <button {...props} className={`noc-btn ${v[variant] || "noc-btn-primary"} ${className}`}>
      {children}
    </button>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="noc-modal-overlay" onClick={onClose}>
      <div className="noc-modal" onClick={e => e.stopPropagation()}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1.25rem" }}>
          <h3 className="noc-modal-title" style={{margin:0}}>{title}</h3>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", fontSize:"1.2rem", lineHeight:1, padding:"2px 6px" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`noc-toast ${toast.type === "err" ? "noc-toast-err" : "noc-toast-ok"}`}>
      <span>{toast.type === "err" ? "✕" : "✓"}</span>
      {toast.msg}
    </div>
  );
}

export function EmptyState({ icon, message }) {
  return (
    <div style={{
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      height:"12rem", gap:"0.75rem",
      border:"1px dashed var(--border)", borderRadius:"6px",
      color:"var(--text-muted)"
    }}>
      <span style={{ fontSize:"2rem", filter:"drop-shadow(0 0 8px var(--cyan))", opacity:0.5 }}>{icon}</span>
      <p style={{ fontFamily:"var(--font-mono)", fontSize:"0.68rem", letterSpacing:"0.1em", textTransform:"uppercase" }}>{message}</p>
    </div>
  );
}

export function Spinner({ text = "Loading…" }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"8rem", gap:"8px", color:"var(--text-muted)" }}>
      <svg className="animate-spin" style={{ width:14, height:14, color:"var(--cyan)" }} viewBox="0 0 24 24" fill="none">
        <circle style={{ opacity:0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path style={{ opacity:0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      <span style={{ fontFamily:"var(--font-mono)", fontSize:"0.65rem", letterSpacing:"0.1em", textTransform:"uppercase" }}>{text}</span>
    </div>
  );
}
