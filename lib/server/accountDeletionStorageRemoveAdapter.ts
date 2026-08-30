/**
 * Maps installed @supabase/storage-js remove() responses to honest per-path outcomes.
 *
 * SDK contract (storage-js): remove(paths) returns
 *   { data: FileObject[]; error: null } | { data: null; error: StorageError }
 *
 * The documented example shows `{ data: [], error: null }` on success. The API does
 * NOT guarantee per-path deleted-vs-absent discrimination when data is empty.
 */

export type SupabaseStorageRemoveResponse = {
  data: Array<{ name: string }> | null;
  error: { message: string } | null;
};

export type AccountDeletionStorageRemovePathOutcome =
  | "deleted_confirmed"
  | "operation_succeeded_not_confirmed"
  | "failed";

export type AccountDeletionStorageRemoveAdaptedResult = {
  outcomes: Array<{
    path: string;
    outcome: AccountDeletionStorageRemovePathOutcome;
  }>;
  error: { message: string } | null;
};

function confirmedRemovedPaths(
  requestedPaths: string[],
  data: Array<{ name: string }> | null
): Set<string> {
  if (!data || data.length === 0) {
    return new Set();
  }

  const confirmed = new Set<string>();
  for (const requestedPath of requestedPaths) {
    for (const fileObject of data) {
      const objectName = fileObject.name?.trim();
      if (!objectName) {
        continue;
      }

      if (
        requestedPath === objectName ||
        requestedPath.endsWith(`/${objectName}`)
      ) {
        confirmed.add(requestedPath);
      }
    }
  }

  return confirmed;
}

export function adaptSupabaseStorageRemoveResponse(
  requestedPaths: string[],
  response: SupabaseStorageRemoveResponse
): AccountDeletionStorageRemoveAdaptedResult {
  if (response.error) {
    return {
      outcomes: requestedPaths.map((path) => ({
        path,
        outcome: "failed",
      })),
      error: { message: response.error.message },
    };
  }

  const confirmed = confirmedRemovedPaths(requestedPaths, response.data);

  return {
    outcomes: requestedPaths.map((path) => ({
      path,
      outcome: confirmed.has(path)
        ? "deleted_confirmed"
        : "operation_succeeded_not_confirmed",
    })),
    error: null,
  };
}

export function createAccountDeletionStorageRemoveAdapter(removeFn: {
  (bucket: string, paths: string[]): Promise<SupabaseStorageRemoveResponse>;
}) {
  return async function removeObjects(bucket: string, paths: string[]) {
    const response = await removeFn(bucket, paths);
    return adaptSupabaseStorageRemoveResponse(paths, response);
  };
}

export const SUPABASE_STORAGE_REMOVE_SEMANTICS_NOTE =
  "Supabase Storage remove() reports batch success with FileObject[] data that may be empty. Absent objects cannot be distinguished from deleted objects without a separate existence check.";
