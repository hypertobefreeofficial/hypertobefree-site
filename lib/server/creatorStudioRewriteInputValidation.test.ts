import { describe, expect, it } from "vitest";
import { validateCreatorStudioRewriteInput } from "./creatorStudioRewriteInputValidation";
import { CREATOR_STUDIO_REWRITE_MAX_CURRENT_TEXT_CHARS } from "./creatorStudioAiLimits";

describe("validateCreatorStudioRewriteInput", () => {
  it("accepts valid rewrite payloads", () => {
    const result = validateCreatorStudioRewriteInput({
      layer: "title",
      action: "clearer",
      currentText: "Thank you Jesus.",
      storyContext: { title: "Grace" },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects oversized rewrite text", () => {
    const result = validateCreatorStudioRewriteInput({
      currentText: "x".repeat(CREATOR_STUDIO_REWRITE_MAX_CURRENT_TEXT_CHARS + 1),
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.field).toBe("currentText");
    }
  });

  it("rejects malformed bodies", () => {
    expect(validateCreatorStudioRewriteInput(null).ok).toBe(false);
  });
});
