import { supabase } from "../supabaseClient";

/**
 * Reuses the app-wide `blocked_users` table (same table used by Freedom Feed
 * and Video Feed) so blocking from Prayer is consistent everywhere.
 */
export async function loadBlockedUserIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("blocked_users")
    .select("blocked_user_id")
    .eq("blocker_user_id", userId);

  if (error) {
    console.error("Could not load blocked users:", error);
    return [];
  }

  return ((data as { blocked_user_id: string | null }[]) ?? [])
    .map((row) => row.blocked_user_id)
    .filter((id): id is string => Boolean(id));
}

export async function blockUser(
  blockerUserId: string,
  blockedUserId: string
): Promise<void> {
  if (blockerUserId === blockedUserId) {
    throw new Error("You cannot block yourself.");
  }
  const { error } = await supabase.from("blocked_users").upsert(
    {
      blocker_user_id: blockerUserId,
      blocked_user_id: blockedUserId,
    },
    { onConflict: "blocker_user_id,blocked_user_id" }
  );
  if (error) throw new Error(error.message);
}
