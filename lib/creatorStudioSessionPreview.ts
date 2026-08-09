export type CreatorStudioSessionPreview = {
  photoUrl?: string | null;
  videoUrl?: string | null;
};

const STORAGE_KEY = "htbf-creator-studio-session-previews";

let memoryStore: Record<string, CreatorStudioSessionPreview> = {};

function revokeBlobUrl(url: string | null | undefined) {
  if (url && url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

function readStore(): Record<string, CreatorStudioSessionPreview> {
  if (typeof window === "undefined") return memoryStore;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CreatorStudioSessionPreview>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, CreatorStudioSessionPreview>) {
  if (typeof window === "undefined") {
    memoryStore = store;
    return;
  }

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function resetCreatorStudioSessionPreviewStoreForTests() {
  for (const preview of Object.values(memoryStore)) {
    revokeBlobUrl(preview.photoUrl);
    revokeBlobUrl(preview.videoUrl);
  }
  memoryStore = {};
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(STORAGE_KEY);
  }
}

export function storeCreatorStudioSessionPreview(
  storyId: string,
  preview: CreatorStudioSessionPreview
) {
  if (!storyId) return;
  if (!preview.photoUrl && !preview.videoUrl) return;

  const store = readStore();
  store[storyId] = {
    photoUrl: preview.photoUrl ?? null,
    videoUrl: preview.videoUrl ?? null,
  };
  writeStore(store);
}

export function getCreatorStudioSessionPreview(storyId: string) {
  if (!storyId) return null;
  return readStore()[storyId] ?? null;
}

export function clearCreatorStudioSessionPreview(storyId: string) {
  if (!storyId) return;
  const store = readStore();
  const preview = store[storyId];
  if (!preview) return;

  revokeBlobUrl(preview.photoUrl);
  revokeBlobUrl(preview.videoUrl);
  delete store[storyId];
  writeStore(store);
}
