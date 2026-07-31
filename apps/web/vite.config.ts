import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    manifest: true
  },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.E2E_WEB_PORT ?? 5173),
    strictPort: true,
    proxy: {
      "/api":
        process.env.E2E_API_ORIGIN ??
        "http://localhost:3001"
    }
  },
  preview: {
    host: "127.0.0.1",
    port: Number(process.env.E2E_WEB_PORT ?? 4173),
    strictPort: true,
    proxy: {
      "/api":
        process.env.E2E_API_ORIGIN ??
        "http://localhost:3001"
    }
  }
});
