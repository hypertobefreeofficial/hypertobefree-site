import { describe, expect, it, vi } from "vitest";
import {
  filterInboxMessagesForGenuineStories,
  shouldDeliverInboxNotification,
} from "./notificationIsolation";
import {
  buildSuppressedDemoStoryModerationBody,
  sendCommunityEmailIfAllowed,
  shouldSuppressBillableAiCall,
  shouldSuppressBillableAiForUserId,
  shouldSuppressEmailDelivery,
} from "./externalServiceIsolation";

describe("notification isolation", () => {
  it("suppresses inbox notifications for demo stories or actors", () => {
    expect(
      shouldDeliverInboxNotification({
        story: { is_demo: true },
      })
    ).toBe(false);
    expect(
      shouldDeliverInboxNotification({
        story: { is_demo: false },
        actor: { is_demo: false },
        recipient: { is_demo: false },
      })
    ).toBe(true);
  });

  it("filters inbox rows tied to demo parent stories", () => {
    const demoStoryIds = new Set(["demo-story"]);
    expect(
      filterInboxMessagesForGenuineStories(
        [
          { story_id: "demo-story", prayer_request_id: null },
          { story_id: "real-story", prayer_request_id: null },
        ],
        demoStoryIds
      )
    ).toEqual([{ story_id: "real-story", prayer_request_id: null }]);
  });
});

describe("email and AI external-service isolation", () => {
  it("suppresses email delivery for demo activity without calling the provider", async () => {
    const provider = vi.fn(async () => undefined);
    expect(
      shouldSuppressEmailDelivery({
        story: { is_demo: true },
      })
    ).toBe(true);

    const result = await sendCommunityEmailIfAllowed(
      { to: "user@example.com", subject: "Test", html: "<p>Hi</p>" },
      { story: { is_demo: true } },
      provider
    );

    expect(result).toEqual({ ok: true, suppressed: true });
    expect(provider).not.toHaveBeenCalled();
  });

  it("allows genuine email delivery through the provider gate", async () => {
    const provider = vi.fn(async () => undefined);
    const result = await sendCommunityEmailIfAllowed(
      { to: "user@example.com", subject: "Test", html: "<p>Hi</p>" },
      { story: { is_demo: false } },
      provider
    );

    expect(result).toEqual({ ok: true, suppressed: false, provider: "resend" });
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("suppresses billable AI for trusted demo records only", () => {
    expect(shouldSuppressBillableAiCall({ source: { is_demo: true } })).toBe(true);
    expect(shouldSuppressBillableAiCall({ source: { is_demo: false } })).toBe(false);
    expect(shouldSuppressBillableAiCall({ actor: { demo_seed_run_id: "run-1" } })).toBe(
      true
    );
  });

  it("returns deterministic demo moderation without external AI metadata leaks", () => {
    const body = buildSuppressedDemoStoryModerationBody();
    expect(body.demo_ai_suppressed).toBe(true);
    expect(body.rawFlagged).toBe(false);
    expect(body.aiReviewStatus).toBe("completed");
  });

  it("loads trusted profile demo status for AI suppression", async () => {
    const reader = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { is_demo: true, demo_seed_run_id: null },
              error: null,
            }),
          }),
        }),
      }),
    };

    await expect(
      shouldSuppressBillableAiForUserId(reader, "user-1")
    ).resolves.toBe(true);
  });
});
