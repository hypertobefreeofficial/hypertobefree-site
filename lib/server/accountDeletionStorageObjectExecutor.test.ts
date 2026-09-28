import { describe, expect, it, vi } from "vitest";
import {
  executeAccountDeletionStorageObject,
  mapAccountDeletionStorageProviderError,
  sanitizeAccountDeletionStorageProviderDetail,
  type StorageObjectExistsFn,
} from "./accountDeletionStorageObjectExecutor";
import { isAccountDeletionPhysicalStorageExecutionEnabled } from "./accountDeletionStorageExecutionPolicy";

const FAIL_VALUES = [
  undefined,
  "",
  "false",
  "0",
  "TRUE",
  "True",
  "yes",
  "1",
  " true ",
  "not-a-flag",
] as const;

function envWith(
  globalFlag?: string,
  storageFlag?: string
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  if (globalFlag !== undefined) {
    env.HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED = globalFlag;
  }
  if (storageFlag !== undefined) {
    env.HTBF_ACCOUNT_DELETION_STORAGE_EXECUTION_ENABLED = storageFlag;
  }
  return env;
}

function mockClient(handlers: {
  rpc?: (name: string, args: Record<string, unknown>) => unknown;
  select?: () => unknown;
}) {
  return {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => ({
      data: handlers.rpc?.(name, args),
      error: null,
    })),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => handlers.select?.()),
        })),
      })),
    })),
  };
}

function enabledDeps(
  client: ReturnType<typeof mockClient>,
  remove = vi.fn(),
  objectExists: StorageObjectExistsFn = async () => true
) {
  return {
    serviceRoleClient: client as never,
    removeObjects: remove,
    objectExists,
    isAccountDeletionExecutionEnabled: () => true,
    isStorageExecutionEnabled: () => true,
  };
}

describe("dual kill-switch matrix", () => {
  it("only global=true AND storage=true enables physical execution policy helper", () => {
    expect(
      isAccountDeletionPhysicalStorageExecutionEnabled(
        envWith("true", "true")
      )
    ).toBe(true);
    expect(
      isAccountDeletionPhysicalStorageExecutionEnabled(
        envWith("true", "false")
      )
    ).toBe(false);
    expect(
      isAccountDeletionPhysicalStorageExecutionEnabled(
        envWith("false", "true")
      )
    ).toBe(false);
  });

  for (const badGlobal of FAIL_VALUES) {
    if (badGlobal === "true") continue;
    it(`global=${String(badGlobal)} + storage=true → no RPC/remove/exists`, async () => {
      const remove = vi.fn();
      const exists = vi.fn();
      const client = mockClient({});
      const result = await executeAccountDeletionStorageObject(
        { requestId: "r", attemptId: "a", resultId: "x" },
        {
          serviceRoleClient: client as never,
          removeObjects: remove,
          objectExists: exists,
          isAccountDeletionExecutionEnabled: () => false,
          isStorageExecutionEnabled: () => true,
        }
      );
      expect(result.ok).toBe(false);
      expect(client.rpc).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      expect(exists).not.toHaveBeenCalled();
    });
  }

  it("EX-A dual: both flags must be exact true before claim", async () => {
    const remove = vi.fn();
    const exists = vi.fn();
    const client = mockClient({});

    const cases: Array<{
      global: boolean;
      storage: boolean;
      code: string;
    }> = [
      { global: false, storage: false, code: "execution_disabled" },
      { global: true, storage: false, code: "storage_execution_disabled" },
      { global: false, storage: true, code: "execution_disabled" },
    ];

    for (const c of cases) {
      client.rpc.mockClear();
      remove.mockClear();
      exists.mockClear();
      const result = await executeAccountDeletionStorageObject(
        { requestId: "r", attemptId: "a", resultId: "x" },
        {
          serviceRoleClient: client as never,
          removeObjects: remove,
          objectExists: exists,
          isAccountDeletionExecutionEnabled: () => c.global,
          isStorageExecutionEnabled: () => c.storage,
        }
      );
      expect(result).toMatchObject({ ok: false, code: c.code });
      expect(client.rpc).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      expect(exists).not.toHaveBeenCalled();
    }
  });

  for (const badStorage of FAIL_VALUES) {
    it(`global=true storage=${String(badStorage)} → fail closed`, async () => {
      const remove = vi.fn();
      const exists = vi.fn();
      const client = mockClient({});
      const result = await executeAccountDeletionStorageObject(
        { requestId: "r", attemptId: "a", resultId: "x" },
        {
          serviceRoleClient: client as never,
          removeObjects: remove,
          objectExists: exists,
          isAccountDeletionExecutionEnabled: () => true,
          isStorageExecutionEnabled: () => badStorage === "true",
        }
      );
      if (badStorage !== "true") {
        expect(result.ok).toBe(false);
        expect(client.rpc).not.toHaveBeenCalled();
        expect(remove).not.toHaveBeenCalled();
        expect(exists).not.toHaveBeenCalled();
      }
    });
  }
});

describe("accountDeletionStorageObjectExecutor (EX-B–J)", () => {
  it("EX-B/C/G: valid path → one remove with DB bucket/path", async () => {
    const remove = vi.fn(async () => ({ error: null }));
    const exists = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const client = mockClient({
      rpc: (name, args) => {
        if (name === "claim_account_deletion_storage_execution_result") {
          return { ok: true, claim_token: "tok" };
        }
        if (name === "authorize_account_deletion_storage_object_delete") {
          return {
            ok: true,
            code: "authorized",
            bucket: "journey-private-media",
            object_path: "aa/bb.mp4",
            delete_commit_token: "commit",
          };
        }
        if (name === "complete_account_deletion_storage_execution_object") {
          expect(args.p_outcome).toBe("deleted");
          return { ok: true, execution_state: "deleted" };
        }
        return { ok: false };
      },
    });

    const result = await executeAccountDeletionStorageObject(
      { requestId: "r", attemptId: "a", resultId: "res" },
      enabledDeps(client, remove, exists)
    );

    expect(result).toMatchObject({ ok: true, code: "deleted" });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("journey-private-media", ["aa/bb.mp4"]);
  });

  it("EX-D/E/F/H and provider sanitization", async () => {
    const malicious =
      "Bearer abc service_role=secret https://x?token=signed Authorization: hdr";
    const remove = vi.fn(async () => ({ error: { message: malicious } }));
    const complete = vi.fn();
    const client = mockClient({
      rpc: (name, args) => {
        if (name.includes("claim")) return { ok: true, claim_token: "tok" };
        if (name.includes("authorize")) {
          return {
            ok: true,
            bucket: "journey-private-media",
            object_path: "p",
            delete_commit_token: "c",
          };
        }
        if (name.includes("complete")) {
          complete(args);
          return { ok: true, execution_state: "failed_retryable" };
        }
        return {};
      },
    });

    await executeAccountDeletionStorageObject(
      { requestId: "r", attemptId: "a", resultId: "res" },
      enabledDeps(client, remove)
    );

    expect(complete).toHaveBeenCalled();
    const call = complete.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call.p_error_code).toBe("storage_permission_error");
    expect(call.p_error_detail_safe).toBeNull();
    expect(JSON.stringify(call)).not.toContain("Bearer");
    expect(JSON.stringify(call)).not.toContain("service_role");
    expect(JSON.stringify(call)).not.toContain("signed");
  });

  it("EX-I: crash after remove — object absent completes missing", async () => {
    const remove = vi.fn(async () => ({ error: null }));
    const exists = vi.fn(async () => false);
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "claim_account_deletion_storage_execution_result") {
        return { data: { ok: false, code: "not_claimable" }, error: null };
      }
      if (name === "authorize_account_deletion_storage_object_delete") {
        return {
          data: {
            ok: true,
            code: "already_authorized",
            bucket: "journey-private-media",
            object_path: "p",
            delete_commit_token: "c",
          },
          error: null,
        };
      }
      if (
        name === "complete_account_deletion_storage_execution_object" &&
        args.p_outcome === "missing"
      ) {
        return { data: { ok: true, execution_state: "missing" }, error: null };
      }
      return { data: {}, error: null };
    });
    const client = {
      rpc,
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                execution_state: "deleting",
                claim_token: "tok",
                claim_lease_expires_at: new Date(
                  Date.now() + 60_000
                ).toISOString(),
                delete_commit_token: "c",
                delete_commit_expires_at: new Date(
                  Date.now() + 60_000
                ).toISOString(),
              },
              error: null,
            })),
          })),
        })),
      })),
    };

    const result = await executeAccountDeletionStorageObject(
      { requestId: "r", attemptId: "a", resultId: "res" },
      enabledDeps(client as never, remove, exists)
    );
    expect(result).toMatchObject({ ok: true, code: "missing" });
    expect(remove).not.toHaveBeenCalled();
    expect(exists).toHaveBeenCalled();
  });

  it("EX hold path: authorize refused → no remove", async () => {
    const remove = vi.fn();
    const client = mockClient({
      rpc: (name) => {
        if (name.includes("claim")) return { ok: true, claim_token: "t" };
        if (name.includes("authorize")) {
          return { ok: false, code: "preservation_hold_active" };
        }
        return {};
      },
    });

    const result = await executeAccountDeletionStorageObject(
      { requestId: "r", attemptId: "a", resultId: "res" },
      enabledDeps(client, remove)
    );

    expect(result).toMatchObject({ ok: false, code: "authorize_failed" });
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("provider error mapping", () => {
  it("maps network and does not retain raw secrets in sanitize helper", () => {
    expect(mapAccountDeletionStorageProviderError("network timeout").code).toBe(
      "storage_network_error"
    );
    expect(
      sanitizeAccountDeletionStorageProviderDetail(
        "Bearer x service_role y https://signed"
      )
    ).toBeNull();
  });
});
