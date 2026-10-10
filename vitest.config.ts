import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "lib/server/vitestServerOnlyStub.ts"),
    },
  },
  test: {
    include: ["lib/**/*.test.ts", "load-tests/scripts/**/*.test.js"],
    exclude: ["tests/**", "node_modules/**"],
  },
});
