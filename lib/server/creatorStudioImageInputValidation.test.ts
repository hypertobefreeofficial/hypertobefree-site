import { describe, expect, it } from "vitest";
import { validateCreatorStudioImageInput } from "./creatorStudioImageInputValidation";
import { CREATOR_STUDIO_IMAGE_MAX_USER_PROMPT_CHARS } from "./creatorStudioAiLimits";

describe("validateCreatorStudioImageInput", () => {
  it("accepts valid image payloads", () => {
    const result = validateCreatorStudioImageInput({
      action: "AI Background",
      prompt: "Peaceful light over water",
      design: { title: "Grace found me" },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects oversized image prompt", () => {
    const result = validateCreatorStudioImageInput({
      action: "AI Background",
      prompt: "x".repeat(CREATOR_STUDIO_IMAGE_MAX_USER_PROMPT_CHARS + 1),
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.field).toBe("prompt");
    }
  });

  it("rejects invalid action", () => {
    const result = validateCreatorStudioImageInput({
      action: "Invalid",
      prompt: "Test",
    });
    expect(result.ok).toBe(false);
  });
});
