// frontend/src/api.js
const BASE = import.meta.env.VITE_API_URL || "/api";

export function saveToken(t) { localStorage.setItem("adt", t); }
export function clearToken()  { localStorage.removeItem("adt"); }
export function getToken()    { return localStorage.getItem("adt") || ""; }

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  // Auth
  login:          (u, p)    => req("POST", "/auth/login", { username: u, password: p }),
  me:             ()        => req("GET",  "/auth/me"),
  changePassword: (cur,nxt) => req("POST", "/auth/change-password", { currentPassword: cur, newPassword: nxt }),
  listUsers:      ()        => req("GET",  "/auth/users"),
  createUser:     (u, p)    => req("POST", "/auth/users", { username: u, password: p }),
  deleteUser:     (id)      => req("DELETE",`/auth/users/${id}`),
  resetPassword:  (id, p)   => req("POST", `/auth/users/${id}/reset-password`, { newPassword: p }),
  // Accounts
  listAccounts:   ()        => req("GET",  "/accounts"),
  addAccount:     (body)    => req("POST", "/accounts", body),
  toggleAccount:  (id)      => req("PATCH",`/accounts/${id}/toggle`),
  deleteAccount:  (id)      => req("DELETE",`/accounts/${id}`),
  // Metrics
  instances:      (accountId) => req("GET", `/metrics/instances${accountId ? `?accountId=${accountId}` : ""}`),
  monthly:        (instanceId, start, end) => req("GET", `/metrics/monthly?instanceId=${encodeURIComponent(instanceId)}&start=${start}&end=${end}`),
  validateAWS:    (accountId) => req("GET", `/metrics/validate?accountId=${accountId}`),
  // Tags
  getTags:        ()       => req("GET", "/tags"),
  saveTags:       (map)    => req("PUT", "/tags", map),
  // Comments
  getComments:    (instanceId) => req("GET", `/comments?instanceId=${encodeURIComponent(instanceId)}`),
  addComment:     (body)        => req("POST","/comments", body),
  deleteComment:  (id)          => req("DELETE",`/comments/${id}`),
  // Alerts
  getAlerts:      ()            => req("GET", "/alerts"),
  createAlert:    (body)        => req("POST","/alerts", body),
  toggleAlert:    (id, active)  => req("PATCH",`/alerts/${id}`, { active }),
  deleteAlert:    (id)          => req("DELETE",`/alerts/${id}`),
  // Sync
  syncStatus:     ()            => req("GET",  "/sync/status"),
  syncTrigger:    (accountId)   => req("POST", `/sync/trigger${accountId ? `?accountId=${accountId}` : ""}`),
  syncHistory:    ()            => req("GET",  "/sync/history"),
};
