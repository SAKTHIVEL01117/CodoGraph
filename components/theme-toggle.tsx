"use client";

import React, { useSyncExternalStore } from "react";
import { useTheme } from "./theme-provider";

const subscribe = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme, mounted } = useTheme();
  const isMounted = useSyncExternalStore(subscribe, () => true, () => false);

  // During SSR and initial client hydration, guarantee deterministic initial state ("system")
  const activeTheme = isMounted || mounted ? theme : "system";

  return (
    <div
      role="group"
      aria-label="Theme selection"
      className="inline-flex items-center rounded border border-border/40 bg-secondary/30 p-0.5 text-[11px] font-mono"
    >
      <button
        type="button"
        onClick={() => setTheme("system")}
        aria-label="Follow system theme"
        aria-pressed={activeTheme === "system"}
        className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
          activeTheme === "system"
            ? "bg-secondary text-foreground font-semibold shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        system
      </button>

      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-label="Force light theme"
        aria-pressed={activeTheme === "light"}
        className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
          activeTheme === "light"
            ? "bg-secondary text-foreground font-semibold shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        light
      </button>

      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-label="Force dark theme"
        aria-pressed={activeTheme === "dark"}
        className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
          activeTheme === "dark"
            ? "bg-secondary text-foreground font-semibold shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        dark
      </button>
    </div>
  );
}
