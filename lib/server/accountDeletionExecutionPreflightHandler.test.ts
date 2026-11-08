import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { ACCOUNT_DELETION_EXECUTION_ALLOWED_REQUEST_IDS_ENV } from "./accountDeletionExecutionAllowlist";
import { ACCOUNT_DELETION_EXECUTION_ENV_FLAG } from "./accountDeletionExecutionPolicy";
import {
  PRAYER_RATE_LIMITS,
  resetRateLimitBucketsForTests,
} from "./prayerRateLimit";
import { ACCOUNT_DELETION_STATUS } from "../accountCenter/accountDeletionLifecycle";

const mockMaybeSingle = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: (...args: unknown[]) => mockMaybeSingle(...args),
        })),
      })),
    })),
  })),
}));

const mockAuthenticateSupabaseRequest = vi.fn();
const mockVerifyAdmin = vi.fn();
const mockVerifyOwner = vi.fn();
const mockVerifyAdminAal2 = vi.fn();
const mockFetchSchemaProbe = vi.fn();
const mockRunPreflight = vi.fn();

vi.mock("./authenticateSupabaseRequest", () => ({
  authenticateSupabaseRequest: (...args: unknown[]) =>
    mockAuthenticateSupabaseRequest(...args),
}));

vi.mock("./accountDeletionManifest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./accountDeletionManifest")>();
  return {
    ...actual,
    verifyAdminForAccountDeletionDryRun: (...args: unknown[]) =>
      mockVerifyAdmin(...args),
  };
});

vi.mock("./accountDeletionExecutor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./accountDeletionExecutor")>();
  return {
    ...actual,
    verifyAdminAal2ForAccountDeletionExecution: (...args: unknown[]) =>
      mockVerifyAdminAal2(...args),
  };
});

vi.mock("./accountDeletionOwnerAuthorization", () => ({
  verifyOwnerForAccountDeletionExecution: (...args: unknown[]) =>
    mockVerifyOwner(...args),
}));

vi.mock("./accountDeletionSchemaProbe", () => ({
  fetchAccountDeletionSchemaProbe: (...args: unknown[]) =>
    mockFetchSchemaProbe(...args),
  isSchemaExecutionReadyFromLiveProbe: (probe: { ready?: boolean }) =>
    probe?.ready === true,
}));

vi.mock("./accountDeletionExecutionPreflight", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("./accountDeletionExecutionPreflight")
  >();
  return {
    ...actual,
    runAccountDeletionExecutionPreflight: (...args: unknown[]) =>
      mockRunPreflight(...args),
    createAccountDeletionExecutionPreflightDeps: vi.fn(() => ({})),
  };
});

const mockUser: User = {
  id: "owner-admin-user",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
};

const REQUEST_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TARGET_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function buildRequest(
  requestId: string,
  options: { query?: string; token?: string } = {}
) {
  const url = `https://htbf.test/api/admin/account-deletion/${requestId}/execution-preflight${options.query ?? ""}`;
  const headers: Record<string, string> = {};
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  return new Request(url, { method: "GET", headers });
}

function enableExecutionWithAllowlist() {
  process.env[ACCOUNT_DELETION_EXECUTION_ENV_FLAG] = "true";
  process.env[ACCOUNT_DELETION_EXECUTION_ALLOWED_REQUEST_IDS_ENV] = REQUEST_ID;
}

describe("account deletion execution-preflight handler and route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitBucketsForTests();
    delete process.env[ACCOUNT_DELETION_EXECUTION_ENV_FLAG];
    delete process.env[ACCOUNT_DELETION_EXECUTION_ALLOWED_REQUEST_IDS_ENV];
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    mockVerifyOwner.mockResolvedValue(true);
    mockVerifyAdmin.mockResolvedValue(true);
    mockVerifyAdminAal2.mockResolvedValue({ ok: true as const });
    mockFetchSchemaProbe.mockResolvedValue({ ready: true, valid: true });
    mockRunPreflight.mockResolvedValue({
      ok: true,
      code: "preflight_ready",
      requestId: REQUEST_ID,
      targetUserId: TARGET_USER_ID,
      summary: {
        operation: "preflight_complete",
        blockerCodes: [],
        childTablesWithQueryFailures: [],
        expectedStoryCount: 49,
        nonAuthoritativeStoryCount: 0,
      },
    });
    mockMaybeSingle.mockResolvedValue({
      data: { status: "approved" },
      error: null,
    });
  });

  function authContext() {
    return {
      ok: true as const,
      context: {
        user: mockUser,
        accessToken: "token",
        supabase: {},
      },
    };
  }

  it("returns 401 when unauthenticated", async () => {
    mockAuthenticateSupabaseRequest.mockResolvedValue({
      ok: false,
      status: 401,
      code: "unauthorized",
      error: "Please sign in to continue.",
    });

    const { handleAccountDeletionExecutionPreflightRequest } = await import(
      "./accountDeletionExecutionPreflightHandler"
    );
    const result = await handleAccountDeletionExecutionPreflightRequest({
      request: buildRequest(REQUEST_ID),
      requestId: REQUEST_ID,
    });

    expect(result.status).toBe(401);
    expect(mockRunPreflight).not.toHaveBeenCalled();
  });

  it("returns 403 when not admin", async () => {
    mockAuthenticateSupabaseRequest.mockResolvedValue({
      ok: true,
      context: {
        user: mockUser,
        accessToken: "token",
        supabase: {},
      },
    });
    mockVerifyAdmin.mockResolvedValue(false);

    const { handleAccountDeletionExecutionPreflightRequest } = await import(
      "./accountDeletionExecutionPreflightHandler"
    );
    const result = await handleAccountDeletionExecutionPreflightRequest({
      request: buildRequest(REQUEST_ID, { token: "token" }),
      requestId: REQUEST_ID,
    });

    expect(result.status).toBe(403);
    expect(mockRunPreflight).not.toHaveBeenCalled();
  });

  it("returns 403 when not owner", async () => {
    mockAuthenticateSupabaseRequest.mockResolvedValue({
      ok: true,
      context: {
        user: mockUser,
        accessToken: "token",
        supabase: {},
      },
    });
    mockVerifyOwner.mockResolvedValue(false);

    const { handleAccountDeletionExecutionPreflightRequest } = await import(
      "./accountDeletionExecutionPreflightHandler"
    );
    const result = await handleAccountDeletionExecutionPreflightRequest({
      request: buildRequest(REQUEST_ID, { token: "token" }),
      requestId: REQUEST_ID,
    });

    expect(result.status).toBe(403);
    expect(mockRunPreflight).not.toHaveBeenCalled();
  });

  it("returns 503 when execution disabled", async () => {
    mockAuthenticateSupabaseRequest.mockResolvedValue({
      ok: true,
      context: {
        user: mockUser,
        accessToken: "token",
        supabase: {},
      },
    });

    const { handleAccountDeletionExecutionPreflightRequest } = await import(
      "./accountDeletionExecutionPreflightHandler"
    );
    const result = await handleAccountDeletionExecutionPreflightRequest({
      request: buildRequest(REQUEST_ID, { token: "token" }),
      requestId: REQUEST_ID,
    });

    expect(result.status).toBe(503);
    expect(mockRunPreflight).not.toHaveBeenCalled();
  });

  it("returns 403 when MFA step-up is required", async () => {
    enableExecutionWithAllowlist();
    mockAuthenticateSupabaseRequest.mockResolvedValue(authContext());
    mockVerifyAdminAal2.mockResolvedValue({
      ok: false,
      code: "mfa_step_up_required",
    });

    const { handleAccountDeletionExecutionPreflightRequest } = await import(
      "./accountDeletionExecutionPreflightHandler"
    );
    const result = await handleAccountDeletionExecutionPreflightRequest({
      request: buildRequest(REQUEST_ID, { token: "token" }),
      requestId: REQUEST_ID,
    });

    expect(result.status).toBe(403);
    const body = result.body as Record<string, unknown>;
    expect(body.code).toBe("mfa_step_up_required");
    expect(mockRunPreflight).not.toHaveBeenCalled();
  });

  it("returns 503 when request is not on execution allowlist", async () => {
    process.env[ACCOUNT_DELETION_EXECUTION_ENV_FLAG] = "true";
    process.env[ACCOUNT_DELETION_EXECUTION_ALLOWED_REQUEST_IDS_ENV] =
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    mockAuthenticateSupabaseRequest.mockResolvedValue(authContext());

    const { handleAccountDeletionExecutionPreflightRequest } = await import(
      "./accountDeletionExecutionPreflightHandler"
    );
    const result = await handleAccountDeletionExecutionPreflightRequest({
      request: buildRequest(REQUEST_ID, { token: "token" }),
      requestId: REQUEST_ID,
    });

    expect(result.status).toBe(503);
    const body = result.body as Record<string, unknown>;
    expect(body.code).toBe("execution_request_not_allowed");
    expect(mockRunPreflight).not.toHaveBeenCalled();
  });

  it("returns schema NO_GO when live catalog probe is not ready", async () => {
    enableExecutionWithAllowlist();
    mockAuthenticateSupabaseRequest.mockResolvedValue(authContext());
    mockFetchSchemaProbe.mockResolvedValue({ ready: false, valid: true });

    const { handleAccountDeletionExecutionPreflightRequest } = await import(
      "./accountDeletionExecutionPreflightHandler"
    );
    const result = await handleAccountDeletionExecutionPreflightRequest({
      request: buildRequest(REQUEST_ID, { token: "token" }),
      requestId: REQUEST_ID,
    });

    expect(result.status).toBe(503);
    const body = result.body as Record<string, unknown>;
    expect(body.goNoGo).toBe("NO_GO");
    expect(body.schemaReady).toBe(false);
    expect(body.preflightCode).toBe("schema_not_ready");
    expect(mockRunPreflight).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limit is exceeded", async () => {
    enableExecutionWithAllowlist();
    mockAuthenticateSupabaseRequest.mockResolvedValue(authContext());

    const { handleAccountDeletionExecutionPreflightRequest } = await import(
      "./accountDeletionExecutionPreflightHandler"
    );
    const request = buildRequest(REQUEST_ID, { token: "token" });
    const limit = PRAYER_RATE_LIMITS.accountDeletionExecutionPreflight.limit;

    for (let i = 0; i < limit; i += 1) {
      const attempt = await handleAccountDeletionExecutionPreflightRequest({
        request,
        requestId: REQUEST_ID,
      });
      expect(attempt.status).toBe(200);
    }

    const blocked = await handleAccountDeletionExecutionPreflightRequest({
      request,
      requestId: REQUEST_ID,
    });
    expect(blocked.status).toBe(429);
    const body = blocked.body as Record<string, unknown>;
    expect(body.code).toBe("rate_limited");
    expect(typeof body.retryAfterSeconds).toBe("number");
    expect(mockRunPreflight).toHaveBeenCalledTimes(limit);
  });

  it("returns NO_GO when request is deletion_in_progress (no misleading GO)", async () => {
    enableExecutionWithAllowlist();
    mockAuthenticateSupabaseRequest.mockResolvedValue(authContext());
    mockMaybeSingle.mockResolvedValue({
      data: { status: ACCOUNT_DELETION_STATUS.DELETION_IN_PROGRESS },
      error: null,
    });

    const { handleAccountDeletionExecutionPreflightRequest } = await import(
      "./accountDeletionExecutionPreflightHandler"
    );
    const result = await handleAccountDeletionExecutionPreflightRequest({
      request: buildRequest(REQUEST_ID, { token: "token" }),
      requestId: REQUEST_ID,
    });

    expect(result.status).toBe(409);
    const body = result.body as Record<string, unknown>;
    expect(body.goNoGo).toBe("NO_GO");
    expect(body.preflightCode).toBe("execution_in_progress");
    expect(body.summary).toMatchObject({
      blockerCodes: ["execution_in_progress"],
    });
    expect(mockRunPreflight).not.toHaveBeenCalled();
    expect(mockFetchSchemaProbe).not.toHaveBeenCalled();
  });

  it("returns GO with sanitized summary when schema and preflight pass", async () => {
    enableExecutionWithAllowlist();
    mockAuthenticateSupabaseRequest.mockResolvedValue(authContext());

    const { handleAccountDeletionExecutionPreflightRequest } = await import(
      "./accountDeletionExecutionPreflightHandler"
    );
    const result = await handleAccountDeletionExecutionPreflightRequest({
      request: buildRequest(REQUEST_ID, { token: "token" }),
      requestId: REQUEST_ID,
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body.goNoGo).toBe("GO");
    expect(body.preflightCode).toBe("preflight_ready");
    expect(body.schemaReady).toBe(true);
    expect(body.summary).toMatchObject({
      expectedStoryCount: 49,
      nonAuthoritativeStoryCount: 0,
    });
    expect(JSON.stringify(body)).not.toContain(TARGET_USER_ID);
    expect(mockRunPreflight).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      deps: expect.anything(),
    });
  });

  it("returns NO_GO when story safety inventory fails", async () => {
    enableExecutionWithAllowlist();
    mockAuthenticateSupabaseRequest.mockResolvedValue(authContext());
    mockRunPreflight.mockResolvedValue({
      ok: false,
      code: "preflight_lookup_failed",
      summary: {
        operation: "story_safety_inventory",
        blockerCodes: ["STORY_INVENTORY_NOT_AUTHORITATIVE"],
        childTablesWithQueryFailures: [],
        expectedStoryCount: 49,
        nonAuthoritativeStoryCount: 5,
      },
    });

    const { handleAccountDeletionExecutionPreflightRequest } = await import(
      "./accountDeletionExecutionPreflightHandler"
    );
    const result = await handleAccountDeletionExecutionPreflightRequest({
      request: buildRequest(REQUEST_ID, { token: "token" }),
      requestId: REQUEST_ID,
    });

    expect(result.status).toBe(503);
    const body = result.body as Record<string, unknown>;
    expect(body.goNoGo).toBe("NO_GO");
    expect(body.summary).toMatchObject({
      nonAuthoritativeStoryCount: 5,
    });
  });

  it("rejects arbitrary userId query parameters", async () => {
    const { handleAccountDeletionExecutionPreflightRequest } = await import(
      "./accountDeletionExecutionPreflightHandler"
    );
    const result = await handleAccountDeletionExecutionPreflightRequest({
      request: buildRequest(REQUEST_ID, { query: "?userId=other" }),
      requestId: REQUEST_ID,
    });
    expect(result.status).toBe(400);
    expect(mockRunPreflight).not.toHaveBeenCalled();
  });

  it("handler and route do not invoke orchestrator, lock acquisition, or mutations", () => {
    const handlerSource = readFileSync(
      "lib/server/accountDeletionExecutionPreflightHandler.ts",
      "utf8"
    );
    expect(handlerSource).not.toContain("runAccountDeletionExecutionOrchestrator");
    expect(handlerSource).not.toContain("acquireAccountDeletionExecutionLock");
    expect(handlerSource).not.toContain("executeAccountDeletionNondestructiveDatabaseStage");
    expect(handlerSource).not.toMatch(/\bDELETE\b|\bINSERT\b|\bUPDATE\b/);

    const routeSource = readFileSync(
      "app/api/admin/account-deletion/[requestId]/execution-preflight/route.ts",
      "utf8"
    );
    expect(routeSource).toContain("GET");
    expect(routeSource).not.toContain("POST");
    expect(routeSource).not.toContain("runAccountDeletionExecutionOrchestrator");
  });

  it("route GET wires handler", async () => {
    enableExecutionWithAllowlist();
    mockAuthenticateSupabaseRequest.mockResolvedValue(authContext());

    const { GET } = await import(
      "../../app/api/admin/account-deletion/[requestId]/execution-preflight/route"
    );
    const response = await GET(buildRequest(REQUEST_ID, { token: "token" }), {
      params: Promise.resolve({ requestId: REQUEST_ID }),
    });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.goNoGo).toBe("GO");
  });
});
