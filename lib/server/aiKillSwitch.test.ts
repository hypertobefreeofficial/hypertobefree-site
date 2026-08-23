import { afterEach, describe, expect, it } from "vitest";
import {
  AI_FEATURES_DISABLED_ENV,
  checkAiKillSwitch,
  isAiFeaturesDisabled,
} from "./aiKillSwitch";

describe("aiKillSwitch", () => {
  afterEach(() => {
    delete process.env[AI_FEATURES_DISABLED_ENV];
  });

  it("is disabled by default", () => {
    expect(isAiFeaturesDisabled()).toBe(false);
  });

  it("activates when AI_FEATURES_DISABLED=1", () => {
    process.env[AI_FEATURES_DISABLED_ENV] = "1";
    expect(isAiFeaturesDisabled()).toBe(true);
  });

  it("returns controlled 503 response without provider call", async () => {
    process.env[AI_FEATURES_DISABLED_ENV] = "1";
    const result = checkAiKillSwitch("shape_story");
    expect(result.blocked).toBe(true);
    if (result.blocked) {
      const body = await result.response.json();
      expect(result.response.status).toBe(503);
      expect(body.code).toBe("ai_disabled");
      expect(JSON.stringify(body)).not.toContain("AI_FEATURES_DISABLED");
    }
  });
});
