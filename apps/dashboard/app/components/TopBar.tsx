/**
 * TopBar — Dashboard header with logo, trace selector, and actions
 *
 * Redesigned for Phase 1:
 * - Removed ConnectionStatus from top bar (relocated to Settings)
 * - Clean three-section layout: brand | trace selector | actions
 * - Consistent spacing and no overlap on resize
 */

"use client";

import TraceSelector from "./TraceSelector";
import { useTraceStore } from "../hooks/useTraceStore";
import { daemonHttp } from "../lib/daemonApi";

export default function TopBar({ mode = "primary" }: { mode?: "primary" | "compare" | "settings" }) {
  const events = useTraceStore((s) => s.events);
  const traces = useTraceStore((s) => s.traces);
  const selectedTraceId = useTraceStore((s) => s.selectedTraceId);
  const isDemoMode = useTraceStore((s) => s.isDemoMode);

  return (
    <header className="topbar" id="topbar-header">
      <div className="topbar-brand">
        <span className="topbar-logo" aria-hidden>◇</span>
        <span className="topbar-name">AgentGlass</span>
        <span className="topbar-badge">v0.1</span>
      </div>

      <div className="topbar-center">
        {mode === "settings" ? (
          <span className="topbar-page-title">Settings</span>
        ) : mode === "compare" ? (
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
            id="topbar-export-btn"
          >
            ↓ Export
          </a>
        )}
        {isDemoMode && <span className="topbar-demo-badge">Demo Data</span>}
        <span className="topbar-event-count">
          {events.length} events • {traces.length} traces
        </span>
      </div>
    </header>
  );
}
