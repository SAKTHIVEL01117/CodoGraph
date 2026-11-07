"use client";

import React, { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";

type Theme = "system" | "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  mounted: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "system",
  setTheme: () => {},
  mounted: false,
});

function applyTheme(targetTheme: Theme) {
  if (typeof document === "undefined") return;
  const isDark =
    targetTheme === "dark" ||
    (targetTheme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  const root = document.documentElement;
  if (isDark) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  root.setAttribute("data-theme", targetTheme);
}

const subscribe = () => () => {};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Deterministic server and initial client state to eliminate hydration mismatch
  const [theme, setThemeState] = useState<Theme>("system");
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  useEffect(() => {
    let resolvedTheme: Theme = "system";

    try {
      const match = document.cookie.match(/(?:^|; )codograph_theme=([^;]*)/);
      const cookieTheme = match ? decodeURIComponent(match[1]) : null;
      const stored = (localStorage.getItem("codograph_theme") as Theme) || cookieTheme;
      if (stored === "light" || stored === "dark" || stored === "system") {
        resolvedTheme = stored;
      }
    } catch {}

    applyTheme(resolvedTheme);
    queueMicrotask(() => {
      setThemeState(resolvedTheme);
    });

    // If system theme, listen to OS change
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const current = (localStorage.getItem("codograph_theme") as Theme) || "system";
      if (current === "system") {
        applyTheme("system");
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem("codograph_theme", newTheme);
      document.cookie = `codograph_theme=${newTheme}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {}
    applyTheme(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, mounted }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
