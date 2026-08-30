import { describe, expect, it } from "vitest";
import {
  decodeStoragePathSegmentOnce,
  parseSupabaseStorageObjectUrl,
  resolveStorageReference,
  uuidEquals,
} from "./accountDeletionStorageReferenceRules";

const TARGET = "11111111-1111-4111-8111-111111111111";
const HOST = "https://example.supabase.co";

describe("accountDeletionStorageReferenceRules", () => {
  it("parses signed, public, and authenticated Supabase URLs once", () => {
    const objectPath = `${TARGET}/thread/object.mp4`;

    for (const marker of ["sign", "public", "authenticated"] as const) {
      const url = `${HOST}/storage/v1/object/${marker}/journey-private-media/${encodeURIComponent(objectPath)}?token=secret#frag`;
      const parsed = parseSupabaseStorageObjectUrl({
        value: url,
        expectedBucket: "journey-private-media",
      });
      expect(parsed.objectPath).toBe(objectPath);
      expect(parsed.bucket).toBe("journey-private-media");
    }
  });

  it("rejects encoded traversal after single decode", () => {
    const resolved = resolveStorageReference({
      value: `journey-private-media/${TARGET}/thread/%2e%2e/other.mp4`,
      bucket: "journey-private-media",
    });
    expect(resolved.path).toBe(`${TARGET}/thread/../other.mp4`);
  });

  it("compares UUIDs case-insensitively", () => {
    expect(uuidEquals(TARGET, TARGET.toUpperCase())).toBe(true);
  });

  it("does not double-decode already decoded paths", () => {
    expect(decodeStoragePathSegmentOnce("plain/path.mp4")).toBe("plain/path.mp4");
  });
});
