/**
 * Daemon WebSocket Hook
 *
 * Connects to the local AgentGlass daemon, handles bootstrap
 * and real-time event messages, and auto-reconnects with
 * exponential backoff.
 */

"use client";

import { useEffect, useRef, useCallback } from "react";
import { useTraceStore } from "./useTraceStore";
import type { PersistedEvent } from "../lib/eventHelpers";

const DAEMON_WS_URL =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_DAEMON_WS_URL ?? "ws://127.0.0.1:7777/ws"
    : "ws://127.0.0.1:7777/ws";

const BASE_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 16000;

export function useDaemonSocket(): void {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addEvent = useTraceStore((s) => s.addEvent);
  const bootstrap = useTraceStore((s) => s.bootstrap);
  const setConnectionStatus = useTraceStore((s) => s.setConnectionStatus);

  const connect = useCallback(() => {
    // Clean up previous connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnectionStatus("connecting");

    try {
      const ws = new WebSocket(DAEMON_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttempt.current = 0;
        setConnectionStatus("connected");
      };

      ws.onmessage = (messageEvent) => {
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
        setConnectionStatus("disconnected");
        scheduleReconnect();
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      setConnectionStatus("disconnected");
      scheduleReconnect();
    }
  }, [addEvent, bootstrap, setConnectionStatus]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
    }

    const delay = Math.min(
      BASE_RECONNECT_MS * Math.pow(2, reconnectAttempt.current),
      MAX_RECONNECT_MS
    );

    reconnectAttempt.current++;

    reconnectTimer.current = setTimeout(() => {
      connect();
    }, delay);
  }, [connect]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);
}
