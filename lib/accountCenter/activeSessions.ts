import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { resolveSignInProvider } from "./accountInfo";

export const ACTIVE_SESSIONS_EXPLANATORY_NOTE =
  "HTBF cannot currently display a detailed list of your other signed-in devices using the available Supabase Auth APIs. You can still sign out this device, your other sessions, or everywhere.";

export const ACTIVE_SESSIONS_OTHER_DEVICES_SUCCESS_MESSAGE =
  "Your other HTBF sessions were signed out. This browser session is still active.";

export type CurrentSessionDisplay = {
  signInEmail: string | null;
  signInProvider: string | null;
  sessionExpiresAt: string | null;
};

export type ActiveSessionSignOutScope = "local" | "others" | "global";

export type ActiveSessionSignOutFailureCode =
  | "not_authenticated"
  | "auth_error";

export type ActiveSessionSignOutResult =
  | { ok: true }
  | { ok: false; code: ActiveSessionSignOutFailureCode; message: string };

export function formatSessionExpiration(
  expiresAt: number | null | undefined
): string | null {
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) {
    return null;
  }

  const parsed = new Date(expiresAt * 1000);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function resolveCurrentSessionDisplay(
  user: User,
  session: Session | null
): CurrentSessionDisplay {
  const signInEmail = user.email?.trim() || null;

  return {
    signInEmail,
    signInProvider: resolveSignInProvider(user),
    sessionExpiresAt: formatSessionExpiration(session?.expires_at ?? null),
  };
}

export function formatActiveSessionsError(error: unknown): string {
  const message =
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
      ? error.message.toLowerCase()
      : "";

  if (
    message.includes("session") ||
    message.includes("jwt") ||
    message.includes("not authenticated")
  ) {
    return "Your session expired. Please sign in again before managing sessions.";
  }

  return "Could not update your HTBF sessions right now. Please try again.";
}

async function signOutWithScope(
  client: SupabaseClient,
  scope: ActiveSessionSignOutScope
): Promise<ActiveSessionSignOutResult> {
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return {
      ok: false,
      code: "not_authenticated",
      message: "Please sign in again before managing sessions.",
    };
  }

  const { error } = await client.auth.signOut({ scope });

  if (error) {
    return {
      ok: false,
      code: "auth_error",
      message: formatActiveSessionsError(error),
    };
  }

  return { ok: true };
}

export async function signOutCurrentSession(
  client: SupabaseClient
): Promise<ActiveSessionSignOutResult> {
  return signOutWithScope(client, "local");
}

export async function signOutOtherSessions(
  client: SupabaseClient
): Promise<ActiveSessionSignOutResult> {
  return signOutWithScope(client, "others");
}

export async function signOutEverywhere(
  client: SupabaseClient
): Promise<ActiveSessionSignOutResult> {
  return signOutWithScope(client, "global");
}
