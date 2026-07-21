const TOKEN_KEY = "daily-todo-token";
const USER_KEY = "daily-todo-user";

const API = {
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },

  getUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  async request(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...options.headers };
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(path, { ...options, headers });

    let data = null;
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        const clean = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        data = {
          error: clean.includes("Internal Server Error")
            ? "Server error — please try again in a moment"
            : clean.slice(0, 160) || `Request failed (${res.status})`,
        };
      }
    }

    if (!res.ok) {
      const err = new Error(data?.error || `Request failed (${res.status})`);
      err.status = res.status;
      if (res.status === 401 && !path.includes("/api/auth/")) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        err.message = "Session expired — please sign in again";
        setTimeout(() => {
          if (!window.location.hash.includes("reauth")) {
            window.location.reload();
          }
        }, 800);
      }
      throw err;
    }

    return data;
  },

  register(name, email, password) {
    return this.request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
  },

  login(email, password) {
    return this.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  bootstrap() {
    return this.request("/api/bootstrap");
  },

  savePrefs(prefs) {
    return this.request("/api/prefs", { method: "PUT", body: JSON.stringify(prefs) });
  },

  createTask(task) {
    return this.request("/api/tasks", { method: "POST", body: JSON.stringify(task) });
  },

  updateTask(id, task) {
    return this.request(`/api/tasks/${id}`, { method: "PUT", body: JSON.stringify(task) });
  },

  deleteTask(id) {
    return this.request(`/api/tasks/${id}`, { method: "DELETE" });
  },

  clearCompleted() {
    return this.request("/api/tasks?completed=true", { method: "DELETE" });
  },

  saveReflection(date, data) {
    return this.request(`/api/reflections/${date}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  saveIntention(date, text) {
    return this.request(`/api/intentions/${date}`, {
      method: "PUT",
      body: JSON.stringify({ text }),
    });
  },

  importData(payload) {
    return this.request("/api/import", { method: "POST", body: JSON.stringify(payload) });
  },

  weeklyInsights() {
    return this.request("/api/insights/weekly");
  },
};
