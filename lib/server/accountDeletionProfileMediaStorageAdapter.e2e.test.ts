import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  assertLocalSupabaseForStorageE2e,
  isAccountDeletionStorageE2eTestEnabled,
} from "./accountDeletionStorageE2ePolicy";
import {
  ACCOUNT_DELETION_PROFILE_MEDIA_STORAGE_BUCKET,
  createAccountDeletionProfileMediaStorageAdapter,
} from "./accountDeletionProfileMediaStorageAdapter";
import { createAccountDeletionServiceRoleSupabaseClient } from "./accountDeletionStorageProviderSafety";

const e2eEnabled = isAccountDeletionStorageE2eTestEnabled();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const localApiOk =
  e2eEnabled &&
  !!supabaseUrl &&
  (() => {
    try {
      assertLocalSupabaseForStorageE2e(supabaseUrl);
      return true;
    } catch {
      return false;
    }
  })();
const describeE2e = localApiOk ? describe : describe.skip;

describeE2e(
  "account deletion profile-media Storage adapter (local E2E opt-in)",
  () => {
    const syntheticOwner = randomUUID();
    const syntheticPath = `${syntheticOwner}/avatar.png`;
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    afterAll(async () => {
      const client = createAccountDeletionServiceRoleSupabaseClient();
      await createAccountDeletionProfileMediaStorageAdapter(client).removeObject(
        syntheticPath
      );
    });

    it("uploads synthetic avatar, deletes through profile adapter, then confirms absent", async () => {
      expect(ACCOUNT_DELETION_PROFILE_MEDIA_STORAGE_BUCKET).toBe(
        "profile-avatars"
      );
      const client = createAccountDeletionServiceRoleSupabaseClient();
      const upload = await client.storage
        .from(ACCOUNT_DELETION_PROFILE_MEDIA_STORAGE_BUCKET)
        .upload(syntheticPath, bytes, {
          contentType: "image/png",
          upsert: true,
        });
      expect(
        upload.error,
        "Local profile-avatars fixture bucket must already exist; do not weaken the E2E guard or seed Production."
      ).toBeNull();

      const adapter = createAccountDeletionProfileMediaStorageAdapter(client);
      await expect(adapter.objectExists(syntheticPath)).resolves.toEqual({
        status: "exists",
      });
      await expect(adapter.removeObject(syntheticPath)).resolves.toEqual({
        ok: true,
      });

      await expect(adapter.objectExists(syntheticPath)).resolves.toEqual({
        status: "absent",
      });
      await expect(adapter.objectExists(syntheticPath)).resolves.toEqual({
        status: "absent",
      });
    });
  }
);
