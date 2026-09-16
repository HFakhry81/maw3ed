import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

function serveStaticExtras() {
  const rootFiles = new Set([
    "auth.html",
    "auth.js",
    "plans.html",
    "plans.js",
    "admin.html",
    "admin.js",
    "book.html",
    "manifest.webmanifest",
    "sw.js"
  ]);
  return {
    name: "maw3ed-serve-static-extras",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || "").split("?")[0];
        const rel = decodeURIComponent(url.replace(/^\//, ""));
        if (rootFiles.has(rel) || rel.startsWith("assets/")) {
          const filePath = path.join(process.cwd(), rel);
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            const types = {
              ".html": "text/html; charset=utf-8",
              ".js": "text/javascript; charset=utf-8",
              ".svg": "image/svg+xml",
              ".png": "image/png",
              ".webmanifest": "application/manifest+json",
              ".css": "text/css; charset=utf-8"
            };
            res.statusCode = 200;
            res.setHeader("Content-Type", types[ext] || "application/octet-stream");
            fs.createReadStream(filePath).pipe(res);
            return;
          }
        }
        next();
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), serveStaticExtras()],
    publicDir: false,
    define: {
      "import.meta.env.VITE_CLERK_PUBLISHABLE_KEY": JSON.stringify(
        env.VITE_CLERK_PUBLISHABLE_KEY || env.CLERK_PUBLISHABLE_KEY || env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ""
      )
    },
    server: {
      host: "0.0.0.0",
      port: Number(process.env.VITE_PORT || env.VITE_PORT || 7100),
      strictPort: true,
      hmr: {
        // Avoid Vite websocket failures when the browser hits localhost
        // while the server listens on 0.0.0.0 (common on Windows + VPN).
        protocol: "ws",
        host: "localhost",
        port: Number(process.env.VITE_PORT || env.VITE_PORT || 7100),
        clientPort: Number(process.env.VITE_PORT || env.VITE_PORT || 7100)
      },
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${process.env.BACKEND_PORT || env.BACKEND_PORT || env.PORT || 7000}`,
          changeOrigin: true
        },
        "/data": {
          target: `http://127.0.0.1:${process.env.BACKEND_PORT || env.BACKEND_PORT || env.PORT || 7000}`,
          changeOrigin: true
        }
      }
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: false,
      target: "es2020",
      cssMinify: true
    }
  };
});
