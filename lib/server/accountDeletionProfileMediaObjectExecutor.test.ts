import { describe, expect, it, vi } from "vitest";
import {
  executeAccountDeletionProfileMediaObject,
  type AccountDeletionProfileMediaObjectExecutorDeps,
} from "./accountDeletionProfileMediaObjectExecutor";
import type {
  AccountDeletionProfileMediaStorageAdapter,
  AccountDeletionProfileMediaStorageErrorCode,
} from "./accountDeletionProfileMediaStorageAdapter";
import { ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE } from "./accountDeletionStorageObjectExistence";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const ATTEMPT_ID = "22222222-2222-4222-8222-222222222222";
const RESULT_ID = "33333333-3333-4333-8333-333333333333";
const CLAIM_TOKEN = "44444444-4444-4444-8444-444444444444";
const COMMIT_TOKEN = "55555555-5555-4555-8555-555555555555";
const OWNER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OBJECT_PATH = `${OWNER_ID}/avatar.png`;
const FUTURE = "2030-01-01T00:00:00.000Z";
const NOW = Date.parse("2029-01-01T00:00:00.000Z");

const input = {
  requestId: REQUEST_ID,
  attemptId: ATTEMPT_ID,
  resultId: RESULT_ID,
};
const exists = { status: "exists" as const };
const absent = { status: "absent" as const };
const uncertain = {
  status: "uncertain" as const,
  code: ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE,
};

function claimPayload(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    code: "claimed",
    result_id: RESULT_ID,
    claim_token: CLAIM_TOKEN,
    claim_lease_expires_at: FUTURE,
    reclaimed: false,
    ...overrides,
  };
}

function authorityPayload(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    code: "authorized",
    result_id: RESULT_ID,
    bucket: "profile-avatars",
    object_path: OBJECT_PATH,
    delete_commit_token: COMMIT_TOKEN,
    delete_commit_expires_at: FUTURE,
    ...overrides,
  };
}

function mockClient(options: {
  claim?: Record<string, unknown>;
  authorize?: Record<string, unknown>;
  complete?: (
    args: Record<string, unknown>
  ) => Record<string, unknown> | null;
  row?: Record<string, unknown> | null;
  rpcErrorFor?: string;
} = {}) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === options.rpcErrorFor) {
      return { data: null, error: { message: "raw database detail" } };
    }
    if (name === "claim_account_deletion_profile_media_execution_result") {
      return { data: options.claim ?? claimPayload(), error: null };
    }
    if (name === "authorize_account_deletion_profile_media_delete") {
      return { data: options.authorize ?? authorityPayload(), error: null };
    }
    if (
      name === "complete_account_deletion_profile_media_execution_result"
    ) {
      return {
        data:
          options.complete?.(args) ?? {
            ok: true,
            code: "completed",
            execution_state: args.p_outcome,
          },
        error: null,
      };
    }
    return { data: null, error: { message: "unexpected RPC" } };
  });

  const maybeSingle = vi.fn(async () => ({
    data: options.row ?? null,
    error: null,
  }));
  const builder: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    maybeSingle: typeof maybeSingle;
  } = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle,
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  const from = vi.fn(() => builder);
  return { client: { rpc, from }, rpc, from, builder };
}

function mockAdapter(
  existence: Array<typeof exists | typeof absent | typeof uncertain> = [
    exists,
    absent,
  ],
  removeResult:
    | { ok: true }
    | {
        ok: false;
        code: AccountDeletionProfileMediaStorageErrorCode;
        terminal: boolean;
      } = {
    ok: true,
  }
) {
  const objectExists = vi.fn();
  for (const result of existence) objectExists.mockResolvedValueOnce(result);
  const removeObject = vi.fn(async () => removeResult);
  return { objectExists, removeObject } as AccountDeletionProfileMediaStorageAdapter;
}

function deps(
  client: ReturnType<typeof mockClient>["client"],
  adapter = mockAdapter(),
  flags = { global: true, profile: true, storage: true }
): AccountDeletionProfileMediaObjectExecutorDeps {
  return {
    serviceRoleClient: client as never,
    storageAdapter: adapter,
    isAccountDeletionExecutionEnabled: () => flags.global,
    isProfileExecutionEnabled: () => flags.profile,
    isStorageExecutionEnabled: () => flags.storage,
    now: () => NOW,
  };
}

describe("accountDeletionProfileMediaObjectExecutor flags and input", () => {
  it.each([
    [{ global: false, profile: true, storage: true }, "execution_disabled"],
    [
      { global: true, profile: false, storage: true },
      "profile_execution_disabled",
    ],
    [
      { global: true, profile: true, storage: false },
      "profile_storage_execution_disabled",
    ],
  ] as const)("fails closed before RPC for disabled flags", async (flags, code) => {
    const client = mockClient();
    const adapter = mockAdapter();
    await expect(
      executeAccountDeletionProfileMediaObject(
        input,
        deps(client.client, adapter, flags)
      )
    ).resolves.toMatchObject({ ok: false, code });
    expect(client.rpc).not.toHaveBeenCalled();
    expect(adapter.objectExists).not.toHaveBeenCalled();
  });

  it.each(["TRUE", "1", "yes", " true "])(
    "nonexact global flag %s is rejected by exact policy dependency",
    async (_value) => {
      const client = mockClient();
      const result = await executeAccountDeletionProfileMediaObject(
        input,
        deps(client.client, mockAdapter(), {
          global: false,
          profile: true,
          storage: true,
        })
      );
      expect(result.code).toBe("execution_disabled");
      expect(client.rpc).not.toHaveBeenCalled();
    }
  );

  it.each(["requestId", "attemptId", "resultId"] as const)(
    "rejects invalid %s before RPC",
    async (field) => {
      const client = mockClient();
      const result = await executeAccountDeletionProfileMediaObject(
        { ...input, [field]: "not-a-uuid" },
        deps(client.client)
      );
      expect(result).toEqual({ ok: false, code: "invalid_arguments" });
      expect(client.rpc).not.toHaveBeenCalled();
    }
  );

  it("all enabled reaches the exact profile claim RPC", async () => {
    const client = mockClient();
    await executeAccountDeletionProfileMediaObject(input, deps(client.client));
    expect(client.rpc).toHaveBeenCalledWith(
      "claim_account_deletion_profile_media_execution_result",
      {
        p_request_id: REQUEST_ID,
        p_attempt_id: ATTEMPT_ID,
        p_result_id: RESULT_ID,
        p_lease_seconds: 900,
      }
    );
  });
});

describe("accountDeletionProfileMediaObjectExecutor claim and authority", () => {
  it.each(["preservation_hold_active", "claim_conflict"])(
    "bounded claim failure %s performs no provider operation",
    async (code) => {
      const client = mockClient({ claim: { ok: false, code } });
      const adapter = mockAdapter();
      const result = await executeAccountDeletionProfileMediaObject(
        input,
        deps(client.client, adapter)
      );
      expect(result).toEqual({ ok: false, code: "claim_failed", detail: code });
      expect(adapter.objectExists).not.toHaveBeenCalled();
    }
  );

  it("fresh and reclaimed claims both proceed", async () => {
    for (const reclaimed of [false, true]) {
      const client = mockClient({ claim: claimPayload({ reclaimed }) });
      const adapter = mockAdapter();
      const result = await executeAccountDeletionProfileMediaObject(
        input,
        deps(client.client, adapter)
      );
      expect(result).toMatchObject({ ok: true, code: "deleted" });
      expect(adapter.removeObject).toHaveBeenCalledOnce();
    }
  });

  it("terminal replay returns already_terminal without provider access", async () => {
    const client = mockClient({
      claim: { ok: false, code: "not_claimable" },
      row: {
        execution_state: "deleted",
      },
    });
    const adapter = mockAdapter();
    await expect(
      executeAccountDeletionProfileMediaObject(
        input,
        deps(client.client, adapter)
      )
    ).resolves.toEqual({
      ok: true,
      code: "already_terminal",
      executionState: "deleted",
    });
    expect(adapter.objectExists).not.toHaveBeenCalled();
    expect(adapter.removeObject).not.toHaveBeenCalled();
  });

  it.each([
    ["not_claimable", FUTURE, null],
    ["delete_already_committed", "2028-01-01T00:00:00Z", FUTURE],
  ])("resumes DB-bound deleting authority for %s", async (claimCode, lease, commit) => {
    const client = mockClient({
      claim: { ok: false, code: claimCode },
      authorize: authorityPayload({ code: "already_authorized" }),
      row: {
        execution_state: "deleting",
        claim_token: CLAIM_TOKEN,
        claim_lease_expires_at: lease,
        delete_commit_token: commit ? COMMIT_TOKEN : null,
        delete_commit_expires_at: commit,
      },
    });
    const result = await executeAccountDeletionProfileMediaObject(
      input,
      deps(client.client)
    );
    expect(result).toMatchObject({ ok: true, code: "deleted" });
    expect(client.rpc).toHaveBeenCalledWith(
      "authorize_account_deletion_profile_media_delete",
      expect.objectContaining({ p_claim_token: CLAIM_TOKEN })
    );
  });

  it("does not infer resume authority from resultId alone", async () => {
    const client = mockClient({
      claim: { ok: false, code: "not_claimable" },
      row: { execution_state: "deleting", claim_token: null },
    });
    const adapter = mockAdapter();
    const result = await executeAccountDeletionProfileMediaObject(
      input,
      deps(client.client, adapter)
    );
    expect(result).toMatchObject({ ok: false, code: "claim_failed" });
    expect(adapter.objectExists).not.toHaveBeenCalled();
  });

  it.each([
    ["authorization failure", { ok: false, code: "preservation_hold_active" }],
    ["wrong bucket", authorityPayload({ bucket: "journey-private-media" })],
    ["malformed path", authorityPayload({ object_path: `${OWNER_ID}/other.png` })],
    ["wrong-owner-shaped path", authorityPayload({ object_path: "bad/avatar.png" })],
    ["missing commit", authorityPayload({ delete_commit_token: null })],
    ["invalid commit", authorityPayload({ delete_commit_token: "caller-token" })],
    [
      "expired authority",
      authorityPayload({ delete_commit_expires_at: "2028-01-01T00:00:00Z" }),
    ],
    ["wrong result binding", authorityPayload({ result_id: REQUEST_ID })],
  ])("rejects %s without provider access", async (_label, authorize) => {
    const client = mockClient({ authorize });
    const adapter = mockAdapter();
    const result = await executeAccountDeletionProfileMediaObject(
      input,
      deps(client.client, adapter)
    );
    expect(result).toMatchObject({ ok: false, code: "authorize_failed" });
    expect(adapter.objectExists).not.toHaveBeenCalled();
    expect(adapter.removeObject).not.toHaveBeenCalled();
  });

  it("rechecks fresh time after precheck and refuses an expiry-equal delete", async () => {
    let now = NOW;
    const client = mockClient();
    const adapter: AccountDeletionProfileMediaStorageAdapter = {
      objectExists: vi.fn(async () => {
        now = Date.parse(FUTURE);
        return exists;
      }),
      removeObject: vi.fn(async () => ({ ok: true as const })),
    };

    const result = await executeAccountDeletionProfileMediaObject(input, {
      ...deps(client.client, adapter),
      now: () => now,
    });

    expect(result).toEqual({
      ok: false,
      code: "delete_authority_expired",
      retryable: true,
    });
    expect(adapter.removeObject).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalledWith(
      "complete_account_deletion_profile_media_execution_result",
      expect.anything()
    );
  });

  it("allows delete while authority remains valid at the pre-remove boundary", async () => {
    const client = mockClient();
    const adapter = mockAdapter([exists, absent]);
    const result = await executeAccountDeletionProfileMediaObject(input, {
      ...deps(client.client, adapter),
      now: () => NOW,
    });
    expect(result).toMatchObject({ ok: true, code: "deleted" });
    expect(adapter.removeObject).toHaveBeenCalledOnce();
  });

  it.each(["not_claimable", "delete_already_committed"])(
    "%s resume rechecks current expiry immediately before remove",
    async (claimCode) => {
      let now = NOW;
      const client = mockClient({
        claim: { ok: false, code: claimCode },
        authorize: authorityPayload({ code: "already_authorized" }),
        row: {
          execution_state: "deleting",
          claim_token: CLAIM_TOKEN,
          claim_lease_expires_at:
            claimCode === "not_claimable" ? FUTURE : "2028-01-01T00:00:00Z",
          delete_commit_token: COMMIT_TOKEN,
          delete_commit_expires_at: FUTURE,
        },
      });
      const adapter: AccountDeletionProfileMediaStorageAdapter = {
        objectExists: vi.fn(async () => {
          now = Date.parse(FUTURE) + 1;
          return exists;
        }),
        removeObject: vi.fn(async () => ({ ok: true as const })),
      };

      const result = await executeAccountDeletionProfileMediaObject(input, {
        ...deps(client.client, adapter),
        now: () => now,
      });

      expect(result).toMatchObject({
        ok: false,
        code: "delete_authority_expired",
      });
      expect(adapter.removeObject).not.toHaveBeenCalled();
    }
  );
});

describe("accountDeletionProfileMediaObjectExecutor provider and completion", () => {
  it("precheck absent completes missing without remove", async () => {
    const completed = vi.fn(() => ({
      ok: true,
      code: "completed",
      execution_state: "missing",
    }));
    const client = mockClient({ complete: completed });
    const adapter = mockAdapter([absent]);
    const result = await executeAccountDeletionProfileMediaObject(
      input,
      deps(client.client, adapter)
    );
    expect(result).toMatchObject({ ok: true, code: "missing" });
    expect(adapter.removeObject).not.toHaveBeenCalled();
    expect(completed).toHaveBeenCalledWith(
      expect.objectContaining({ p_outcome: "missing", p_error_code: null })
    );
  });

  it("precheck uncertain completes retryable without remove", async () => {
    const completed = vi.fn((args: Record<string, unknown>) => ({
      ok: true,
      code: "completed",
      execution_state: args.p_outcome,
    }));
    const client = mockClient({ complete: completed });
    const adapter = mockAdapter([uncertain]);
    const result = await executeAccountDeletionProfileMediaObject(
      input,
      deps(client.client, adapter)
    );
    expect(result).toMatchObject({
      ok: false,
      code: "storage_existence_check_failed",
      retryable: true,
    });
    expect(adapter.removeObject).not.toHaveBeenCalled();
    expect(completed).toHaveBeenCalledWith(
      expect.objectContaining({
        p_outcome: "failed_retryable",
        p_error_code: "storage_existence_check_failed",
      })
    );
  });

  it("exists → one remove → absent completes deleted", async () => {
    const client = mockClient();
    const adapter = mockAdapter([exists, absent]);
    const result = await executeAccountDeletionProfileMediaObject(
      input,
      deps(client.client, adapter)
    );
    expect(result).toMatchObject({ ok: true, code: "deleted" });
    expect(adapter.removeObject).toHaveBeenCalledOnce();
    expect(adapter.removeObject).toHaveBeenCalledWith(OBJECT_PATH);
  });

  it("remove success but still exists completes post-delete retryable", async () => {
    const client = mockClient();
    const result = await executeAccountDeletionProfileMediaObject(
      input,
      deps(client.client, mockAdapter([exists, exists]))
    );
    expect(result).toMatchObject({
      ok: false,
      code: "storage_postdelete_verification_failed",
      retryable: true,
    });
  });

  it("remove error but confirmed absent completes deleted", async () => {
    const client = mockClient();
    const adapter = mockAdapter([exists, absent], {
      ok: false,
      code: "storage_delete_rate_limited",
      terminal: false,
    });
    const result = await executeAccountDeletionProfileMediaObject(
      input,
      deps(client.client, adapter)
    );
    expect(result).toMatchObject({ ok: true, code: "deleted" });
    expect(adapter.removeObject).toHaveBeenCalledOnce();
  });

  it("provider error after physical delete reconciles absent as deleted", async () => {
    const client = mockClient();
    const adapter = mockAdapter([exists, absent], {
      ok: false,
      code: "storage_delete_network_failed",
      terminal: false,
    });
    const result = await executeAccountDeletionProfileMediaObject(
      input,
      deps(client.client, adapter)
    );
    expect(result).toMatchObject({ ok: true, code: "deleted" });
    expect(adapter.removeObject).toHaveBeenCalledOnce();
  });

  it("remove bounded retryable error and still exists completes bounded failure", async () => {
    const completed = vi.fn((args: Record<string, unknown>) => ({
      ok: true,
      code: "completed",
      execution_state: args.p_outcome,
    }));
    const client = mockClient({ complete: completed });
    const adapter = mockAdapter([exists, exists], {
      ok: false,
      code: "storage_delete_rate_limited",
      terminal: false,
    });
    const result = await executeAccountDeletionProfileMediaObject(
      input,
      deps(client.client, adapter)
    );
    expect(result).toEqual({
      ok: false,
      code: "storage_remove_failed",
      detail: "storage_delete_rate_limited",
      retryable: true,
    });
    expect(completed).toHaveBeenCalledWith(
      expect.objectContaining({
        p_outcome: "failed_retryable",
        p_error_code: "storage_delete_failed",
      })
    );
  });

  it("remove error followed by uncertain/network postcheck records existence failure", async () => {
    const client = mockClient();
    const adapter = mockAdapter([exists, uncertain], {
      ok: false,
      code: "storage_delete_rate_limited",
      terminal: false,
    });
    const result = await executeAccountDeletionProfileMediaObject(
      input,
      deps(client.client, adapter)
    );
    expect(result).toMatchObject({
      ok: false,
      code: "storage_existence_check_failed",
    });
  });

  it("completion failure never reports provider success", async () => {
    const client = mockClient({
      complete: () => ({ ok: false, code: "delete_commit_expired" }),
    });
    const result = await executeAccountDeletionProfileMediaObject(
      input,
      deps(client.client)
    );
    expect(result).toEqual({
      ok: false,
      code: "complete_failed",
      detail: "delete_commit_expired",
    });
  });

  it("raw RPC/provider details never appear in returned results", async () => {
    const client = mockClient({
      rpcErrorFor: "authorize_account_deletion_profile_media_delete",
    });
    const result = await executeAccountDeletionProfileMediaObject(
      input,
      deps(client.client)
    );
    expect(result).toEqual({
      ok: false,
      code: "authorize_failed",
      detail: "rpc_error",
    });
    expect(JSON.stringify(result)).not.toContain("raw database detail");
  });

  it.each([
    ["precheck uncertainty", [uncertain], { ok: true } as const],
    ["verification failure", [exists, exists], { ok: true } as const],
    [
      "provider failure",
      [exists, exists],
      {
        ok: false,
        code: "storage_delete_rate_limited",
        terminal: false,
      } as const,
    ],
  ])(
    "%s returns DB-authoritative already_terminal",
    async (_label, existence, removeResult) => {
      const client = mockClient({
        complete: () => ({
          ok: true,
          code: "already_terminal",
          execution_state: "deleted",
        }),
      });
      const adapter = mockAdapter(
        existence as Array<typeof exists | typeof absent | typeof uncertain>,
        removeResult
      );
      const result = await executeAccountDeletionProfileMediaObject(
        input,
        deps(client.client, adapter)
      );
      expect(result).toEqual({
        ok: true,
        code: "already_terminal",
        executionState: "deleted",
      });
    }
  );

  it("documents distributed at-least-once attempts and terminal reconciliation", async () => {
    let removeCalls = 0;
    let releaseBoth!: () => void;
    const bothRemoving = new Promise<void>((resolve) => {
      releaseBoth = resolve;
    });
    const sharedAdapter: AccountDeletionProfileMediaStorageAdapter = {
      objectExists: vi.fn(async () =>
        removeCalls < 2 ? exists : absent
      ),
      removeObject: vi.fn(async (path) => {
        expect(path).toBe(OBJECT_PATH);
        removeCalls += 1;
        if (removeCalls === 2) releaseBoth();
        await bothRemoving;
        return { ok: true as const };
      }),
    };
    const fresh = mockClient();
    const resumed = mockClient({
      claim: { ok: false, code: "not_claimable" },
      authorize: authorityPayload({ code: "already_authorized" }),
      row: {
        execution_state: "deleting",
        claim_token: CLAIM_TOKEN,
        claim_lease_expires_at: FUTURE,
        delete_commit_token: COMMIT_TOKEN,
        delete_commit_expires_at: FUTURE,
      },
      complete: () => ({
        ok: true,
        code: "already_terminal",
        execution_state: "deleted",
      }),
    });

    const concurrent = await Promise.all([
      executeAccountDeletionProfileMediaObject(
        input,
        deps(fresh.client, sharedAdapter)
      ),
      executeAccountDeletionProfileMediaObject(
        input,
        deps(resumed.client, sharedAdapter)
      ),
    ]);

    expect(sharedAdapter.removeObject).toHaveBeenCalledTimes(2);
    expect(sharedAdapter.removeObject).toHaveBeenNthCalledWith(1, OBJECT_PATH);
    expect(sharedAdapter.removeObject).toHaveBeenNthCalledWith(2, OBJECT_PATH);
    expect(concurrent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ok: true, code: "deleted" }),
        expect.objectContaining({ ok: true, code: "already_terminal" }),
      ])
    );

    const terminal = mockClient({
      claim: { ok: false, code: "not_claimable" },
      row: { execution_state: "deleted" },
    });
    await expect(
      executeAccountDeletionProfileMediaObject(
        input,
        deps(terminal.client, sharedAdapter)
      )
    ).resolves.toMatchObject({ ok: true, code: "already_terminal" });
    expect(sharedAdapter.removeObject).toHaveBeenCalledTimes(2);
  });
});
