"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import {
  useMobileNavBadges,
  type MobileNavBadgeState,
} from "../lib/navigation/useMobileNavBadges";
import { recordMobileNavBadgeProviderMount } from "../lib/navigation/mobileNavBadgeTestMode";

const MobileNavBadgeContext = createContext<MobileNavBadgeState | null>(null);

type MobileNavBadgeProviderProps = {
  children: ReactNode;
};

export function MobileNavBadgeProvider({ children }: MobileNavBadgeProviderProps) {
  const value = useMobileNavBadges();

  useEffect(() => {
    recordMobileNavBadgeProviderMount();
  }, []);

  return (
    <MobileNavBadgeContext.Provider value={value}>
      {children}
    </MobileNavBadgeContext.Provider>
  );
}

export function useMobileNavBadgeContext(): MobileNavBadgeState {
  const context = useContext(MobileNavBadgeContext);

  if (!context) {
    throw new Error(
      "useMobileNavBadgeContext must be used within MobileNavBadgeProvider"
    );
  }

  return context;
}
