"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type AppearanceMode = "system" | "light" | "dark";

type AppearanceContextValue = {
  appearanceMode: AppearanceMode;
  setAppearanceMode: (mode: AppearanceMode) => void;
};

const STORAGE_KEY = "cookpilot-appearance-mode";

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function getInitialAppearanceMode(): AppearanceMode {
  if (typeof window === "undefined") return "system";

  const savedMode = window.localStorage.getItem(STORAGE_KEY);
  if (savedMode === "light" || savedMode === "dark" || savedMode === "system") {
    return savedMode;
  }

  return "system";
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>(
    getInitialAppearanceMode,
  );

  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    function applyTheme() {
      const effectiveTheme =
        appearanceMode === "system"
          ? mediaQuery.matches
            ? "dark"
            : "light"
          : appearanceMode;

      root.dataset.theme = effectiveTheme;
    }

    applyTheme();
    window.localStorage.setItem(STORAGE_KEY, appearanceMode);

    const handleChange = () => {
      if (appearanceMode === "system") {
        applyTheme();
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [appearanceMode]);

  const value = useMemo(
    () => ({ appearanceMode, setAppearanceMode }),
    [appearanceMode],
  );

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) {
    throw new Error("useAppearance must be used inside AppearanceProvider");
  }
  return value;
}
