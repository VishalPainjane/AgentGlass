"use client";

import { useEffect } from "react";
import { useTraceStore } from "./useTraceStore";

const PERSIST_KEY = "agentglass-ui-prefs";

interface UIPreferences {
  sidebarCollapsed: boolean;
  theme: "dark" | "light";
  denseMode: boolean;
  splitRatio: number;
}

const defaults: UIPreferences = {
  sidebarCollapsed: false,
  theme: "dark",
  denseMode: false,
  splitRatio: 0.5,
};

export function usePersistUI() {
  const denseMode = useTraceStore((s) => s.denseMode);
  const setDenseMode = useTraceStore((s) => s.setDenseMode);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = localStorage.getItem(PERSIST_KEY);
      if (raw) {
        const prefs = JSON.parse(raw) as Partial<UIPreferences>;
        if (prefs.denseMode !== undefined && prefs.denseMode !== denseMode) {
          setDenseMode(prefs.denseMode);
        }
        if (prefs.theme === "light") {
          document.documentElement.setAttribute("data-theme", "light");
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = localStorage.getItem(PERSIST_KEY);
      const current: UIPreferences = raw ? JSON.parse(raw) : defaults;
      if (current.denseMode !== denseMode) {
        localStorage.setItem(
          PERSIST_KEY,
          JSON.stringify({ ...current, denseMode })
        );
      }
    } catch {
      // Ignore storage errors
    }
  }, [denseMode]);
}