"use client";

import { usePathname } from "next/navigation";
import { useCreatorStudioWorkspace } from "./CreatorStudioWorkspaceProvider";
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
  const { active: creatorStudioWorkspaceActive } = useCreatorStudioWorkspace();

  const shouldHideBottomNav =
    publicRoutesWithoutBottomNav.includes(pathname) ||
    (creatorStudioWorkspaceActive && pathname === "/share-your-story");

  if (shouldHideBottomNav) {
    return null;
  }

  return <LoggedInBottomNav />;
}
