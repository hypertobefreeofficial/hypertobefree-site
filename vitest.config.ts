import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts", "load-tests/scripts/**/*.test.js"],
    exclude: ["tests/**", "node_modules/**"],
  },
});
