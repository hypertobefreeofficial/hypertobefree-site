import { createClient } from "@supabase/supabase-js";
import {
  accountDeletionInProgressResponse,
  assertAccountDeletionActorCanWrite,
  createAccountDeletionActorWriteGuardDeps,
} from "../../../../../lib/server/accountDeletionActorWriteGuard";
import { authenticateSupabaseRequest } from "../../../../../lib/server/authenticateSupabaseRequest";
import { createInitialPrivateVideoPrayerReply } from "../../../../../lib/server/journeyInboxReply";

function json(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}

export async function POST(request: Request) {
  const auth = await authenticateSupabaseRequest(request);
  if (auth.ok === false) {
    return json(
      { ok: false, error: auth.error, code: auth.code },
      auth.status
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return json(
      {
        ok: false,
        error: "Private prayer messages are unavailable right now.",
        code: "service_unavailable",
      },
      503
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(
      { ok: false, error: "Invalid request body.", code: "invalid_body" },
      400
    );
  }

  if (typeof body !== "object" || body === null) {
    return json(
      { ok: false, error: "Invalid request body.", code: "invalid_body" },
      400
    );
  }

  const record = body as Record<string, unknown>;
  const storyId = typeof record.storyId === "string" ? record.storyId.trim() : "";
  const messageBody = typeof record.body === "string" ? record.body : "";
  const videoUrl =
    typeof record.videoUrl === "string" ? record.videoUrl.trim() : "";
  const recipientTitle =
    typeof record.recipientTitle === "string" ? record.recipientTitle : undefined;
  const senderTitle =
    typeof record.senderTitle === "string" ? record.senderTitle : undefined;

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const writeGuard = await assertAccountDeletionActorCanWrite(
    auth.context.user.id,
    createAccountDeletionActorWriteGuardDeps(adminClient)
  );
  if (writeGuard.blocked) {
    return accountDeletionInProgressResponse();
  }

  const result = await createInitialPrivateVideoPrayerReply({
    adminClient,
    senderUserId: auth.context.user.id,
    storyId,
    body: messageBody,
    videoUrl,
    labels: {
      recipientTitle,
      senderTitle,
    },
  });

  if (result.ok === false) {
    return json(
      { ok: false, error: result.error, code: result.code },
      result.status
    );
  }

  return json({ ok: true }, 200);
}
