// frontend/src/components/SyncBadge.jsx — NOC theme
import { useState, useEffect, useRef } from "react";
import { api } from "../api.js";

function timeAgo(dateStr) {
  if (!dateStr) return "never";
  const diff  = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  <  1) return "just now";
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export default function SyncBadge({ isAdmin }) {
  const [status,     setStatus]     = useState(null);
  const [triggering, setTriggering] = useState(false);
  const pollRef = useRef(null);

  async function fetchStatus() {
    try { const s = await api.syncStatus(); setStatus(s); return s; } catch (_) {}
  }

  useEffect(() => {
    fetchStatus();
    const iv = setInterval(fetchStatus, 60_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!status?.running) { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } return; }
    if (!pollRef.current) {
      pollRef.current = setInterval(async () => {
        const s = await fetchStatus();
        if (s && !s.running) { clearInterval(pollRef.current); pollRef.current = null; }
      }, 8_000);
    }
  }, [status?.running]);

  async function trigger() {
    setTriggering(true);
    try { await api.syncTrigger(); setStatus(s => ({ ...s, running: true })); }
    catch (e) { alert(e.message); }
    finally { setTriggering(false); }
  }

  const last    = status?.last;
  const running = status?.running;

  return (
    <div className={`sync-badge ${last?.status === "error" ? "error" : ""}`}>
      {running ? (
        <>
          <svg className="animate-spin" style={{ width:10, height:10, color:"var(--cyan)" }} viewBox="0 0 24 24" fill="none">
            <circle style={{ opacity:0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path style={{ opacity:0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <span style={{ color:"var(--cyan)" }}>Syncing…</span>
        </>
      ) : (
        <span>
          {last ? <>Sync: {timeAgo(last.finished_at)}{last.status === "error" ? " ⚠" : ""}</> : "Not synced"}
        </span>
      )}
      {isAdmin && !running && (
        <button onClick={trigger} disabled={triggering} className="sync-btn" title="Trigger manual sync">
          <svg style={{ width:16, height:16 }} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd"/>
          </svg>
        </button>
      )}
    </div>
  );
}
