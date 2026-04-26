/**
 * TopBar — Dashboard header with logo, trace selector, and connection status
 */

"use client";

import ConnectionStatus from "./ConnectionStatus";
import TraceSelector from "./TraceSelector";
import { useTraceStore } from "../hooks/useTraceStore";
import { daemonHttp } from "../lib/daemonApi";

export default function TopBar({ mode = "primary" }: { mode?: "primary" | "compare" }) {
  const events = useTraceStore((s) => s.events);
  const traces = useTraceStore((s) => s.traces);
  const selectedTraceId = useTraceStore((s) => s.selectedTraceId);
  const isDemoMode = useTraceStore((s) => s.isDemoMode);

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-logo">◇</span>
        <span className="topbar-name">AgentGlass</span>
        <span className="topbar-badge">v0.1</span>
      </div>

      <div className="topbar-center">
        {mode === "compare" ? (
          <div className="topbar-compare-selectors">
            <TraceSelector mode="primary" label="Branch Alpha" />
            <span className="topbar-compare-arrow" aria-hidden>
              ⇄
            </span>
            <TraceSelector mode="compare" label="Branch Beta" />
          </div>
        ) : (
          <TraceSelector mode="primary" label="Active Flow" />
        )}
      </div>

      <div className="topbar-right">
        {mode !== "compare" && selectedTraceId && (
          <a
            href={daemonHttp(`/v1/traces/${selectedTraceId}/export`)}
            download
            className="topbar-export-btn"
            title="Export as Pytest Unit Test"
          >
            Export Pytest
          </a>
        )}
        {isDemoMode && <span className="topbar-demo-badge">Demo Data</span>}
        <span className="topbar-event-count">
          {events.length} events • {traces.length} traces
        </span>
        <ConnectionStatus />
      </div>
    </header>
  );
}
