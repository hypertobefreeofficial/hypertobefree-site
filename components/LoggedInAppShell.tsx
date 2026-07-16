"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { shouldUseLoggedInShell } from "../lib/navigation/loggedInShellRoutes";

type LoggedInAppShellProps = {
  children: ReactNode;
};

export default function LoggedInAppShell({ children }: LoggedInAppShellProps) {
  const pathname = usePathname();

  if (!shouldUseLoggedInShell(pathname)) {
    return <>{children}</>;
  }

  return <div className="logged-in-app-shell min-h-screen">{children}</div>;
}
