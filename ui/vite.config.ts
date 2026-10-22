import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Plain single-page app. The Go daemon serves `dist/` and the /api routes;
// in development `vite` proxies /api to a daemon started with --port 8471.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  server: { proxy: { "/api": "http://127.0.0.1:8471" } },
  build: { outDir: "dist", emptyOutDir: true },
});
