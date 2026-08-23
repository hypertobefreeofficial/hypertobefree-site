import { afterEach, describe, expect, it } from "vitest";
import {
  AI_IMAGE_GENERATION_ENABLED_ENV,
  checkAiImageGenerationGate,
  isAiImageGenerationEnabled,
} from "./aiImageGenerationGate";

describe("aiImageGenerationGate", () => {
  afterEach(() => {
    delete process.env[AI_IMAGE_GENERATION_ENABLED_ENV];
  });

  it("is disabled by default when env var is missing", () => {
    expect(isAiImageGenerationEnabled()).toBe(false);
  });

  it("activates only for explicit enabled values", () => {
    process.env[AI_IMAGE_GENERATION_ENABLED_ENV] = "1";
    expect(isAiImageGenerationEnabled()).toBe(true);

    process.env[AI_IMAGE_GENERATION_ENABLED_ENV] = "true";
    expect(isAiImageGenerationEnabled()).toBe(true);

    process.env[AI_IMAGE_GENERATION_ENABLED_ENV] = "yes";
    expect(isAiImageGenerationEnabled()).toBe(true);

    process.env[AI_IMAGE_GENERATION_ENABLED_ENV] = "0";
    expect(isAiImageGenerationEnabled()).toBe(false);
  });

  it("returns controlled 503 without env leakage", async () => {
    const result = checkAiImageGenerationGate("generate_creator_studio_image");
    expect(result.blocked).toBe(true);
    if (result.blocked) {
      const body = await result.response.json();
      expect(result.response.status).toBe(503);
      expect(body.code).toBe("image_generation_disabled");
      expect(JSON.stringify(body)).not.toContain("AI_IMAGE_GENERATION_ENABLED");
    }
  });
});
