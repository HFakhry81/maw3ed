import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  server: {
    host: "0.0.0.0",
    port: Number(process.env.VITE_PORT || 7100),
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.BACKEND_PORT || 7000}`,
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
});