import { describe, expect, it, vi } from "vitest";
import { markMyPrayerAnswered } from "./markMyPrayerAnswered";

describe("markMyPrayerAnswered", () => {
  it("calls the RPC and returns the canonical answered story", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        id: "story-1",
        user_id: "owner-1",
        story_type: "Prayer Request",
        status: "approved",
        prayer_status: "answered",
        answered_at: "2026-07-15T00:00:00.000Z",
        answered_text: "God answered.",
      },
      error: null,
    });

    const supabase = { rpc } as never;

    const result = await markMyPrayerAnswered({
      supabase,
      storyId: "story-1",
      answeredText: "  God answered.  ",
      authUserId: "owner-1",
      storyForValidation: {
        id: "story-1",
        user_id: "owner-1",
        story_type: "Prayer Request",
        status: "approved",
        prayer_status: "active",
        removed_at: null,
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.story.answered_text).toBe("God answered.");
      expect(result.story.prayer_status).toBe("answered");
    }
    expect(rpc).toHaveBeenCalledWith("mark_my_prayer_answered", {
      p_story_id: "story-1",
      p_answered_text: "God answered.",
    });
  });

  it("maps RPC failures to safe user-facing errors", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          message:
            "prayer answered fields must be updated through mark_my_prayer_answered()",
        },
      }),
    } as never;

    const result = await markMyPrayerAnswered({
      supabase,
      storyId: "story-1",
      answeredText: "Update",
      authUserId: "owner-1",
      storyForValidation: {
        id: "story-1",
        user_id: "owner-1",
        story_type: "Prayer Request",
        status: "approved",
        prayer_status: "active",
        removed_at: null,
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toMatch(/mark_my_prayer_answered/i);
    }
  });
});
