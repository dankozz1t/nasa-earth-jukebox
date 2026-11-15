import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// In dev, /api goes to the C# backend (dotnet run or docker compose, port 8080).
// In production the frontend container (nginx) proxies /api the same way.
export default defineConfig({
  base: "/",
  plugins: [react()],
  build: { target: "es2022" },
  server: {
    proxy: {
      "/api": { target: process.env.API_URL ?? "http://localhost:8080", changeOrigin: false },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["tests/setup.ts"],
  },
});
