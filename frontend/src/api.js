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
  login:         (username, password) => req("POST", "/auth/login", { username, password }),
  me:            ()                   => req("GET",  "/auth/me"),
  changePassword:(cur, next)          => req("POST", "/auth/change-password", { currentPassword: cur, newPassword: next }),
  // User management (admin)
  listUsers:     ()                   => req("GET",  "/auth/users"),
  createUser:    (username, password) => req("POST", "/auth/users", { username, password }),
  deleteUser:    (id)                 => req("DELETE",`/auth/users/${id}`),
  resetPassword: (id, newPassword)    => req("POST", `/auth/users/${id}/reset-password`, { newPassword }),
  // Metrics
  instances:     ()                              => req("GET", "/metrics/instances"),
  monthly:       (instanceId, start, end)        => req("GET", `/metrics/monthly?instanceId=${encodeURIComponent(instanceId)}&start=${start}&end=${end}`),
  costs:         (start, end)                    => req("GET", `/metrics/costs?start=${start}&end=${end}`),
  validateAWS:   ()                              => req("GET", "/metrics/validate"),
  // Tags (admin write)
  getTags:       ()                  => req("GET", "/tags"),
  saveTags:      (map)               => req("PUT", "/tags", map),
  // Comments
  getComments:   (instanceId)        => req("GET", `/comments?instanceId=${encodeURIComponent(instanceId)}`),
  addComment:    (body)              => req("POST","/comments", body),
  deleteComment: (id)                => req("DELETE",`/comments/${id}`),
  // Alerts (admin write)
  getAlerts:     ()                  => req("GET", "/alerts"),
  createAlert:   (body)              => req("POST","/alerts", body),
  toggleAlert:   (id, active)        => req("PATCH",`/alerts/${id}`, { active }),
  deleteAlert:   (id)                => req("DELETE",`/alerts/${id}`),
  // Sync
  syncStatus:    ()    => req("GET",  "/sync/status"),
  syncTrigger:   ()    => req("POST", "/sync/trigger"),
  syncHistory:   ()    => req("GET",  "/sync/history"),
};
