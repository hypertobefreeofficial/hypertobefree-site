import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Returns true when either user has blocked the other. */
export async function areUsersBlocked(
  adminClient: SupabaseClient,
  userA: string,
  userB: string
): Promise<boolean> {
  if (userA === userB) return false;

  const { data, error } = await adminClient
    .from("blocked_users")
    .select("blocker_user_id")
    .or(
      `and(blocker_user_id.eq.${userA},blocked_user_id.eq.${userB}),and(blocker_user_id.eq.${userB},blocked_user_id.eq.${userA})`
    )
    .limit(1);

  if (error) {
    console.error("Block lookup failed:", error.message);
    // Fail closed for submission paths — treat lookup errors as blocked.
    return true;
  }

  return (data ?? []).length > 0;
}

export async function isBlockedFromUser(
  client: SupabaseClient,
  viewerUserId: string,
  otherUserId: string
): Promise<boolean> {
  if (viewerUserId === otherUserId) return false;

  const { data, error } = await client
    .from("blocked_users")
    .select("blocker_user_id")
    .or(
      `and(blocker_user_id.eq.${viewerUserId},blocked_user_id.eq.${otherUserId}),and(blocker_user_id.eq.${otherUserId},blocked_user_id.eq.${viewerUserId})`
    )
    .limit(1);

  if (error) {
    console.error("Block lookup failed:", error.message);
    return true;
  }

  return (data ?? []).length > 0;
}
