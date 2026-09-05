import { createClient } from "@supabase/supabase-js";
import type { ReplyMode } from "../../../../../lib/journey/inbox/types";
import {
  accountDeletionInProgressResponse,
  assertAccountDeletionActorCanWrite,
  createAccountDeletionActorWriteGuardDeps,
} from "../../../../../lib/server/accountDeletionActorWriteGuard";
import { authenticateSupabaseRequest } from "../../../../../lib/server/authenticateSupabaseRequest";
import { createJourneyThreadReply } from "../../../../../lib/server/journeyInboxReply";

function json(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}

function isReplyMode(value: unknown): value is ReplyMode {
  return value === "text" || value === "video";
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
        error: "Journey inbox replies are unavailable right now.",
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
  const parentMessageId =
    typeof record.parentMessageId === "string" ? record.parentMessageId.trim() : "";
  const replyBody = typeof record.body === "string" ? record.body : "";
  const replyMode = record.replyMode;
  const videoUrl =
    typeof record.videoUrl === "string" ? record.videoUrl.trim() : null;

  if (!parentMessageId) {
    return json(
      { ok: false, error: "Message not found.", code: "invalid_parent_message_id" },
      400
    );
  }

  if (!isReplyMode(replyMode)) {
    return json(
      { ok: false, error: "Invalid reply mode.", code: "invalid_reply_mode" },
      400
    );
  }

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

  const result = await createJourneyThreadReply({
    adminClient,
    senderUserId: auth.context.user.id,
    parentMessageId,
    body: replyBody,
    replyMode,
    videoUrl,
  });

  if (result.ok === false) {
    return json(
      { ok: false, error: result.error, code: result.code },
      result.status
    );
  }

  return json(
    {
      ok: true,
      message: result.senderMessage,
    },
    200
  );
}
