import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    publicDir: false,
    define: {
      "import.meta.env.VITE_CLERK_PUBLISHABLE_KEY": JSON.stringify(
        env.VITE_CLERK_PUBLISHABLE_KEY || env.CLERK_PUBLISHABLE_KEY || env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ""
      )
    },
    server: {
      host: "0.0.0.0",
      port: Number(process.env.VITE_PORT || env.VITE_PORT || 7100),
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
