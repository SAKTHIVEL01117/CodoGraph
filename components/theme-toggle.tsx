"use client";

import React from "react";
import { Sun, Moon, Laptop } from "lucide-react";
import { useTheme } from "./theme-provider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="group"
      aria-label="Theme selection"
      className="inline-flex items-center p-1 rounded-lg bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 text-xs font-jetbrains"
    >
      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-label="Force light theme"
        aria-pressed={theme === "light"}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
          theme === "light"
            ? "bg-white text-black shadow-sm font-semibold"
            : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
        }`}
      >
        <Sun className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Light</span>
      </button>

      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-label="Force dark theme"
        aria-pressed={theme === "dark"}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
          theme === "dark"
            ? "bg-black text-white shadow-sm font-semibold dark:bg-white/20"
            : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
        }`}
      >
        <Moon className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Dark</span>
      </button>

      <button
        type="button"
        onClick={() => setTheme("system")}
        aria-label="Follow system theme"
        aria-pressed={theme === "system"}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
          theme === "system"
            ? "bg-white text-black dark:bg-white/20 dark:text-white shadow-sm font-semibold"
            : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
        }`}
      >
        <Laptop className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">System</span>
      </button>
    </div>
  );
}
