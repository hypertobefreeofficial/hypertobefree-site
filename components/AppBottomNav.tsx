"use client";

import { usePathname } from "next/navigation";
import LoggedInBottomNav from "./LoggedInBottomNav";

const publicRoutesWithoutBottomNav = [
  "/",
  "/login",
  "/signup",
  "/privacy",
  "/terms",
  "/content-rules",
  "/copyright",
];

export default function AppBottomNav() {
  const pathname = usePathname();

  const shouldHideBottomNav =
    publicRoutesWithoutBottomNav.includes(pathname) ||
    pathname === "/share-your-story";

  if (shouldHideBottomNav) return null;

  return <LoggedInBottomNav />;
}
