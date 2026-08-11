/**
 * Daemon WebSocket Hook — Phase 2 Hardened
 *
 * Connects to the local AgentGlass daemon, handles bootstrap
 * and real-time event messages, and auto-reconnects with
 * exponential backoff. Picks up connection settings from localStorage.
 *
 * Synthetic demo traces are disabled by default. Set
 * NEXT_PUBLIC_DEMO_FALLBACK=true only for UI development without a daemon.
 */

"use client";

import type { TraceSummary } from "@agentglass/sdk-ts/browser";
import { useEffect, useRef, useCallback } from "react";
import { useTraceStore } from "./useTraceStore";
import type { PersistedEvent } from "../lib/eventHelpers";
import { getDaemonWsUrl } from "../lib/daemonApi";
import { isShowcaseMode } from "../lib/showcaseMode";
import { loadShowcaseData } from "../lib/showcaseData";

const DEMO_FALLBACK_ENABLED =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEMO_FALLBACK === "true";
const SHOWCASE_MODE = isShowcaseMode();

const BASE_RECONNECT_MS = 1500;
const MAX_RECONNECT_MS = 16000;
const STATUS_DEBOUNCE_MS = 300;

export function useDaemonSocket(): void {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const addEvent = useTraceStore((s) => s.addEvent);
  const bootstrap = useTraceStore((s) => s.bootstrap);
  const setTraces = useTraceStore((s) => s.setTraces);
  const setSummaries = useTraceStore((s) => s.setSummaries);
  const setSummary = useTraceStore((s) => s.setSummary);
  const fetchTraces = useTraceStore((s) => s.fetchTraces);
  const setConnectionStatus = useTraceStore((s) => s.setConnectionStatus);
  const setDemoMode = useTraceStore((s) => s.setDemoMode);
  const selectTrace = useTraceStore((s) => s.selectTrace);

  const setStatusDebounced = useCallback(
    (status: "connecting" | "connected" | "disconnected") => {
      if (!mountedRef.current) return;

      if (status === "connected") {
        if (statusTimer.current) {
          clearTimeout(statusTimer.current);
          statusTimer.current = null;
        }
        setConnectionStatus(status);
        return;
      }

      if (statusTimer.current) return;
      statusTimer.current = setTimeout(() => {
        statusTimer.current = null;
        if (mountedRef.current) {
          setConnectionStatus(status);
        }
      }, STATUS_DEBOUNCE_MS);
    },
    [setConnectionStatus]
  );

  const connectWs = useCallback(() => {
    if (!mountedRef.current) return;

    const currentWsUrl = typeof window !== "undefined" ? getDaemonWsUrl() : "ws://127.0.0.1:8765/ws";

    if (wsRef.current) {
      wsRef.current.onclose = null;
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
        void fetchTraces();
      };

      ws.onmessage = (messageEvent) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(String(messageEvent.data));

          if (data.type === "bootstrap" && Array.isArray(data.events)) {
            bootstrap(
              data.events as PersistedEvent[],
              Array.isArray(data.summaries) ? (data.summaries as TraceSummary[]) : []
            );
          } else if (data.type === "event" && data.event) {
            addEvent(data.event as PersistedEvent);
          } else if (data.type === "summary" && data.summary) {
            setSummary(data.summary as TraceSummary);
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
        ws.close();
      };
    } catch {
      setStatusDebounced("disconnected");
      scheduleReconnect();
    }
  }, [addEvent, bootstrap, fetchTraces, setSummary, setStatusDebounced, setDemoMode]);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;

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
  }, [connectWs]);

  useEffect(() => {
    if (SHOWCASE_MODE) {
      mountedRef.current = true;
      setStatusDebounced("connecting");

      void loadShowcaseData()
        .then((data) => {
          if (!mountedRef.current) return;

          const summaries = Object.values(data.summaries);
          bootstrap(data.events, summaries);
          setTraces(data.traces);
          setSummaries(summaries);
          setDemoMode(true);
          setStatusDebounced("connected");

          if (data.defaultTraceId) {
            selectTrace(data.defaultTraceId);
          }
        })
        .catch((error) => {
          console.error("[AgentGlass] Failed to load showcase data:", error);
          setStatusDebounced("disconnected");
        });

      return () => {
        mountedRef.current = false;
      };
    }

    if (DEMO_FALLBACK_ENABLED) {
      console.warn(
        "[AgentGlass] NEXT_PUBLIC_DEMO_FALLBACK=true — synthetic traces are enabled for UI development only."
      );
    }

    mountedRef.current = true;
    connectWs();

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
  }, [bootstrap, connectWs, selectTrace, setDemoMode, setSummaries, setStatusDebounced, setTraces]);
}
