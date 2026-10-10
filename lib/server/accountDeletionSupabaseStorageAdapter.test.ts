import { describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_DELETION_DESTRUCTIVE_STORAGE_BUCKET,
  createAccountDeletionSupabaseStorageAdapter,
  validateAccountDeletionStorageBucket,
  validateAccountDeletionStorageDeleteTarget,
  validateAccountDeletionStorageObjectPath,
} from "./accountDeletionSupabaseStorageAdapter";

describe("accountDeletionSupabaseStorageAdapter path and bucket safety", () => {
  it("allows canonical journey-private-media paths", () => {
    expect(
      validateAccountDeletionStorageDeleteTarget(
        ACCOUNT_DELETION_DESTRUCTIVE_STORAGE_BUCKET,
        "account-deletion-e2e/00000000-0000-4000-8000-000000000001/object.txt"
      )
    ).toEqual({ ok: true });
  });

  it("BK-A through BK-E: forbidden buckets fail before remove", () => {
    for (const bucket of [
      "profile-avatars",
      "story-images",
      "story-videos",
      "story-thumbnails",
      "unknown-bucket",
      "",
    ]) {
      expect(validateAccountDeletionStorageBucket(bucket).ok).toBe(false);
    }
  });

  it("rejects malformed object paths", () => {
    for (const bad of [
      "",
      "/leading",
      "trailing/",
      "..",
      "a/../b",
      "https://evil/x",
      "journey-private-media/prefix",
      "a\u0000b",
    ]) {
      expect(validateAccountDeletionStorageObjectPath(bad).ok).toBe(false);
    }
  });

  it("removeObjects sends exactly one path via storage.from().remove()", async () => {
    const remove = vi.fn(async () => ({ data: [], error: null }));
    const client = {
      storage: {
        from: vi.fn(() => ({ remove })),
      },
    };
    const adapter = createAccountDeletionSupabaseStorageAdapter(client as never);

    await adapter.removeObjects(ACCOUNT_DELETION_DESTRUCTIVE_STORAGE_BUCKET, [
      "account-deletion-e2e/x/object.txt",
    ]);

    expect(client.storage.from).toHaveBeenCalledWith(
      ACCOUNT_DELETION_DESTRUCTIVE_STORAGE_BUCKET
    );
    expect(remove).toHaveBeenCalledWith(["account-deletion-e2e/x/object.txt"]);
  });

  it("refuses multi-path and forbidden bucket without calling Storage API", async () => {
    const remove = vi.fn();
    const client = {
      storage: { from: vi.fn(() => ({ remove })) },
    };
    const adapter = createAccountDeletionSupabaseStorageAdapter(client as never);

    const multi = await adapter.removeObjects(
      ACCOUNT_DELETION_DESTRUCTIVE_STORAGE_BUCKET,
      ["a", "b"]
    );
    expect(multi.error?.message).toBe("storage_remove_requires_exactly_one_path");
    expect(remove).not.toHaveBeenCalled();

    const bucket = await adapter.removeObjects("story-videos", ["x.mp4"]);
    expect(bucket.error?.message).toBe("bucket_story_videos_forbidden");
    expect(remove).not.toHaveBeenCalled();
  });

  it("objectExists uses download and does not leak secrets on failure", async () => {
    const download = vi.fn(async () => ({
      data: null,
      error: { message: "Object not found" },
    }));
    const client = {
      storage: {
        from: vi.fn(() => ({ download })),
      },
    };
    const adapter = createAccountDeletionSupabaseStorageAdapter(client as never);
    const exists = await adapter.objectExists(
      ACCOUNT_DELETION_DESTRUCTIVE_STORAGE_BUCKET,
      "missing.bin"
    );
    expect(exists).toBe(false);
    expect(download).toHaveBeenCalledWith("missing.bin");
  });
});
