import { describe, expect, it } from "vitest";
import { ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE } from "./accountDeletionStorageObjectExistence";
import { classifyAccountDeletionStorageDownloadExistence } from "./accountDeletionStorageProviderSafety";

const blob = new Blob(["avatar"]);
const uncertain = {
  status: "uncertain" as const,
  code: ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE,
};

describe("accountDeletionStorageProviderSafety existence classification", () => {
  it("accepts data with no error as exists", () => {
    expect(classifyAccountDeletionStorageDownloadExistence(blob, null)).toEqual({
      status: "exists",
    });
  });

  it.each([
    ["data plus 503", blob, { statusCode: 503 }],
    ["data plus structured 404", blob, { statusCode: 404 }],
    [
      "contradictory 404/403",
      null,
      { statusCode: 404, status: 403 },
    ],
    [
      "download-style contradictory 404/400",
      null,
      { statusCode: "404", status: 400 },
    ],
    [
      "contradictory 403/404",
      null,
      { statusCode: 403, status: 404 },
    ],
    ["message-only 404", null, { message: "404 object not found" }],
    ["message-only not found", null, { message: "Object not found" }],
    ["structured 500", null, { statusCode: 500 }],
  ] as const)("%s is uncertain", (_label, data, error) => {
    expect(
      classifyAccountDeletionStorageDownloadExistence(data, error)
    ).toEqual(uncertain);
  });

  it.each([
    ["matching numeric 404 fields", { statusCode: 404, status: 404 }],
    ["matching normalized 404 fields", { statusCode: "404", status: 404 }],
    ["statusCode only", { statusCode: 404 }],
    ["status only", { status: 404 }],
  ] as const)("%s means absent", (_label, error) => {
    expect(
      classifyAccountDeletionStorageDownloadExistence(null, error)
    ).toEqual({ status: "absent" });
  });
});
