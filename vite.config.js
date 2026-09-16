import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api 는 Spring Boot(8080)로 프록시 — CORS 설정 없이 로컬 개발하려고.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:8080", changeOrigin: true }
    }
  }
});
