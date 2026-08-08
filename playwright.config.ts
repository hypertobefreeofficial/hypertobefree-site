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
      name: "feed-phase-2",
      testDir: "./tests/feed",
      testMatch: /phase-2\.spec\.ts/,
    },
    {
      name: "feed-responsive-shell",
      testDir: "./tests/feed",
      testMatch: /responsive-shell\.spec\.ts/,
    },
    {
      name: "feed-responses-auth",
      testDir: "./tests/feed",
      testMatch: /responses-auth\.spec\.ts/,
    },
    {
      name: "feed-video-response",
      testDir: "./tests/feed",
      testMatch: /video-feed-response\.spec\.ts/,
    },
    {
      name: "feed-video-report-modal",
      testDir: "./tests/feed",
      testMatch: /video-report-modal\.spec\.ts/,
    },
    {
      name: "feed-shell-production",
      testDir: "./tests/feed",
      testMatch: /shell-production\.spec\.ts/,
    },
    {
      name: "app-shell-desktop",
      testDir: "./tests/app-shell",
      testMatch: /desktop-shell\.spec\.ts/,
    },
    {
      name: "app-shell-mobile-nav-badges",
      testDir: "./tests/app-shell",
      testMatch: /mobile-nav-badges\.spec\.ts/,
    },
  ],
});
