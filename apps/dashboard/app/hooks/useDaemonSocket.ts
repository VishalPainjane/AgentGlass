/**
 * Daemon WebSocket Hook — Phase 2 Hardened
 *
 * Connects to the local AgentGlass daemon, handles bootstrap
 * and real-time event messages, and auto-reconnects with
 * exponential backoff. Picks up connection settings from localStorage.
 */

"use client";

import { useEffect, useRef, useCallback } from "react";
import { useTraceStore } from "./useTraceStore";
import type { PersistedEvent } from "../lib/eventHelpers";
import { getDaemonWsUrl, isLocalhostHost } from "../lib/daemonApi";
import { createDemoTraceEvents } from "../lib/demoTrace";

const HAS_CUSTOM_DAEMON_WS_URL = typeof process !== "undefined" && Boolean(process.env.NEXT_PUBLIC_DAEMON_WS_URL);
const DEMO_FALLBACK_ENABLED = typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEMO_FALLBACK !== "false";

const BASE_RECONNECT_MS = 1500;
const MAX_RECONNECT_MS = 16000;
const STATUS_DEBOUNCE_MS = 300; // Debounce status changes to prevent flicker

export function useDaemonSocket(): void {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const addEvent = useTraceStore((s) => s.addEvent);
  const bootstrap = useTraceStore((s) => s.bootstrap);
  const setConnectionStatus = useTraceStore((s) => s.setConnectionStatus);
  const setDemoMode = useTraceStore((s) => s.setDemoMode);

  const canUseDemoFallback =
    typeof window !== "undefined" &&
    DEMO_FALLBACK_ENABLED &&
    !HAS_CUSTOM_DAEMON_WS_URL &&
    !isLocalhostHost(window.location.hostname);

  // Debounced status setter to prevent rapid flicker during reconnects
  const setStatusDebounced = useCallback(
    (status: "connecting" | "connected" | "disconnected") => {
      if (!mountedRef.current) return;

      // "connected" should apply immediately (user sees green fast)
      if (status === "connected") {
        if (statusTimer.current) {
          clearTimeout(statusTimer.current);
          statusTimer.current = null;
        }
        setConnectionStatus(status);
        return;
      }

      // "connecting" and "disconnected" are debounced
      if (statusTimer.current) return; // already pending
      statusTimer.current = setTimeout(() => {
        statusTimer.current = null;
        if (mountedRef.current) {
          setConnectionStatus(status);
        }
      }, STATUS_DEBOUNCE_MS);
    },
    [setConnectionStatus]
  );

  const loadDemoTrace = useCallback(() => {
    if (!mountedRef.current) return;
    const state = useTraceStore.getState();
    if (state.events.length > 0) return;

    bootstrap(createDemoTraceEvents());
    setDemoMode(true);
    setConnectionStatus("connected");
  }, [bootstrap, setConnectionStatus, setDemoMode]);

  const connectWs = useCallback(() => {
    if (!mountedRef.current) return;

    // Recalculate URL inside connectWs to pick up localStorage changes
    const currentWsUrl = typeof window !== "undefined" ? getDaemonWsUrl() : "ws://127.0.0.1:8765/ws";

    // Clean up previous connection
    if (wsRef.current) {
      wsRef.current.onclose = null; // prevent recursive reconnect
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    setStatusDebounced("connecting");

    try {
      const ws = new WebSocket(currentWsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) {
          ws.close();
          return;
        }
        reconnectAttempt.current = 0;
        setDemoMode(false);
        setStatusDebounced("connected");
      };

      ws.onmessage = (messageEvent) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(String(messageEvent.data));

          if (data.type === "bootstrap" && Array.isArray(data.events)) {
            bootstrap(data.events as PersistedEvent[]);
          } else if (data.type === "event" && data.event) {
            addEvent(data.event as PersistedEvent);
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setStatusDebounced("disconnected");
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose will fire after onerror, so just close
        ws.close();
      };
    } catch {
      setStatusDebounced("disconnected");
      scheduleReconnect();
    }
  }, [addEvent, bootstrap, setStatusDebounced, setDemoMode]);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;

    if (canUseDemoFallback && reconnectAttempt.current >= 2) {
      loadDemoTrace();
      return;
    }

    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
    }

    const delay = Math.min(
      BASE_RECONNECT_MS * Math.pow(2, reconnectAttempt.current),
      MAX_RECONNECT_MS
    );

    reconnectAttempt.current++;

    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = null;
      if (mountedRef.current) {
        connectWs();
      }
    }, delay);
  }, [canUseDemoFallback, loadDemoTrace, connectWs]);

  useEffect(() => {
    mountedRef.current = true;
    connectWs();

    // Listen for storage events (if settings change in another tab)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "agentglass-settings") {
        connectWs();
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("storage", handleStorage);
      if (statusTimer.current) {
        clearTimeout(statusTimer.current);
      }
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
      }
    };
  }, [connectWs]);
}
