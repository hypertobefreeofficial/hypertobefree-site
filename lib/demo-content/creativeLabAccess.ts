export type CreativeLabAccessReason =
  | "unauthenticated"
  | "forbidden"
  | "probe_error";

export type CreativeLabAccessResult =
  | { allowed: true }
  | { allowed: false; reason: CreativeLabAccessReason };

/** Owner/admin gate for Creative Lab — read-only RPC, no writes. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function verifyCreativeLabAccess(client: any): Promise<CreativeLabAccessResult> {
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return { allowed: false, reason: "unauthenticated" };
  }

  const { data: isAdmin, error } = await client.rpc("current_user_is_admin");

  if (error) {
    return { allowed: false, reason: "probe_error" };
  }

  if (isAdmin !== true) {
    return { allowed: false, reason: "forbidden" };
  }

  return { allowed: true };
}
