/**
 * Canonical storage object identity keys shared by manifest, plan, and contracts.
 */

const STORAGE_OBJECT_KEY_SEPARATOR = "::";

export function normalizeStorageObjectPath(path: string): string {
  return path.trim().replace(/^\/+/, "");
}

export function storageObjectKey(bucket: string, path: string): string {
  return `${bucket.trim()}${STORAGE_OBJECT_KEY_SEPARATOR}${normalizeStorageObjectPath(path)}`;
}

export function parseStorageObjectKey(
  key: string
): { bucket: string; path: string } | null {
  const separatorIndex = key.indexOf(STORAGE_OBJECT_KEY_SEPARATOR);
  if (separatorIndex <= 0) {
    return null;
  }

  const bucket = key.slice(0, separatorIndex);
  const path = key.slice(separatorIndex + STORAGE_OBJECT_KEY_SEPARATOR.length);
  if (!bucket || !path) {
    return null;
  }

  return { bucket, path };
}
