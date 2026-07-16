import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const OWNER_SURFACES = [
  "components/FreedomFeed.tsx",
  "components/prayer-connect/PrayerMyRequestsPanel.tsx",
];

const DIRECT_ANSWERED_UPDATE_PATTERN =
  /\.from\(\s*["']stories["']\s*\)[\s\S]{0,220}?\.update\(\s*\{[\s\S]{0,400}?(prayer_status|answered_at|answered_text)/;

describe("answered prayer owner write paths", () => {
  for (const relativePath of OWNER_SURFACES) {
    it(`${relativePath} uses the shared markMyPrayerAnswered helper`, () => {
      const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");
      expect(source).toMatch(/markMyPrayerAnswered/);
    });

    it(`${relativePath} does not directly mutate answered-prayer fields`, () => {
      const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");
      expect(source).not.toMatch(DIRECT_ANSWERED_UPDATE_PATTERN);
    });
  }

  it("shared helper calls the RPC rather than direct table updates", () => {
    const source = readFileSync(
      resolve(process.cwd(), "lib/prayer-connect/markMyPrayerAnswered.ts"),
      "utf8"
    );
    expect(source).toMatch(/rpc\(\s*["']mark_my_prayer_answered["']/);
    expect(source).not.toMatch(DIRECT_ANSWERED_UPDATE_PATTERN);
    expect(source).toMatch(/mapMarkPrayerAnsweredClientError/);
  });
});
