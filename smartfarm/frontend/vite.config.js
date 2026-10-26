import { defineConfig } from "vite";

const apiTarget = process.env.SMARTFARM_API_TARGET ?? "http://localhost:3001";

export default defineConfig({
  server: {
    proxy: {
      "/api": apiTarget,
    },
  },
});
