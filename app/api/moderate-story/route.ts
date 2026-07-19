import { NextResponse } from "next/server";
import { authenticateSupabaseRequest } from "../../../lib/server/authenticateSupabaseRequest";
import { handleModerateStoryRequest } from "../../../lib/server/moderateStoryHandler";
import { rateLimitResponse } from "../../../lib/server/prayerRateLimit";

function createRequestId() {
  return `mod-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(request: Request) {
  const requestId = createRequestId();

  try {
    const auth = await authenticateSupabaseRequest(request);
    if (auth.ok === false) {
      console.warn(
        JSON.stringify({
          kind: "moderate_story",
          requestId,
          code: auth.code,
        })
      );
      return NextResponse.json(
        { ok: false, error: auth.error, code: auth.code },
        { status: auth.status }
      );
    }

    const result = await handleModerateStoryRequest({
      request,
      auth: auth.context,
      requestId,
    });

    if (result.ok === false) {
      if (result.code === "rate_limited" && result.retryAfterSeconds) {
        return rateLimitResponse(result.retryAfterSeconds);
      }

      return NextResponse.json(
        { ok: false, error: result.error, code: result.code },
        { status: result.status }
      );
    }

    return NextResponse.json(result.body, { status: result.status });
  } catch {
    console.error(
      JSON.stringify({
        kind: "moderate_story",
        requestId,
        code: "unexpected_error",
      })
    );

    return NextResponse.json(
      {
        ok: false,
        error: "We couldn't complete moderation. Please try again.",
        code: "unexpected_error",
      },
      { status: 500 }
    );
  }
}
