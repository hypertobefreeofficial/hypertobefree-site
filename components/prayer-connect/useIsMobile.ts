"use client";

import { useEffect, useState } from "react";

/**
 * Shared breakpoint hook for the Prayer experience. Mobile chrome is used below
 * the desktop/laptop breakpoint (1024px) so it stays in sync with the bottom
 * navigation, which is hidden at `lg` and above.
 */
export function useIsMobile(query = "(max-width: 1023px)") {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const update = () => setMatches(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, [query]);

  return matches;
}
