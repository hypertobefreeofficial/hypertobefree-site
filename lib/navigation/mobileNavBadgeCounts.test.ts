import { describe, expect, it } from "vitest";
import {
  computeMobileNavBadgeCounts,
  formatMobileNavBadge,
  getMobileNavBadgeCountForHref,
  isPrayerBadgeInboxRow,
  isInboxBadgeInboxRow,
} from "./mobileNavBadgeCounts";

const USER = "user-1";
const SENDER = "sender-1";

describe("mobileNavBadgeCounts", () => {
  it("formats badge labels up to 99+", () => {
    expect(formatMobileNavBadge(0)).toBe("0");
    expect(formatMobileNavBadge(12)).toBe("12");
    expect(formatMobileNavBadge(99)).toBe("99");
    expect(formatMobileNavBadge(100)).toBe("99+");
  });

  it("classifies prayer and inbox rows as mutually exclusive", () => {
    const prayerRow = {
      id: "p1",
      category: "prayer",
      message_type: "prayer_update",
      read: false,
      title: "Prayer update",
    };
    const privateRow = {
      id: "i1",
      sender_user_id: SENDER,
      category: "prayer",
      message_type: "prayer_video_reply",
      read: false,
      title: "Private video prayer",
      thread_id: "thread-1",
    };

    expect(isPrayerBadgeInboxRow(prayerRow)).toBe(true);
    expect(isInboxBadgeInboxRow(prayerRow)).toBe(false);
    expect(isPrayerBadgeInboxRow(privateRow)).toBe(false);
    expect(isInboxBadgeInboxRow(privateRow)).toBe(true);
  });

  it("dedupes inbox conversations by thread key", () => {
    const counts = computeMobileNavBadgeCounts(
      [
        {
          id: "a",
          sender_user_id: SENDER,
          thread_id: "thread-1",
          message_type: "prayer_video_reply",
          category: "prayer",
          read: false,
          title: "One",
        },
        {
          id: "b",
          sender_user_id: SENDER,
          thread_id: "thread-1",
          message_type: "prayer_video_reply",
          category: "prayer",
          read: false,
          title: "Two",
        },
      ],
      [],
      USER
    );

    expect(counts.inboxCount).toBe(1);
    expect(counts.prayerCount).toBe(0);
  });

  it("counts unread private text replies as inbox conversations", () => {
    const counts = computeMobileNavBadgeCounts(
      [],
      [
        {
          id: "r1",
          story_id: "story-1",
          user_id: SENDER,
          recipient_user_id: USER,
          read_at: null,
        },
        {
          id: "r2",
          story_id: "story-1",
          user_id: SENDER,
          recipient_user_id: USER,
          read_at: null,
        },
      ],
      USER
    );

    expect(counts.inboxCount).toBe(1);
  });

  it("ignores read, hidden, and sent private replies", () => {
    const counts = computeMobileNavBadgeCounts(
      [
        {
          id: "read-prayer",
          category: "prayer",
          message_type: "prayer_update",
          read: true,
          title: "Read",
        },
        {
          id: "hidden-prayer",
          category: "prayer",
          message_type: "prayer_update",
          read: false,
          hidden_at: "2026-01-01T00:00:00.000Z",
          title: "Hidden",
        },
      ],
      [
        {
          id: "sent",
          story_id: "story-1",
          user_id: USER,
          recipient_user_id: SENDER,
          read_at: null,
        },
        {
          id: "read-reply",
          story_id: "story-2",
          user_id: SENDER,
          recipient_user_id: USER,
          read_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      USER
    );

    expect(counts).toEqual({ prayerCount: 0, inboxCount: 0 });
  });

  it("does not count general approval notifications as prayer or inbox", () => {
    const counts = computeMobileNavBadgeCounts(
      [
        {
          id: "approval",
          category: "approval",
          message_type: "story_approved",
          read: false,
          title: "Approved",
        },
      ],
      [],
      USER
    );

    expect(counts).toEqual({ prayerCount: 0, inboxCount: 0 });
  });

  it("maps badge counts to nav destinations", () => {
    const counts = { prayerCount: 4, inboxCount: 2 };
    expect(getMobileNavBadgeCountForHref("/prayer", counts)).toBe(4);
    expect(getMobileNavBadgeCountForHref("/journey", counts)).toBe(2);
    expect(getMobileNavBadgeCountForHref("/feed", counts)).toBe(0);
  });
});
