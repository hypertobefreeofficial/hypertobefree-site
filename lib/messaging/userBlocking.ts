import { supabase } from "../supabaseClient";

/** Throws when either user has blocked the other. */
export async function assertUsersNotBlocked(
  senderUserId: string,
  recipientUserId: string
) {
  const { data, error } = await supabase
    .from("blocked_users")
    .select("blocker_user_id")
    .or(
      `and(blocker_user_id.eq.${senderUserId},blocked_user_id.eq.${recipientUserId}),and(blocker_user_id.eq.${recipientUserId},blocked_user_id.eq.${senderUserId})`
    )
    .limit(1);

  if (error) {
    console.error("Messaging block check failed:", error.message);
    throw new Error("Could not verify messaging permissions. Please try again.");
  }

  if ((data ?? []).length > 0) {
    throw new Error("You cannot send messages to this person.");
  }
}
