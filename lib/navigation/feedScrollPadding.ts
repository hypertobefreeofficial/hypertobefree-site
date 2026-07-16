export function readCssVariablePx(variableName: string) {
  if (typeof window === "undefined") return 0;

  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.height = `var(${variableName})`;
  document.documentElement.appendChild(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();

  return height;
}

export function getFeedScrollPaddingTopPx() {
  return readCssVariablePx("--app-feed-scroll-padding-top");
}

export function ensureElementBelowFeedStickyHeader(element: HTMLElement) {
  if (typeof window === "undefined") return;

  const clearance = getFeedScrollPaddingTopPx();
  const top = element.getBoundingClientRect().top;

  if (top < clearance - 1) {
    window.scrollBy(0, top - clearance);
  }
}
