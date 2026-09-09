const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = 5000;
const eventsFile = path.join(root, "data", "development-events.jsonl");
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8"
};

fs.mkdirSync(path.dirname(eventsFile), { recursive: true });

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function readRequestBody(req, limit = 8 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > limit) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function appendDevelopmentEvent(event, details = {}) {
  const record = {
    timestamp: new Date().toISOString(),
    event,
    details,
    source: "web-prototype"
  };
  const current = fs.existsSync(eventsFile) ? fs.readFileSync(eventsFile, "utf8") : "";
  const separator = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(eventsFile, `${separator}${JSON.stringify(record)}\n`, "utf8");
  return record;
}

const server = http.createServer((req, res) => {
  const requested = decodeURIComponent(req.url.split("?")[0]);

  if (requested === "/api/development-events" && req.method === "POST") {
    readRequestBody(req)
      .then((body) => {
        const payload = JSON.parse(body || "{}");
        const event = typeof payload.event === "string" ? payload.event.trim() : "";
        if (!/^[a-z0-9_.-]{1,80}$/.test(event)) {
          return sendJson(res, 400, { ok: false, error: "Invalid event name" });
        }
        const details = payload.details && typeof payload.details === "object" ? payload.details : {};
        const safeDetails = JSON.parse(JSON.stringify(details).slice(0, 2000));
        const record = appendDevelopmentEvent(event, safeDetails);
        return sendJson(res, 201, { ok: true, timestamp: record.timestamp });
      })
      .catch((error) => sendJson(res, 400, { ok: false, error: error.message }));
    return;
  }

  if (requested === "/api/development-events" && req.method === "GET") {
    try {
      const limit = Math.min(Math.max(Number(new URL(req.url, "http://localhost").searchParams.get("limit")) || 50, 1), 200);
      const lines = fs.existsSync(eventsFile)
        ? fs.readFileSync(eventsFile, "utf8").trim().split("\n").filter(Boolean).slice(-limit)
        : [];
      return sendJson(res, 200, { ok: true, events: lines.map((line) => JSON.parse(line)) });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: "Unable to read event log" });
    }
  }

  const relative = requested === "/" ? "/index.html" : requested;
  const filePath = path.join(root, relative);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500, {
        "Content-Type": "text/plain; charset=utf-8"
      });
      return res.end(error.code === "ENOENT" ? "Not found" : "Server error");
    }
    res.writeHead(200, {
      "Content-Type": types[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Maw3ed dashboard running on port ${port}`);
});