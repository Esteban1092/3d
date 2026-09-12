/* Helper de peticiones a la API con manejo de token JWT */
const API = {
  base: window.APP_CONFIG.API_BASE_URL,

  token() {
    return localStorage.getItem('3dm_token');
  },

  setToken(token) {
    localStorage.setItem('3dm_token', token);
  },

  clearToken() {
    localStorage.removeItem('3dm_token');
    localStorage.removeItem('3dm_user');
  },

  setUser(user) {
    localStorage.setItem('3dm_user', JSON.stringify(user));
  },

  getUser() {
    try { return JSON.parse(localStorage.getItem('3dm_user')); } catch { return null; }
  },

  async request(path, { method = 'GET', body, auth = false } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      const t = this.token();
      if (t) headers.Authorization = `Bearer ${t}`;
    }

    const res = await fetch(`${this.base}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Ocurrió un error inesperado.');
    return data;
  }
};
