export const api = {
  workspaceId: typeof localStorage !== "undefined" ? localStorage.getItem("maw3ed.workspaceId") || "local-default" : "local-default",
  getToken: null,

  setWorkspaceId(id) {
    this.workspaceId = id || "local-default";
    if (typeof localStorage !== "undefined") {
      if (id) localStorage.setItem("maw3ed.workspaceId", id);
      else localStorage.setItem("maw3ed.workspaceId", "local-default");
    }
  },

  async resolveToken() {
    if (typeof this.getToken !== "function") return null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        const token = await this.getToken(attempt === 0 ? undefined : { skipCache: true });
        if (token) return token;
      } catch {
        /* session not ready yet */
      }
      await new Promise((resolve) => setTimeout(resolve, 120 * (attempt + 1)));
    }
    return null;
  },

  async authHeaders(extra = {}) {
    const headers = { ...extra };
    if (this.workspaceId) headers["x-workspace-id"] = this.workspaceId;
    const token = await this.resolveToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  },

  async authHeadersRequired(extra = {}) {
    const headers = await this.authHeaders(extra);
    if (!headers.Authorization) {
      const err = new Error("يلزم تسجيل الدخول من جديد قبل إنشاء مساحة العمل");
      err.status = 401;
      err.code = "missing_clerk_token";
      throw err;
    }
    return headers;
  },

  async parse(response) {
    const text = await response.text();
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error(response.ok ? "Unexpected end of JSON input" : `HTTP ${response.status}`);
      }
    }
    if (!response.ok) {
      const raw = payload.error || `HTTP ${response.status}`;
      const message =
        /authentication is required/i.test(raw)
          ? "يلزم تسجيل الدخول من جديد قبل إنشاء مساحة العمل"
          : raw;
      const err = new Error(message);
      if (payload.code) err.code = payload.code;
      if (payload.suggestedSlug) err.suggestedSlug = payload.suggestedSlug;
      err.status = response.status;
      throw err;
    }
    return payload;
  },

  needsAuth(url) {
    const path = String(url || "").split("?")[0];
    return path.startsWith("/api/") && path !== "/api/config";
  },

  async get(url) {
    const headers = this.needsAuth(url) ? await this.authHeadersRequired() : await this.authHeaders();
    return this.parse(await fetch(url, { headers }));
  },
  async post(url, body) {
    const headers = this.needsAuth(url)
      ? await this.authHeadersRequired({ "Content-Type": "application/json" })
      : await this.authHeaders({ "Content-Type": "application/json" });
    return this.parse(
      await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      })
    );
  },
  async put(url, body) {
    const headers = this.needsAuth(url)
      ? await this.authHeadersRequired({ "Content-Type": "application/json" })
      : await this.authHeaders({ "Content-Type": "application/json" });
    return this.parse(
      await fetch(url, {
        method: "PUT",
        headers,
        body: JSON.stringify(body)
      })
    );
  },
  async patch(url, body) {
    const headers = this.needsAuth(url)
      ? await this.authHeadersRequired({ "Content-Type": "application/json" })
      : await this.authHeaders({ "Content-Type": "application/json" });
    return this.parse(
      await fetch(url, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body)
      })
    );
  },
  async del(url) {
    const headers = this.needsAuth(url) ? await this.authHeadersRequired() : await this.authHeaders();
    return this.parse(await fetch(url, { method: "DELETE", headers }));
  }
};
