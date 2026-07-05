"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type CreatorStudioWorkspaceContextValue = {
  active: boolean;
  setActive: (active: boolean) => void;
};

const CreatorStudioWorkspaceContext =
  createContext<CreatorStudioWorkspaceContextValue>({
    active: false,
    setActive: () => {},
  });

export function CreatorStudioWorkspaceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [active, setActiveState] = useState(false);
  const setActive = useCallback((next: boolean) => {
    setActiveState(next);
  }, []);

  const value = useMemo(
    () => ({
      active,
      setActive,
    }),
    [active, setActive]
  );

  return (
    <CreatorStudioWorkspaceContext.Provider value={value}>
      {children}
    </CreatorStudioWorkspaceContext.Provider>
  );
}

export function useCreatorStudioWorkspace() {
  return useContext(CreatorStudioWorkspaceContext);
}
