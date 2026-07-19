import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  checkModerateStoryRateLimit,
  handleModerateStoryRequest,
  parseModerateStoryBody,
} from "./moderateStoryHandler";

const mockUser: User = {
  id: "user-123",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
};

function buildRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/moderate-story", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("parseModerateStoryBody", () => {
  it("rejects non-object bodies", () => {
    expect(parseModerateStoryBody(null).ok).toBe(false);
  });

  it("accepts valid story fields", () => {
    const parsed = parseModerateStoryBody({
      story_type: "Prayer Request",
      story_text: "Please pray for my family.",
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.storyType).toBe("Prayer Request");
      expect(parsed.storyText).toBe("Please pray for my family.");
    }
  });

  it("rejects oversized story text", () => {
    const parsed = parseModerateStoryBody({
      story_text: "x".repeat(12001),
    });
    expect(parsed.ok).toBe(false);
  });
});

describe("checkModerateStoryRateLimit", () => {
  it("allows the first request for a user", () => {
    expect(
      checkModerateStoryRateLimit({
        userId: "rate-user-1",
        clientIp: "127.0.0.1",
      }).allowed
    ).toBe(true);
  });
});

describe("handleModerateStoryRequest", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.OPENAI_API_KEY = "sk-test-key";
  });

  it("returns empty-text review response without calling OpenAI", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const request = buildRequest({ story_type: "", story_text: "" });

    const result = await handleModerateStoryRequest({
      request,
      auth: {
        user: mockUser,
        accessToken: "token",
        supabase: {} as never,
      },
      requestId: "req-empty",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.aiFlags).toEqual(["empty_text"]);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns provider failure without auto-approve body fields", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("provider exploded", { status: 500 })
    );

    const result = await handleModerateStoryRequest({
      request: buildRequest({
        story_type: "Testimony",
        story_text: "God is good.",
      }),
      auth: {
        user: mockUser,
        accessToken: "token",
        supabase: {} as never,
      },
      requestId: "req-fail-body",
    });

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.code).toBe("provider_failed");
      expect(result).not.toHaveProperty("statusToUse");
    }
  });

  it("returns provider failure on OpenAI timeout", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("The operation was aborted"));

    const result = await handleModerateStoryRequest({
      request: buildRequest({
        story_type: "Testimony",
        story_text: "Please review this.",
      }),
      auth: {
        user: mockUser,
        accessToken: "token",
        supabase: {} as never,
      },
      requestId: "req-timeout",
    });

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.code).toBe("provider_failed");
      expect(result.status).toBe(502);
    }
  });

  it("returns provider failure on unexpected OpenAI payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await handleModerateStoryRequest({
      request: buildRequest({
        story_type: "Testimony",
        story_text: "Unexpected payload path.",
      }),
      auth: {
        user: mockUser,
        accessToken: "token",
        supabase: {} as never,
      },
      requestId: "req-unexpected",
    });

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.code).toBe("provider_failed");
    }
  });

  it("returns service unavailable when OpenAI key is missing", async () => {
    delete process.env.OPENAI_API_KEY;

    const result = await handleModerateStoryRequest({
      request: buildRequest({
        story_type: "Testimony",
        story_text: "Missing provider key.",
      }),
      auth: {
        user: mockUser,
        accessToken: "token",
        supabase: {} as never,
      },
      requestId: "req-unconfigured",
    });

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.status).toBe(503);
      expect(result.code).toBe("provider_unconfigured");
    }
  });

  it("returns provider failure without exposing raw provider errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("provider exploded", { status: 500 })
    );

    const request = buildRequest({
      story_type: "Testimony",
      story_text: "God is good.",
    });

    const result = await handleModerateStoryRequest({
      request,
      auth: {
        user: mockUser,
        accessToken: "token",
        supabase: {} as never,
      },
      requestId: "req-fail",
    });

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.status).toBe(502);
      expect(result.code).toBe("provider_failed");
      expect(result.error).not.toMatch(/exploded/i);
    }
  });

  it("returns moderation decision on provider success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              flagged: false,
              categories: {},
              category_scores: { harassment: 0.01 },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const request = buildRequest({
      story_type: "Testimony",
      story_text: "God is good.",
    });

    const result = await handleModerateStoryRequest({
      request,
      auth: {
        user: mockUser,
        accessToken: "token",
        supabase: {} as never,
      },
      requestId: "req-success",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.statusToUse).toBe("approved");
      expect(result.body.aiReviewStatus).toBe("completed");
    }
  });

  it("reuses idempotent cache for duplicate submissions", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              flagged: false,
              categories: {},
              category_scores: { harassment: 0.01 },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const auth = {
      user: mockUser,
      accessToken: "token",
      supabase: {} as never,
    };

    const body = {
      story_type: "Prayer Request",
      story_text: "Please pray for healing.",
    };

    const first = await handleModerateStoryRequest({
      request: buildRequest(body),
      auth,
      requestId: "req-idem-1",
    });
    const second = await handleModerateStoryRequest({
      request: buildRequest(body),
      auth,
      requestId: "req-idem-2",
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.idempotent).toBe(true);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
