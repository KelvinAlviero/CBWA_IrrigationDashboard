import { defineConfig } from "vite";

const apiTarget = process.env.SMARTFARM_API_TARGET ?? "http://localhost:3002";

export default defineConfig({
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": apiTarget,
    },
  },
});
