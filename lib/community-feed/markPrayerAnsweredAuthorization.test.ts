import { describe, expect, it } from "vitest";
import {
  validateMarkPrayerAnsweredRequest,
  type MarkPrayerAnsweredStoryRow,
} from "./markPrayerAnsweredAuthorization";

function story(
  overrides: Partial<MarkPrayerAnsweredStoryRow> = {}
): MarkPrayerAnsweredStoryRow {
  return {
    id: "story-1",
    user_id: "owner-1",
    story_type: "Prayer Request",
    status: "approved",
    prayer_status: "active",
    removed_at: null,
    ...overrides,
  };
}

describe("validateMarkPrayerAnsweredRequest", () => {
  it("allows the owner to mark an eligible prayer answered", () => {
    const result = validateMarkPrayerAnsweredRequest(
      "owner-1",
      "God answered clearly.",
      story()
    );

    expect(result).toEqual({
      ok: true,
      cleanAnsweredText: "God answered clearly.",
    });
  });

  it("rejects anonymous users", () => {
    const result = validateMarkPrayerAnsweredRequest(
      null,
      "Update",
      story()
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unauthorized");
    }
  });

  it("rejects non-owners", () => {
    const result = validateMarkPrayerAnsweredRequest(
      "other-user",
      "Update",
      story()
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("forbidden");
    }
  });

  it("rejects removed prayers", () => {
    const result = validateMarkPrayerAnsweredRequest(
      "owner-1",
      "Update",
      story({ removed_at: "2026-07-14T12:00:00.000Z" })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("not_eligible");
    }
  });

  it("rejects non-approved prayers", () => {
    const result = validateMarkPrayerAnsweredRequest(
      "owner-1",
      "Update",
      story({ status: "pending" })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("not_eligible");
    }
  });

  it("rejects already answered prayers", () => {
    const result = validateMarkPrayerAnsweredRequest(
      "owner-1",
      "Update",
      story({ prayer_status: "answered" })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("already_answered");
    }
  });

  it("rejects non-prayer stories", () => {
    const result = validateMarkPrayerAnsweredRequest(
      "owner-1",
      "Update",
      story({ story_type: "Testimony" })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("not_prayer");
    }
  });

  it("rejects empty answered text", () => {
    const result = validateMarkPrayerAnsweredRequest("owner-1", "   ", story());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid_text");
    }
  });
});
