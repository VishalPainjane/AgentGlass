"use client";

import { useEffect, useRef, useCallback } from "react";

interface UseFocusFirstOptions {
  key?: string;
  selector?: string;
  enabled?: boolean;
}

export function useFocusFirst({
  key = "/",
  selector = "[data-search-input], [data-focus-first], input[type='text'], input[type='search']",
  enabled = true,
}: UseFocusFirstOptions = {}) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;
      if (e.key === key && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        ) {
          return;
        }

        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>(selector);
        input?.focus();
      }
    },
    [key, selector, enabled]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}