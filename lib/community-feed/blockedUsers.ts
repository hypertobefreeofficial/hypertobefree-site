import { supabase } from "../supabaseClient";

/**
 * Bidirectional block set for Community Feed filtering.
 *
 * Source table: `blocked_users(blocker_user_id, blocked_user_id)`
 *
 * Directions included:
 * 1. Viewer blocked them — `blocker_user_id = viewer`, `blocked_user_id = other`
 * 2. They blocked viewer — `blocker_user_id = other`, `blocked_user_id = viewer`
 *
 * Matches Prayer Connect / server prayer blocking policy.
 */
export async function loadBidirectionalBlockedUserIds(
  viewerUserId: string
): Promise<string[]> {
  const blocked = new Set<string>();

  const [iBlockedResult, blockedMeResult] = await Promise.all([
    supabase
      .from("blocked_users")
      .select("blocked_user_id")
      .eq("blocker_user_id", viewerUserId),
    supabase
      .from("blocked_users")
      .select("blocker_user_id")
      .eq("blocked_user_id", viewerUserId),
  ]);

  if (iBlockedResult.error) {
    console.error(
      "[community-feed] Could not load users blocked by viewer:",
      iBlockedResult.error
    );
  } else {
    for (const row of (iBlockedResult.data as {
      blocked_user_id: string | null;
    }[]) ?? []) {
      if (row.blocked_user_id) blocked.add(row.blocked_user_id);
    }
  }

  if (blockedMeResult.error) {
    console.error(
      "[community-feed] Could not load users who blocked viewer:",
      blockedMeResult.error
    );
  } else {
    for (const row of (blockedMeResult.data as {
      blocker_user_id: string | null;
    }[]) ?? []) {
      if (row.blocker_user_id) blocked.add(row.blocker_user_id);
    }
  }

  return [...blocked];
}

export function isBlockedAuthor(
  userId: string | null | undefined,
  blockedUserIds: Set<string>
) {
  return Boolean(userId && blockedUserIds.has(userId));
}
