export const api = {
  workspaceId: typeof localStorage !== "undefined" ? localStorage.getItem("maw3ed.workspaceId") || "local-default" : "local-default",

  setWorkspaceId(id) {
    this.workspaceId = id || "local-default";
    if (typeof localStorage !== "undefined") {
      if (id) localStorage.setItem("maw3ed.workspaceId", id);
      else localStorage.setItem("maw3ed.workspaceId", "local-default");
    }
  },

  headers(extra = {}) {
    const headers = { ...extra };
    if (this.workspaceId) headers["x-workspace-id"] = this.workspaceId;
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
    return this.parse(await fetch(url, { headers: this.headers() }));
  },
  async post(url, body) {
    return this.parse(
      await fetch(url, {
        method: "POST",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify(body)
      })
    );
  },
  async put(url, body) {
    return this.parse(
      await fetch(url, {
        method: "PUT",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify(body)
      })
    );
  },
  async patch(url, body) {
    return this.parse(
      await fetch(url, {
        method: "PATCH",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify(body)
      })
    );
  },
  async del(url) {
    return this.parse(await fetch(url, { method: "DELETE", headers: this.headers() }));
  }
};
