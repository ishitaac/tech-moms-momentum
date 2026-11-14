"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY, type Theme } from "@/config/theme";

const CONTRAST_QUERY = "(prefers-contrast: more)";
const THEME_EVENT = "ff-theme-change";

function currentTheme(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "contrast" || set === "default") return set;
  return window.matchMedia(CONTRAST_QUERY).matches ? "contrast" : "default";
}

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(CONTRAST_QUERY);
  media.addEventListener("change", onChange);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

function setTheme(next: Theme): void {
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Storage can be blocked; the theme still applies for this visit.
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Optional high-contrast, color-blind-friendly theme. Only CSS tokens change (see globals.css). */
export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme | null>(subscribe, currentTheme, () => null);
  const on = theme === "contrast";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setTheme(on ? "default" : "contrast")}
      disabled={theme === null}
      className="flex w-full items-center justify-between gap-3 rounded-full border border-control px-4 py-2 text-sm font-medium text-plum hover:bg-plum-tint"
    >
      <span>High-contrast colors</span>
      <span aria-hidden="true" className={`rounded-full px-2 py-0.5 text-xs font-semibold ${on ? "bg-plum text-white" : "border border-control text-plum"}`}>
        {on ? "On" : "Off"}
      </span>
    </button>
  );
}
