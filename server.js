const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = 5000;
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8"
};

const server = http.createServer((req, res) => {
  const requested = decodeURIComponent(req.url.split("?")[0]);
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