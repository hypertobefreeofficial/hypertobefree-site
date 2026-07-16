export const publicRoutesWithoutLoggedInShell = [
  "/",
  "/login",
  "/signup",
  "/privacy",
  "/terms",
  "/content-rules",
  "/copyright",
  "/preview/hero-3d",
  "/share-your-story",
] as const;

export const fullscreenRoutesWithoutGlobalNav = ["/video-feed", "/videos"] as const;

export function shouldUseLoggedInShell(pathname: string | null | undefined) {
  if (!pathname) return false;
  return !publicRoutesWithoutLoggedInShell.includes(
    pathname as (typeof publicRoutesWithoutLoggedInShell)[number]
  );
}

export function shouldHideGlobalNav(pathname: string | null | undefined) {
  if (!pathname) return false;
  if (
    publicRoutesWithoutLoggedInShell.includes(
      pathname as (typeof publicRoutesWithoutLoggedInShell)[number]
    )
  ) {
    return true;
  }
  return fullscreenRoutesWithoutGlobalNav.some((route) =>
    pathname.startsWith(route)
  );
}
