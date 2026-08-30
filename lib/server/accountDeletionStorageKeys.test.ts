import { describe, expect, it } from "vitest";
import {
  parseStorageObjectKey,
  storageObjectKey,
} from "./accountDeletionStorageKeys";

describe("accountDeletionStorageKeys", () => {
  it("uses an unambiguous separator for bucket and path", () => {
    const path = "user/thread/file:with:colons.mp4";
    const key = storageObjectKey("journey-private-media", path);
    expect(parseStorageObjectKey(key)).toEqual({
      bucket: "journey-private-media",
      path,
    });
  });

  it("normalizes leading slashes in paths", () => {
    expect(storageObjectKey("profile-avatars", "/user/avatar.png")).toBe(
      storageObjectKey("profile-avatars", "user/avatar.png")
    );
  });
});
