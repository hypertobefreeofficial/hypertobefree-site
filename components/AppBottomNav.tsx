"use client";

import { usePathname } from "next/navigation";
import { shouldHideGlobalNav } from "../lib/navigation/loggedInShellRoutes";
import LoggedInBottomNav from "./LoggedInBottomNav";
import LoggedInDesktopNav from "./LoggedInDesktopNav";

export default function AppBottomNav() {
  const pathname = usePathname();

  if (shouldHideGlobalNav(pathname)) return null;

  return (
    <>
      <LoggedInDesktopNav />
      <LoggedInBottomNav />
    </>
  );
}
