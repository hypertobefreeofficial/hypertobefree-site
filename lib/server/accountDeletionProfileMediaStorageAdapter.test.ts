import { describe, expect, it, vi } from "vitest";
import { ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE } from "./accountDeletionStorageObjectExistence";
import {
  ACCOUNT_DELETION_PROFILE_MEDIA_LIST_LIMIT,
  ACCOUNT_DELETION_PROFILE_MEDIA_STORAGE_BUCKET,
  classifyAccountDeletionProfileMediaRemoveError,
  createAccountDeletionProfileMediaStorageAdapter,
  validateAccountDeletionProfileAvatarObjectPath,
} from "./accountDeletionProfileMediaStorageAdapter";

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const canonical = (extension = "png") => `${OWNER}/avatar.${extension}`;
const uncertain = {
  status: "uncertain" as const,
  code: ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE,
};

function storageClient(options: {
  list?: (
    directory: string,
    options: { search: string; limit: number }
  ) => Promise<{ data: unknown; error?: unknown }>;
  remove?: () => Promise<{ data: unknown; error: unknown }>;
}) {
  const list = vi.fn(
    options.list ??
      (async () => ({ data: [{ name: "avatar.png" }], error: null }))
  );
  const remove = vi.fn(
    options.remove ?? (async () => ({ data: [], error: null }))
  );
  const from = vi.fn(() => ({ list, remove }));
  return { client: { storage: { from } }, from, list, remove };
}

describe("accountDeletionProfileMediaStorageAdapter authority", () => {
  it("hardcodes profile-avatars and accepts only an object path", async () => {
    const { client, from, remove } = storageClient({});
    const adapter = createAccountDeletionProfileMediaStorageAdapter(client as never);
    expect(ACCOUNT_DELETION_PROFILE_MEDIA_STORAGE_BUCKET).toBe("profile-avatars");
    expect(adapter.removeObject.length).toBe(1);

    await adapter.removeObject(canonical());

    expect(from).toHaveBeenCalledWith("profile-avatars");
    expect(from).not.toHaveBeenCalledWith("journey-private-media");
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith([canonical()]);
  });

  it.each(["png", "webp", "jpg", "jpeg"])(
    "accepts canonical avatar.%s",
    (extension) => {
      expect(validateAccountDeletionProfileAvatarObjectPath(canonical(extension))).toBe(
        true
      );
    }
  );

  it.each([
    ["malformed UUID", "not-a-uuid/avatar.png"],
    ["wrong filename", `${OWNER}/profile.png`],
    ["extra segment", `${OWNER}/nested/avatar.png`],
    ["traversal", `${OWNER}/../avatar.png`],
    ["encoded slash", `${OWNER}%2favatar.png`],
    ["encoded dot", `${OWNER}/%61vatar.png`],
    ["leading slash", `/${OWNER}/avatar.png`],
    ["trailing slash", `${OWNER}/avatar.png/`],
    ["backslash", `${OWNER}\\avatar.png`],
    ["uppercase ambiguity", `${OWNER.toUpperCase()}/avatar.png`],
    ["query ambiguity", `${OWNER}/avatar.png?x=1`],
  ])("rejects %s", (_label, value) => {
    expect(validateAccountDeletionProfileAvatarObjectPath(value)).toBe(false);
  });

  it("rejects malformed paths before touching Storage", async () => {
    const { client, from, remove } = storageClient({});
    const adapter = createAccountDeletionProfileMediaStorageAdapter(client as never);
    await expect(adapter.removeObject("../avatar.png")).resolves.toEqual({
      ok: false,
      code: "storage_delete_invalid_path",
      terminal: true,
    });
    expect(from).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("accountDeletionProfileMediaStorageAdapter existence", () => {
  it("uses the exact owner directory, exact filename search, and bounded limit", async () => {
    const { client, from, list } = storageClient({});
    await expect(
      createAccountDeletionProfileMediaStorageAdapter(
        client as never
      ).objectExists(canonical())
    ).resolves.toEqual({ status: "exists" });
    expect(from).toHaveBeenCalledWith("profile-avatars");
    expect(list).toHaveBeenCalledWith(OWNER, {
      search: "avatar.png",
      limit: ACCOUNT_DELETION_PROFILE_MEDIA_LIST_LIMIT,
    });
    expect(list).not.toHaveBeenCalledWith("", expect.anything());
  });

  it("successful empty list means absent", async () => {
    const { client } = storageClient({
      list: async () => ({ data: [], error: null }),
    });
    await expect(
      createAccountDeletionProfileMediaStorageAdapter(
        client as never
      ).objectExists(canonical())
    ).resolves.toEqual({ status: "absent" });
  });

  it.each([
    ["another filename", [{ name: "avatar.webp" }]],
    ["similar filename", [{ name: "avatar.png.bak" }]],
  ])("successful list containing %s only means absent", async (_label, data) => {
    const { client } = storageClient({
      list: async () => ({ data, error: null }),
    });
    await expect(
      createAccountDeletionProfileMediaStorageAdapter(
        client as never
      ).objectExists(canonical())
    ).resolves.toEqual({ status: "absent" });
  });

  it("data plus error remains uncertain even with an exact result", async () => {
    const { client } = storageClient({
      list: async () => ({
        data: [{ name: "avatar.png" }],
        error: { statusCode: 500 },
      }),
    });
    await expect(
      createAccountDeletionProfileMediaStorageAdapter(
        client as never
      ).objectExists(canonical())
    ).resolves.toEqual(uncertain);
  });

  it.each([
    ["undefined error", { data: [], error: undefined }],
    ["missing error", { data: [] }],
  ])("%s is not a successful list response", async (_label, response) => {
    const { client } = storageClient({
      list: async () => response,
    });
    await expect(
      createAccountDeletionProfileMediaStorageAdapter(
        client as never
      ).objectExists(canonical())
    ).resolves.toEqual(uncertain);
  });

  it.each([400, 401, 403, 404, 409, 429, 500, 503])(
    "list error %s remains uncertain",
    async (statusCode) => {
      const { client } = storageClient({
        list: async () => ({
          data: [],
          error: { statusCode, message: "secret provider detail" },
        }),
      });
      await expect(
        createAccountDeletionProfileMediaStorageAdapter(
          client as never
        ).objectExists(canonical())
      ).resolves.toEqual(uncertain);
    }
  );

  it("network exception and invalid path remain uncertain", async () => {
    const { client, from } = storageClient({
      list: async () => {
        throw new Error("Bearer secret ECONNRESET");
      },
    });
    const adapter = createAccountDeletionProfileMediaStorageAdapter(client as never);
    await expect(adapter.objectExists(canonical())).resolves.toEqual(uncertain);
    await expect(adapter.objectExists("../bad")).resolves.toEqual(uncertain);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["null", null],
    ["object", { name: "avatar.png" }],
    ["string", "avatar.png"],
  ])("malformed successful %s payload remains uncertain", async (_label, data) => {
    const { client } = storageClient({
      list: async () => ({ data, error: null }),
    });
    await expect(
      createAccountDeletionProfileMediaStorageAdapter(
        client as never
      ).objectExists(canonical())
    ).resolves.toEqual(uncertain);
  });

  it.each([
    ["null entry", [null]],
    ["undefined entry", [undefined]],
    ["string entry", ["avatar.png"]],
    ["number entry", [42]],
    ["boolean entry", [true]],
    ["sparse entry", Array(1)],
    ["array entry", [[]]],
    [
      "array entry with matching name",
      [Object.assign([], { name: "avatar.png" })],
    ],
    [
      "array entry with nonmatching name",
      [Object.assign([], { name: "something-else.png" })],
    ],
    ["missing name", [{ metadata: {} }]],
    ["null name", [{ name: null }]],
    ["non-string name", [{ name: 1 }]],
    ["object name", [{ name: { value: "avatar.png" } }]],
    ["mixed valid and malformed entries", [{ name: "avatar.webp" }, null]],
    ["exact match plus malformed entry", [{ name: "avatar.png" }, null]],
  ])("successful array containing %s remains uncertain", async (_label, data) => {
    const { client } = storageClient({
      list: async () => ({ data, error: null }),
    });
    await expect(
      createAccountDeletionProfileMediaStorageAdapter(
        client as never
      ).objectExists(canonical())
    ).resolves.toEqual(uncertain);
  });

  it("a saturated fuzzy-search page without an exact match remains uncertain", async () => {
    const { client } = storageClient({
      list: async () => ({
        data: Array.from(
          { length: ACCOUNT_DELETION_PROFILE_MEDIA_LIST_LIMIT },
          (_, index) => ({ name: `avatar.png.${index}` })
        ),
        error: null,
      }),
    });
    await expect(
      createAccountDeletionProfileMediaStorageAdapter(
        client as never
      ).objectExists(canonical())
    ).resolves.toEqual(uncertain);
  });

  it("an exact match on a saturated page means exists", async () => {
    const { client } = storageClient({
      list: async () => ({
        data: Array.from(
          { length: ACCOUNT_DELETION_PROFILE_MEDIA_LIST_LIMIT },
          (_, index) => ({
            name: index === ACCOUNT_DELETION_PROFILE_MEDIA_LIST_LIMIT - 1
              ? "avatar.png"
              : `avatar.png.${index}`,
          })
        ),
        error: null,
      }),
    });
    await expect(
      createAccountDeletionProfileMediaStorageAdapter(
        client as never
      ).objectExists(canonical())
    ).resolves.toEqual({ status: "exists" });
  });
});

describe("accountDeletionProfileMediaStorageAdapter remove classification", () => {
  it("returns success without provider detail", async () => {
    const { client } = storageClient({});
    await expect(
      createAccountDeletionProfileMediaStorageAdapter(
        client as never
      ).removeObject(canonical())
    ).resolves.toEqual({ ok: true });
  });

  it.each([
    [401, "storage_delete_unauthorized", true],
    [403, "storage_delete_forbidden", true],
    [409, "storage_delete_conflict", false],
    [429, "storage_delete_rate_limited", false],
    [500, "storage_delete_provider_failed", false],
  ] as const)(
    "maps status %s to bounded %s",
    async (statusCode, code, terminal) => {
      const raw = "Bearer token service_role=secret signed-url";
      const { client } = storageClient({
        remove: async () => ({
          data: null,
          error: { statusCode, message: raw },
        }),
      });
      const result = await createAccountDeletionProfileMediaStorageAdapter(
        client as never
      ).removeObject(canonical());
      expect(result).toEqual({ ok: false, code, terminal });
      expect(JSON.stringify(result)).not.toContain(raw);
      expect(JSON.stringify(result)).not.toContain("Bearer");
    }
  );

  it("maps thrown/network errors without returning raw details", async () => {
    const { client } = storageClient({
      remove: async () => {
        throw new Error("Bearer raw secret");
      },
    });
    await expect(
      createAccountDeletionProfileMediaStorageAdapter(
        client as never
      ).removeObject(canonical())
    ).resolves.toEqual({
      ok: false,
      code: "storage_delete_network_failed",
      terminal: false,
    });
  });

  it("classifies structured errors without provider wording", () => {
    expect(
      classifyAccountDeletionProfileMediaRemoveError({
        statusCode: 403,
        message: "totally arbitrary",
      })
    ).toEqual({ code: "storage_delete_forbidden", terminal: true });
  });
});
