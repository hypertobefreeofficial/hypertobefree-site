import { defineConfig, devices } from "@playwright/test";
import path from "path";

export const authDir = path.join(".playwright", "auth");

export default defineConfig({
  testDir: "./tests/prayer",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./tests/prayer/global-setup.ts",
  timeout: 120000,
  expect: { timeout: 20000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3492",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  projects: [
    {
      name: "prayer-smoke",
      testMatch: /smoke\.spec\.ts/,
    },
    {
      name: "prayer-auth",
      testMatch: /(persistence|reporting|removal|blocking|video-limits)\.spec\.ts/,
      dependencies: ["prayer-smoke"],
    },
    {
      name: "feed-shell",
      testDir: "./tests/feed",
      testMatch: /shell\.spec\.ts/,
    },
    {
      name: "feed-shell-production",
      testDir: "./tests/feed",
      testMatch: /shell-production\.spec\.ts/,
    },
  ],
});
