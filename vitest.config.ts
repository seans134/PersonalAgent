import { defineConfig, configDefaults } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { exclude: [...configDefaults.exclude, ".superpowers/**", ".claude/**"] },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@personal-agent/core": path.resolve(__dirname, "packages/core/src"),
    },
  },
});
