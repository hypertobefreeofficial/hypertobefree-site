import { describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_DELETION_DESTRUCTIVE_STORAGE_BUCKET,
  classifyAccountDeletionStorageDownloadExistence,
  createAccountDeletionSupabaseStorageAdapter,
  validateAccountDeletionStorageBucket,
  validateAccountDeletionStorageDeleteTarget,
  validateAccountDeletionStorageObjectPath,
} from "./accountDeletionSupabaseStorageAdapter";
import { ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE } from "./accountDeletionStorageObjectExistence";

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

  describe("objectExists fail-closed (3B.3F.0)", () => {
    function adapterWithDownload(
      downloadImpl: () => Promise<{ data: Blob | null; error: unknown }>
    ) {
      const download = vi.fn(downloadImpl);
      const client = {
        storage: { from: vi.fn(() => ({ download })) },
      };
      return {
        adapter: createAccountDeletionSupabaseStorageAdapter(client as never),
        download,
      };
    }

    it("A: successful download → exists", async () => {
      const blob = new Blob(["x"]);
      const { adapter } = adapterWithDownload(async () => ({
        data: blob,
        error: null,
      }));
      await expect(
        adapter.objectExists(
          ACCOUNT_DELETION_DESTRUCTIVE_STORAGE_BUCKET,
          "present.bin"
        )
      ).resolves.toEqual({ status: "exists" });
    });

    it("structured statusCode 404 → absent", () => {
      expect(
        classifyAccountDeletionStorageDownloadExistence(null, {
          statusCode: 404,
          message: "Not Found",
        })
      ).toEqual({ status: "absent" });
    });

    it("structured numeric status 404 → absent", () => {
      expect(
        classifyAccountDeletionStorageDownloadExistence(null, {
          status: 404,
          message: "Not Found",
        })
      ).toEqual({ status: "absent" });
    });

    it('structured statusCode "404" → absent', () => {
      expect(
        classifyAccountDeletionStorageDownloadExistence(null, {
          statusCode: "404",
          message: "Not Found",
        })
      ).toEqual({ status: "absent" });
    });

    const uncertainOnly = {
      status: "uncertain" as const,
      code: ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE,
    };

    it.each([
      ["404abc", { statusCode: "404abc" }],
      ["404 Object not found", { statusCode: "404 Object not found" }],
      ['"404.0"', { statusCode: "404.0" }],
      ['status "404abc"', { status: "404abc" }],
    ])("strict 404: statusCode/status %s → uncertain", (_label, error) => {
      expect(classifyAccountDeletionStorageDownloadExistence(null, error)).toEqual(
        uncertainOnly
      );
    });

    it('message "Object not found" with no status → uncertain', async () => {
      expect(
        classifyAccountDeletionStorageDownloadExistence(null, {
          message: "Object not found",
        })
      ).toEqual({
        status: "uncertain",
        code: ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE,
      });
      const { adapter } = adapterWithDownload(async () => ({
        data: null,
        error: { message: "Object not found" },
      }));
      await expect(
        adapter.objectExists(
          ACCOUNT_DELETION_DESTRUCTIVE_STORAGE_BUCKET,
          "missing.bin"
        )
      ).resolves.toEqual({
        status: "uncertain",
        code: ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE,
      });
    });

    it('message "404 Object not found" with no status → uncertain', () => {
      expect(
        classifyAccountDeletionStorageDownloadExistence(null, {
          message: "404 Object not found",
        })
      ).toEqual({
        status: "uncertain",
        code: ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE,
      });
    });

    it('generic "not found" text → uncertain', () => {
      expect(
        classifyAccountDeletionStorageDownloadExistence(null, {
          message: "route not found",
        })
      ).toEqual({
        status: "uncertain",
        code: ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE,
      });
    });

    it.each([
      ["C: 500", { statusCode: 500, message: "Internal Server Error" }],
      ["D: 401", { statusCode: 401, message: "Unauthorized JWT" }],
      ["E: 403", { statusCode: 403, message: "Forbidden" }],
      ["F: 429", { statusCode: 429, message: "Too Many Requests" }],
    ])("%s → uncertain", async (_label, error) => {
      expect(classifyAccountDeletionStorageDownloadExistence(null, error)).toEqual({
        status: "uncertain",
        code: ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE,
      });
    });

    it('thrown Error("404") → uncertain', async () => {
      const { adapter } = adapterWithDownload(async () => {
        throw new Error("404");
      });
      await expect(
        adapter.objectExists(
          ACCOUNT_DELETION_DESTRUCTIVE_STORAGE_BUCKET,
          "x.bin"
        )
      ).resolves.toEqual({
        status: "uncertain",
        code: ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE,
      });
    });

    it("G: thrown/network exception → uncertain", async () => {
      const { adapter } = adapterWithDownload(async () => {
        throw new Error("fetch failed ECONNRESET");
      });
      await expect(
        adapter.objectExists(
          ACCOUNT_DELETION_DESTRUCTIVE_STORAGE_BUCKET,
          "x.bin"
        )
      ).resolves.toEqual({
        status: "uncertain",
        code: ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE,
      });
    });

    it("H: malformed/unknown Storage error → uncertain", async () => {
      expect(
        classifyAccountDeletionStorageDownloadExistence(null, {
          message: "something went wrong",
        })
      ).toEqual({
        status: "uncertain",
        code: ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE,
      });
      expect(classifyAccountDeletionStorageDownloadExistence(null, null)).toEqual({
        status: "uncertain",
        code: ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE,
      });
    });

    it("I: raw provider message is not returned as controlled code", async () => {
      const secret = "Bearer leaked-token service_role=secret";
      const result = classifyAccountDeletionStorageDownloadExistence(null, {
        statusCode: 503,
        message: secret,
      });
      expect(result).toEqual({
        status: "uncertain",
        code: ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE,
      });
      expect(JSON.stringify(result)).not.toContain("Bearer");
      expect(JSON.stringify(result)).not.toContain("service_role");
    });
  });
});
