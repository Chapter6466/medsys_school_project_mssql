// utils.js
(function () {
  // Single source of truth for API base
  window.API_BASE = window.API_BASE || 'http://localhost:3000/api';

  // Auth-aware fetch helper (adds Authorization if token exists)
  window.fetchJson = async function fetchJson(url, options = {}) {
    const token = sessionStorage.getItem('medsys_token') || localStorage.getItem('medsys_token');
    const auth = token ? { Authorization: 'Bearer ' + token } : {};
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...auth, ...(options.headers || {}) },
      ...options
    });
    // Try to parse JSON, but keep the original body for error messages
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      const message = (data && (data.error || data.message)) || `HTTP ${res.status}`;
      const err = new Error(message);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  };
})();
