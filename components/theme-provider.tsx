"use client";

import React, { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";

type Theme = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  mounted: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
  mounted: false,
});

function computeResolvedTheme(targetTheme: Theme): ResolvedTheme {
  if (targetTheme === "dark") return "dark";
  if (targetTheme === "light") return "light";
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

function applyTheme(targetTheme: Theme): ResolvedTheme {
  const actual = computeResolvedTheme(targetTheme);
  if (typeof document === "undefined") return actual;

  const root = document.documentElement;
  if (actual === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  root.setAttribute("data-theme", targetTheme);
  return actual;
}

const subscribe = () => () => {};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Deterministic server and initial client state to eliminate hydration mismatch
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  useEffect(() => {
    let initialTheme: Theme = "system";

    try {
      const match = document.cookie.match(/(?:^|; )codograph_theme=([^;]*)/);
      const cookieTheme = match ? decodeURIComponent(match[1]) : null;
      const stored = (localStorage.getItem("codograph_theme") as Theme) || cookieTheme;
      if (stored === "light" || stored === "dark" || stored === "system") {
        initialTheme = stored;
      }
    } catch {}

    const actual = applyTheme(initialTheme);
    queueMicrotask(() => {
      setThemeState(initialTheme);
      setResolvedTheme(actual);
    });

    // If system theme, listen to OS change
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const current = (localStorage.getItem("codograph_theme") as Theme) || "system";
      if (current === "system") {
        const nextActual = applyTheme("system");
        setResolvedTheme(nextActual);
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
    const actual = applyTheme(newTheme);
    setResolvedTheme(actual);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, mounted }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
