/**
 * Server-side profile avatar reference verification for storage deletion (Phase 1D.2).
 * Read-only — does not mutate DB. Future Phase 1E runs after anonymization clears refs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type ProfileAvatarReferenceVerificationResult =
  | { ok: true; verified: true }
  | { ok: true; verified: false; reason: string }
  | { ok: false; reason: string };

export type ProfileAvatarReferenceVerifier = (input: {
  targetUserId: string;
  bucket: string;
  path: string;
}) => Promise<ProfileAvatarReferenceVerificationResult>;

export function parseProfileAvatarStoragePath(
  avatarUrl: string | null | undefined
): string | null {
  if (!avatarUrl || typeof avatarUrl !== "string") {
    return null;
  }

  const trimmed = avatarUrl.trim();
  if (!trimmed.includes("profile-avatars/")) {
    return null;
  }

  const afterBucket = trimmed.split("profile-avatars/")[1]?.split("?")[0];
  if (!afterBucket) {
    return null;
  }

  try {
    return decodeURIComponent(afterBucket);
  } catch {
    return afterBucket;
  }
}

export function createProfileAvatarReferenceVerifier(
  serviceRoleClient: SupabaseClient
): ProfileAvatarReferenceVerifier {
  return async function verifyProfileAvatarReferencesCleared(input) {
    if (input.bucket !== "profile-avatars") {
      return {
        ok: true,
        verified: false,
        reason: "Reference verification applies only to profile-avatars.",
      };
    }

    const { data, error } = await serviceRoleClient
      .from("profiles")
      .select("id, avatar_url")
      .eq("id", input.targetUserId)
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        reason: "Could not verify profile avatar reference state.",
      };
    }

    if (!data) {
      return { ok: true, verified: true };
    }

    const livePath = parseProfileAvatarStoragePath(data.avatar_url);
    if (!livePath) {
      return { ok: true, verified: true };
    }

    if (livePath === input.path) {
      return {
        ok: true,
        verified: false,
        reason: "profiles.avatar_url still references this avatar object.",
      };
    }

    return { ok: true, verified: true };
  };
}
