import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { resetRateLimitBucketsForTests } from "./prayerRateLimit";

const mockAuthenticateSupabaseRequest = vi.fn();
const mockVerifyAdmin = vi.fn();
const mockBuildManifest = vi.fn();

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
    buildAccountDeletionDryRunManifest: (...args: unknown[]) =>
      mockBuildManifest(...args),
    createAccountDeletionDryRunDeps: vi.fn(() => ({ mocked: true })),
    sanitizeManifestForResponse: (manifest: unknown) => manifest,
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

function buildRequest(requestId: string, query = "", token?: string) {
  const url = `https://htbf.test/api/admin/account-deletion/${requestId}/dry-run${query}`;
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return new Request(url, { method: "GET", headers });
}

describe("account deletion dry-run handler and route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitBucketsForTests();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    mockBuildManifest.mockResolvedValue({
      ok: true,
      manifest: {
        identity: {
          requestId: "req-1",
          targetUserId: "user-target",
        },
        blocked: false,
      },
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuthenticateSupabaseRequest.mockResolvedValue({
      ok: false,
      status: 401,
      code: "unauthorized",
      error: "Please sign in to continue.",
    });

    const { handleAccountDeletionDryRunRequest } = await import(
      "./accountDeletionDryRunHandler"
    );
    const result = await handleAccountDeletionDryRunRequest({
      request: buildRequest("req-1"),
      requestId: "req-1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(401);
    expect(mockBuildManifest).not.toHaveBeenCalled();
  });

  it("returns 403 for authenticated non-admin", async () => {
    mockAuthenticateSupabaseRequest.mockResolvedValue({
      ok: true,
      context: {
        user: mockUser,
        accessToken: "token",
        supabase: {},
      },
    });
    mockVerifyAdmin.mockResolvedValue(false);

    const { handleAccountDeletionDryRunRequest } = await import(
      "./accountDeletionDryRunHandler"
    );
    const result = await handleAccountDeletionDryRunRequest({
      request: buildRequest("req-1", "", "token"),
      requestId: "req-1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
    expect(mockBuildManifest).not.toHaveBeenCalled();
  });

  it("allows admin and resolves target from request id", async () => {
    mockAuthenticateSupabaseRequest.mockResolvedValue({
      ok: true,
      context: {
        user: mockUser,
        accessToken: "admin-token",
        supabase: {},
      },
    });
    mockVerifyAdmin.mockResolvedValue(true);

    const { handleAccountDeletionDryRunRequest } = await import(
      "./accountDeletionDryRunHandler"
    );
    const result = await handleAccountDeletionDryRunRequest({
      request: buildRequest("req-1", "", "admin-token"),
      requestId: "req-1",
    });

    expect(result.ok).toBe(true);
    expect(mockBuildManifest).toHaveBeenCalledWith(
      "req-1",
      expect.anything()
    );
  });

  it("rejects arbitrary userId query parameters", async () => {
    const { handleAccountDeletionDryRunRequest, rejectArbitraryUserIdQuery } =
      await import("./accountDeletionDryRunHandler");

    expect(
      rejectArbitraryUserIdQuery(
        buildRequest("req-1", "?userId=someone-else", "token")
      )
    ).toBe(true);

    const result = await handleAccountDeletionDryRunRequest({
      request: buildRequest("req-1", "?userId=someone-else", "token"),
      requestId: "req-1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(mockBuildManifest).not.toHaveBeenCalled();
  });

  it("route returns sanitized manifest JSON for admin", async () => {
    mockAuthenticateSupabaseRequest.mockResolvedValue({
      ok: true,
      context: {
        user: mockUser,
        accessToken: "admin-token",
        supabase: {},
      },
    });
    mockVerifyAdmin.mockResolvedValue(true);

    const { GET } = await import(
      "../../app/api/admin/account-deletion/[requestId]/dry-run/route"
    );

    const response = await GET(buildRequest("req-1", "", "admin-token"), {
      params: Promise.resolve({ requestId: "req-1" }),
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.manifest.identity.targetUserId).toBe("user-target");
    expect(JSON.stringify(json)).not.toMatch(/service-role/i);
    expect(JSON.stringify(json)).not.toMatch(/refresh_token/i);
  });

  it("does not expose service role key in responses", async () => {
    mockAuthenticateSupabaseRequest.mockResolvedValue({
      ok: true,
      context: {
        user: mockUser,
        accessToken: "admin-token",
        supabase: {},
      },
    });
    mockVerifyAdmin.mockResolvedValue(true);

    const { handleAccountDeletionDryRunRequest } = await import(
      "./accountDeletionDryRunHandler"
    );
    const result = await handleAccountDeletionDryRunRequest({
      request: buildRequest("req-1", "", "admin-token"),
      requestId: "req-1",
    });

    expect(JSON.stringify(result)).not.toContain("service-role-key");
  });
});
