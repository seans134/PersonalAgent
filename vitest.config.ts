import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@personal-agent/core": path.resolve(__dirname, "packages/core/src"),
    },
  },
});
