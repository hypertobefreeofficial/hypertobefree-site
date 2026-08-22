import { describe, expect, it } from "vitest";
import {
  buildPrivateInboxMediaReference,
  getPrivateInboxMediaObjectPath,
  isPrivateInboxMediaReference,
  JOURNEY_PRIVATE_MEDIA_PREFIX,
} from "./privateMedia";

describe("journey inbox private media references", () => {
  it("builds private bucket references without public URLs", () => {
    const reference = buildPrivateInboxMediaReference(
      "owner-1",
      "thread-1",
      "mp4"
    );

    expect(reference.startsWith(JOURNEY_PRIVATE_MEDIA_PREFIX)).toBe(true);
    expect(reference).not.toMatch(/^https?:\/\//);
    expect(reference).toMatch(
      /^journey-private-media\/owner-1\/thread-1\/[0-9a-f-]{36}\.mp4$/
    );
  });

  it("detects private inbox media references", () => {
    expect(
      isPrivateInboxMediaReference(
        "journey-private-media/owner-1/thread-1/object.mp4"
      )
    ).toBe(true);
    expect(
      isPrivateInboxMediaReference(
        "https://example.supabase.co/storage/v1/object/public/story-videos/prayer-videos/story-1/reply-user.mp4"
      )
    ).toBe(false);
  });

  it("extracts the private object path from a stored reference", () => {
    const reference =
      "journey-private-media/owner-1/thread-1/7d8b2f2e-1d44-4a6a-9a6a-1b2c3d4e5f60.mp4";
    expect(getPrivateInboxMediaObjectPath(reference)).toBe(
      "owner-1/thread-1/7d8b2f2e-1d44-4a6a-9a6a-1b2c3d4e5f60.mp4"
    );
  });
});
