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

  async authHeaders(extra = {}) {
    const headers = { ...extra };
    if (this.workspaceId) headers["x-workspace-id"] = this.workspaceId;
    if (typeof this.getToken === "function") {
      try {
        const token = await this.getToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      } catch {
        /* signed out */
      }
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
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    return payload;
  },

  async get(url) {
    return this.parse(await fetch(url, { headers: await this.authHeaders() }));
  },
  async post(url, body) {
    return this.parse(
      await fetch(url, {
        method: "POST",
        headers: await this.authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body)
      })
    );
  },
  async put(url, body) {
    return this.parse(
      await fetch(url, {
        method: "PUT",
        headers: await this.authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body)
      })
    );
  },
  async patch(url, body) {
    return this.parse(
      await fetch(url, {
        method: "PATCH",
        headers: await this.authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body)
      })
    );
  },
  async del(url) {
    return this.parse(await fetch(url, { method: "DELETE", headers: await this.authHeaders() }));
  }
};
