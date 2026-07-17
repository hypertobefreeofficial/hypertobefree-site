export type FaithResponsesReturnState = {
  scrollY: number;
  anchorId?: string;
};

const RETURN_KEY = "htbf_faith_responses_return";

export function buildFaithResponsesHref(options: {
  parentStoryId: string;
  responseId?: string;
  returnScrollY?: number;
  returnAnchorId?: string;
}) {
  const params = new URLSearchParams();
  params.set("story", options.parentStoryId);
  if (options.responseId) params.set("response", options.responseId);
  if (typeof options.returnScrollY === "number") {
    params.set("returnScrollY", String(Math.round(options.returnScrollY)));
  }
  if (options.returnAnchorId) {
    params.set("returnAnchor", options.returnAnchorId);
  }
  return `/feed/faith-responses?${params.toString()}`;
}

export function storeFaithResponsesReturnState(state: FaithResponsesReturnState) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(RETURN_KEY, JSON.stringify(state));
}

export function readFaithResponsesReturnState(): FaithResponsesReturnState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(RETURN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FaithResponsesReturnState;
    if (typeof parsed.scrollY !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearFaithResponsesReturnState() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(RETURN_KEY);
}
