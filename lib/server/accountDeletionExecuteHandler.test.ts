import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import {
  ACCOUNT_DELETION_EXECUTION_ENV_FLAG,
} from "./accountDeletionExecutionPolicy";
import {
  resetRateLimitBucketsForTests,
  PRAYER_RATE_LIMITS,
} from "./prayerRateLimit";
import { ACCOUNT_DELETION_STATUS } from "../accountCenter/accountDeletionLifecycle";

const mockAuthenticateSupabaseRequest = vi.fn();
const mockVerifyAdmin = vi.fn();
const mockVerifyAdminAal2 = vi.fn();
const mockPrepareExecution = vi.fn();
const mockCreateExecutionDeps = vi.fn();

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
    createAccountDeletionDryRunDeps: vi.fn(() => ({ mocked: true })),
  };
});

vi.mock("./accountDeletionExecutor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./accountDeletionExecutor")>();
  return {
    ...actual,
    verifyAdminAal2ForAccountDeletionExecution: (...args: unknown[]) =>
      mockVerifyAdminAal2(...args),
    prepareAccountDeletionExecution: (...args: unknown[]) =>
      mockPrepareExecution(...args),
    createAccountDeletionExecutionDeps: (...args: unknown[]) =>
      mockCreateExecutionDeps(...args),
  };
});

const mockUser: User = {
  id: "admin-user",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
};

function buildRequest(
  requestId: string,
  options: {
    query?: string;
    token?: string;
    body?: Record<string, unknown>;
  } = {}
) {
  const url = `https://htbf.test/api/admin/account-deletion/${requestId}/execute${options.query ?? ""}`;
  const headers: Record<string, string> = {};
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const init: RequestInit = { method: "POST", headers };
  if (options.body) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  return new Request(url, init);
}

describe("account deletion execute handler and route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitBucketsForTests();
    delete process.env[ACCOUNT_DELETION_EXECUTION_ENV_FLAG];
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    mockCreateExecutionDeps.mockReturnValue({
      isExecutionEnabled: () =>
        process.env[ACCOUNT_DELETION_EXECUTION_ENV_FLAG] === "true",
    });

    mockPrepareExecution.mockResolvedValue({
      ok: true,
      requestId: "req-1",
      targetUserId: "target-from-request",
      requestStatus: ACCOUNT_DELETION_STATUS.APPROVED,
      stages: [],
      destructiveStages: [],
      manifestSummary: { blocked: false, blockCode: null, warningCount: 0 },
      auditPreview: { action: "account_deletion_execution" },
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuthenticateSupabaseRequest.mockResolvedValue({
      ok: false,
      status: 401,
      code: "unauthorized",
      error: "Please sign in to continue.",
    });

    const { handleAccountDeletionExecuteRequest } = await import(
      "./accountDeletionExecuteHandler"
    );
    const result = await handleAccountDeletionExecuteRequest({
      request: buildRequest("req-1"),
      requestId: "req-1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(401);
    expect(mockPrepareExecution).not.toHaveBeenCalled();
  });

  it("returns 403 for authenticated non-admin", async () => {
    mockAuthenticateSupabaseRequest.mockResolvedValue({
      ok: true,
      context: { user: mockUser, accessToken: "token", supabase: {} },
    });
    mockVerifyAdmin.mockResolvedValue(false);

    const { handleAccountDeletionExecuteRequest } = await import(
      "./accountDeletionExecuteHandler"
    );
    const result = await handleAccountDeletionExecuteRequest({
      request: buildRequest("req-1", { token: "token" }),
      requestId: "req-1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
    expect(mockPrepareExecution).not.toHaveBeenCalled();
  });

  it("returns mfa_step_up_required for admin AAL1 when execution is enabled", async () => {
    process.env[ACCOUNT_DELETION_EXECUTION_ENV_FLAG] = "true";
    mockAuthenticateSupabaseRequest.mockResolvedValue({
      ok: true,
      context: { user: mockUser, accessToken: "admin-token", supabase: {} },
    });
    mockVerifyAdmin.mockResolvedValue(true);
    mockVerifyAdminAal2.mockResolvedValue({
      ok: false,
      code: "mfa_step_up_required",
    });

    const { handleAccountDeletionExecuteRequest } = await import(
      "./accountDeletionExecuteHandler"
    );
    const result = await handleAccountDeletionExecuteRequest({
      request: buildRequest("req-1", { token: "admin-token" }),
      requestId: "req-1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({
      code: "mfa_step_up_required",
      error: expect.stringContaining("authenticator"),
    });
    expect(mockPrepareExecution).not.toHaveBeenCalled();
  });

  it("skips AAL2 and rate limiting when execution is globally disabled", async () => {
    mockAuthenticateSupabaseRequest.mockResolvedValue({
      ok: true,
      context: { user: mockUser, accessToken: "admin-token", supabase: {} },
    });
    mockVerifyAdmin.mockResolvedValue(true);

    const { handleAccountDeletionExecuteRequest } = await import(
      "./accountDeletionExecuteHandler"
    );
    const result = await handleAccountDeletionExecuteRequest({
      request: buildRequest("req-1", { token: "admin-token" }),
      requestId: "req-1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(503);
    expect(result.body).toMatchObject({
      code: "execution_disabled",
      error: "account_deletion_execution_disabled",
    });
    expect(mockVerifyAdminAal2).not.toHaveBeenCalled();
    expect(mockPrepareExecution).not.toHaveBeenCalled();
    expect(mockCreateExecutionDeps).not.toHaveBeenCalled();
  });

  it("returns execution_disabled when flag is missing after admin auth", async () => {
    mockAuthenticateSupabaseRequest.mockResolvedValue({
      ok: true,
      context: { user: mockUser, accessToken: "admin-token", supabase: {} },
    });
    mockVerifyAdmin.mockResolvedValue(true);

    const { handleAccountDeletionExecuteRequest } = await import(
      "./accountDeletionExecuteHandler"
    );
    const result = await handleAccountDeletionExecuteRequest({
      request: buildRequest("req-1", { token: "admin-token" }),
      requestId: "req-1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(503);
    expect(result.body).toMatchObject({
      code: "execution_disabled",
      error: "account_deletion_execution_disabled",
    });
    expect(mockPrepareExecution).not.toHaveBeenCalled();
  });

  it("returns execution_disabled when flag is false", async () => {
    process.env[ACCOUNT_DELETION_EXECUTION_ENV_FLAG] = "false";
    mockAuthenticateSupabaseRequest.mockResolvedValue({
      ok: true,
      context: { user: mockUser, accessToken: "admin-token", supabase: {} },
    });
    mockVerifyAdmin.mockResolvedValue(true);

    const { handleAccountDeletionExecuteRequest } = await import(
      "./accountDeletionExecuteHandler"
    );
    const result = await handleAccountDeletionExecuteRequest({
      request: buildRequest("req-1", { token: "admin-token" }),
      requestId: "req-1",
    });

    expect(result.status).toBe(503);
    expect(mockVerifyAdminAal2).not.toHaveBeenCalled();
    expect(mockPrepareExecution).not.toHaveBeenCalled();
  });

  it("runs preparation only when server flag is true", async () => {
    process.env[ACCOUNT_DELETION_EXECUTION_ENV_FLAG] = "true";
    mockAuthenticateSupabaseRequest.mockResolvedValue({
      ok: true,
      context: { user: mockUser, accessToken: "admin-token", supabase: {} },
    });
    mockVerifyAdmin.mockResolvedValue(true);
    mockVerifyAdminAal2.mockResolvedValue({ ok: true });

    const { handleAccountDeletionExecuteRequest } = await import(
      "./accountDeletionExecuteHandler"
    );
    const result = await handleAccountDeletionExecuteRequest({
      request: buildRequest("req-1", { token: "admin-token" }),
      requestId: "req-1",
    });

    expect(result.ok).toBe(true);
    expect(mockPrepareExecution).toHaveBeenCalledWith({
      requestId: "req-1",
      actorUserId: mockUser.id,
      deps: expect.anything(),
    });
  });

  it("rejects arbitrary userId query and body identity injection", async () => {
    const {
      handleAccountDeletionExecuteRequest,
      rejectExecutionIdentityFromRequest,
      rejectExecutionIdentityFromBody,
    } = await import("./accountDeletionExecuteHandler");

    expect(
      rejectExecutionIdentityFromRequest(
        buildRequest("req-1", { query: "?userId=evil", token: "t" })
      )
    ).toBe(true);

    expect(
      await rejectExecutionIdentityFromBody(
        buildRequest("req-1", {
          token: "t",
          body: { userId: "evil" },
        })
      )
    ).toBe(true);

    const result = await handleAccountDeletionExecuteRequest({
      request: buildRequest("req-1", {
        token: "t",
        body: { manifest: { blocked: false } },
      }),
      requestId: "req-1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(mockPrepareExecution).not.toHaveBeenCalled();
  });

  it("returns idempotent success for already_deleted", async () => {
    process.env[ACCOUNT_DELETION_EXECUTION_ENV_FLAG] = "true";
    mockAuthenticateSupabaseRequest.mockResolvedValue({
      ok: true,
      context: { user: mockUser, accessToken: "admin-token", supabase: {} },
    });
    mockVerifyAdmin.mockResolvedValue(true);
    mockVerifyAdminAal2.mockResolvedValue({ ok: true });
    mockPrepareExecution.mockResolvedValue({
      ok: false,
      code: "already_deleted",
      stages: [],
      request: { status: ACCOUNT_DELETION_STATUS.DELETED },
    });

    const { handleAccountDeletionExecuteRequest } = await import(
      "./accountDeletionExecuteHandler"
    );
    const result = await handleAccountDeletionExecuteRequest({
      request: buildRequest("req-deleted", { token: "admin-token" }),
      requestId: "req-deleted",
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
  });

  it("applies dedicated execution rate limit per admin", async () => {
    process.env[ACCOUNT_DELETION_EXECUTION_ENV_FLAG] = "true";
    mockAuthenticateSupabaseRequest.mockResolvedValue({
      ok: true,
      context: { user: mockUser, accessToken: "admin-token", supabase: {} },
    });
    mockVerifyAdmin.mockResolvedValue(true);
    mockVerifyAdminAal2.mockResolvedValue({ ok: true });

    const { handleAccountDeletionExecuteRequest } = await import(
      "./accountDeletionExecuteHandler"
    );

    for (let i = 0; i < PRAYER_RATE_LIMITS.accountDeletionExecute.limit; i += 1) {
      const attempt = await handleAccountDeletionExecuteRequest({
        request: buildRequest("req-1", { token: "admin-token" }),
        requestId: "req-1",
      });
      expect(attempt.status).not.toBe(429);
    }

    const blocked = await handleAccountDeletionExecuteRequest({
      request: buildRequest("req-1", { token: "admin-token" }),
      requestId: "req-1",
    });

    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ code: "rate_limited" });
  });

  it("does not expose service role key or NEXT_PUBLIC execution flag", async () => {
    const handlerSource = readFileSync(
      "lib/server/accountDeletionExecuteHandler.ts",
      "utf8"
    );
    expect(handlerSource).not.toContain("NEXT_PUBLIC_HTBF_ACCOUNT_DELETION");
    expect(handlerSource).not.toContain("NEXT_PUBLIC_ACCOUNT_DELETION_EXECUTION");
    expect(readFileSync(".env.example", "utf8")).not.toContain(
      ACCOUNT_DELETION_EXECUTION_ENV_FLAG
    );

    process.env[ACCOUNT_DELETION_EXECUTION_ENV_FLAG] = "true";
    mockAuthenticateSupabaseRequest.mockResolvedValue({
      ok: true,
      context: { user: mockUser, accessToken: "admin-token", supabase: {} },
    });
    mockVerifyAdmin.mockResolvedValue(true);
    mockVerifyAdminAal2.mockResolvedValue({ ok: true });

    const { handleAccountDeletionExecuteRequest } = await import(
      "./accountDeletionExecuteHandler"
    );
    const result = await handleAccountDeletionExecuteRequest({
      request: buildRequest("req-1", { token: "admin-token" }),
      requestId: "req-1",
    });

    expect(JSON.stringify(result)).not.toContain("service-role-key");
  });

  it("route returns sanitized JSON without destructive execution", async () => {
    process.env[ACCOUNT_DELETION_EXECUTION_ENV_FLAG] = "true";
    mockAuthenticateSupabaseRequest.mockResolvedValue({
      ok: true,
      context: { user: mockUser, accessToken: "admin-token", supabase: {} },
    });
    mockVerifyAdmin.mockResolvedValue(true);
    mockVerifyAdminAal2.mockResolvedValue({ ok: true });

    const { POST } = await import(
      "../../app/api/admin/account-deletion/[requestId]/execute/route"
    );

    const response = await POST(
      buildRequest("req-1", { token: "admin-token" }),
      { params: Promise.resolve({ requestId: "req-1" }) }
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.code).toBe("execution_prepared");
    expect(JSON.stringify(json)).not.toMatch(/deleteUser|service-role/i);
  });

  it("does not ship auth.admin.deleteUser in execute handler", () => {
    const source = readFileSync(
      "lib/server/accountDeletionExecuteHandler.ts",
      "utf8"
    );
    expect(source).not.toContain("deleteUser");
    expect(source).not.toContain(".remove(");
  });
});

describe("admin UI execute safety", () => {
  it("does not add an active permanent deletion button", () => {
    const adminPage = readFileSync("app/admin/page.tsx", "utf8");
    expect(adminPage).not.toContain("Execute Permanent Deletion");
    expect(adminPage.replace(/\s+/g, " ")).toContain(
      "Permanent deletion execution is not enabled yet"
    );
  });
});
