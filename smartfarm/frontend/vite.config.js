import { defineConfig } from "vite";

const apiTarget = process.env.SMARTFARM_API_TARGET ?? "http://localhost:3004";

export default defineConfig({
  server: {
    port: 5178,
    strictPort: true,
    proxy: {
      "/api": apiTarget,
    },
  },
});
