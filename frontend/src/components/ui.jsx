// frontend/src/components/ui.jsx
// Shared, lightweight UI primitives used across all pages.

export function Badge({ text }) {
  const styles = {
    running:   "bg-green-50 text-green-600 border-green-200",
    stopped:   "bg-gray-100 text-gray-400 border-gray-200",
    available: "bg-blue-50 text-blue-600 border-blue-200",
    active:    "bg-purple-50 text-purple-600 border-purple-200",
    admin:     "bg-amber-50 text-amber-600 border-amber-200",
    viewer:    "bg-gray-50 text-gray-500 border-gray-200",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${styles[text] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
      {text}
    </span>
  );
}

export function Card({ children, className = "" }) {
  return (
    <div className={`bg-white border border-gray-100 rounded-xl shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ children }) {
  return <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">{children}</p>;
}

export function Input({ label, ...props }) {
  return (
    <div>
      {label && <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wider">{label}</label>}
      <input
        {...props}
        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 disabled:opacity-50"
      />
    </div>
  );
}

export function Select({ label, children, ...props }) {
  return (
    <div>
      {label && <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wider">{label}</label>}
      <select
        {...props}
        className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
      >
        {children}
      </select>
    </div>
  );
}

export function Btn({ children, variant = "primary", className = "", ...props }) {
  const base = "px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const variants = {
    primary:  "bg-blue-500 text-white hover:bg-blue-600",
    danger:   "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100",
    ghost:    "text-gray-500 hover:text-gray-700 hover:bg-gray-100",
    amber:    "bg-amber-500 text-white hover:bg-amber-600",
    dark:     "bg-gray-800 text-white hover:bg-gray-900",
  };
  return (
    <button {...props} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`fixed bottom-6 right-6 text-white text-sm px-4 py-3 rounded-xl shadow-lg z-50 flex items-center gap-2 transition-all ${toast.type === "err" ? "bg-red-500" : "bg-gray-900"}`}>
      <span>{toast.type === "err" ? "✕" : "✓"}</span> {toast.msg}
    </div>
  );
}

export function EmptyState({ icon, message }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2 border border-dashed border-gray-200 rounded-xl">
      <span className="text-4xl">{icon}</span>
      <p className="text-sm">{message}</p>
    </div>
  );
}

export function Spinner({ text = "Loading…" }) {
  return (
    <div className="flex items-center justify-center h-40 text-gray-400 text-sm gap-2">
      <svg className="animate-spin h-4 w-4 text-blue-400" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      {text}
    </div>
  );
}
