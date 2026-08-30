import { describe, expect, it, vi } from "vitest";
import {
  createProfileAvatarReferenceVerifier,
  parseProfileAvatarStoragePath,
} from "./accountDeletionProfileAvatarVerifier";

const TARGET = "11111111-1111-4111-8111-111111111111";

describe("accountDeletionProfileAvatarVerifier", () => {
  it("parses profile avatar storage paths without query tokens", () => {
    expect(
      parseProfileAvatarStoragePath(
        `profile-avatars/${TARGET}/avatar.png?token=secret`
      )
    ).toBe(`${TARGET}/avatar.png`);
  });

  it("verifies cleared avatar references via server-side read", async () => {
    const verifier = createProfileAvatarReferenceVerifier({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: { id: TARGET, avatar_url: null },
              error: null,
            })),
          })),
        })),
      })),
    } as never);

    const result = await verifier({
      targetUserId: TARGET,
      bucket: "profile-avatars",
      path: `${TARGET}/avatar.png`,
    });

    expect(result).toEqual({ ok: true, verified: true });
  });

  it("fails closed when profile still references the avatar object", async () => {
    const verifier = createProfileAvatarReferenceVerifier({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                id: TARGET,
                avatar_url: `profile-avatars/${TARGET}/avatar.png`,
              },
              error: null,
            })),
          })),
        })),
      })),
    } as never);

    const result = await verifier({
      targetUserId: TARGET,
      bucket: "profile-avatars",
      path: `${TARGET}/avatar.png`,
    });

    expect(result.ok).toBe(true);
    if (result.ok && "verified" in result) {
      expect(result.verified).toBe(false);
    }
  });
});
