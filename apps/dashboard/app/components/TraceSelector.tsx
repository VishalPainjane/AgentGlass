/**
 * TraceSelector — Dropdown to pick which trace to visualize
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTraceStore } from "../hooks/useTraceStore";
import { formatDuration, formatRelativeTime } from "../lib/eventHelpers";

interface TraceRunSummary {
  traceId: string;
  shortId: string;
  flowName: string;
  eventCount: number;
  nodeCount: number;
  hasError: boolean;
  durationLabel: string;
  lastSeenLabel: string;
  statusLabel: string;
}

function deriveFlowName(eventsForTrace: Array<{ event_type: string; parent_span_id: string | null; node_name: string }>): string {
  const rootStart = eventsForTrace.find(
    (event) => event.event_type === "agent_start" && event.parent_span_id === null && event.node_name
  );
  if (rootStart?.node_name) return rootStart.node_name;

  const firstNamed = eventsForTrace.find((event) => event.node_name?.trim());
  if (firstNamed?.node_name) return firstNamed.node_name;

  return "Unnamed Flow";
}

function summarizeStatus(hasError: boolean, lastEventType: string | undefined): string {
  if (hasError) return "Error";
  if (lastEventType === "agent_end") return "Completed";
  return "In progress";
}

export default function TraceSelector({
  mode = "primary",
  label,
}: {
  mode?: "primary" | "compare";
  label?: string;
}) {
  const traces = useTraceStore((s) => s.traces);
  const events = useTraceStore((s) => s.events);

  const selectedTraceId = useTraceStore((s) => s.selectedTraceId);
  const compareTraceId = useTraceStore((s) => s.compareTraceId);
  const selectTrace = useTraceStore((s) => s.selectTrace);
  const setCompareTraceId = useTraceStore((s) => s.setCompareTraceId);

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const value = mode === "primary" ? selectedTraceId : compareTraceId;
  const onChange = mode === "primary" ? selectTrace : setCompareTraceId;

  const summaries = useMemo<TraceRunSummary[]>(() => {
    return traces.map((trace) => {
      const traceEvents = events.filter((event) => event.trace_id === trace.trace_id);
      const spanIds = new Set(traceEvents.map((event) => event.span_id));
      const lastEventType = traceEvents.length > 0 ? traceEvents[traceEvents.length - 1].event_type : undefined;

      return {
        traceId: trace.trace_id,
        shortId: trace.trace_id.slice(0, 8),
        flowName: deriveFlowName(traceEvents),
        eventCount: trace.event_count,
        nodeCount: spanIds.size,
        hasError: trace.has_error,
        durationLabel:
          trace.last_timestamp > trace.first_timestamp
            ? formatDuration(trace.first_timestamp, trace.last_timestamp)
            : "< 1ms",
        lastSeenLabel: formatRelativeTime(trace.last_timestamp),
        statusLabel: summarizeStatus(trace.has_error, lastEventType),
      };
    });
  }, [events, traces]);

  const selectedSummary = summaries.find((summary) => summary.traceId === value) ?? null;

  useEffect(() => {
    if (mode !== "compare") return;
    if (compareTraceId && selectedTraceId && compareTraceId === selectedTraceId) {
      setCompareTraceId(null);
    }
  }, [mode, compareTraceId, selectedTraceId, setCompareTraceId]);

  useEffect(() => {
    const onDocumentMouseDown = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, []);

  if (traces.length === 0) {
    return (
      <div className="trace-selector">
        <span className="trace-selector-label">{label ?? (mode === "primary" ? "Flow" : "Compare Flow")}</span>
        <span className="trace-selector-empty">No traces</span>
      </div>
    );
  }

  return (
    <div className={`trace-selector trace-selector-${mode}`} ref={containerRef}>
      <span className="trace-selector-label">{label ?? (mode === "primary" ? "Primary Flow" : "Compare Flow")}</span>

      <button
        type="button"
        className={`trace-selector-trigger ${open ? "trace-selector-trigger-open" : ""}`}
        onClick={() => setOpen((current) => !current)}
      >
        {selectedSummary ? (
          <div className="trace-selector-trigger-main">
            <span className="trace-selector-trigger-name">{selectedSummary.flowName}</span>
            <span className="trace-selector-trigger-meta">
              {selectedSummary.shortId} • {selectedSummary.eventCount} events • {selectedSummary.durationLabel}
            </span>
          </div>
        ) : (
          <span className="trace-selector-trigger-placeholder">Select a flow to compare</span>
        )}
        <span className="trace-selector-caret">▾</span>
      </button>

      {open && (
        <div className="trace-selector-menu">
          {mode === "compare" && (
            <button
              type="button"
              className={`trace-selector-option ${value === null ? "trace-selector-option-selected" : ""}`}
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              <span className="trace-selector-option-name">None</span>
              <span className="trace-selector-option-meta">Disable branch comparison</span>
            </button>
          )}

          {summaries.map((summary) => {
            const isSelected = summary.traceId === value;
            const isPrimaryWhenCompareMode =
              mode === "compare" && selectedTraceId && summary.traceId === selectedTraceId;

            return (
              <button
                key={summary.traceId}
                type="button"
                className={`trace-selector-option ${isSelected ? "trace-selector-option-selected" : ""}`}
                onClick={() => {
                  if (isPrimaryWhenCompareMode) return;
                  onChange(summary.traceId);
                  setOpen(false);
                }}
                disabled={Boolean(isPrimaryWhenCompareMode)}
              >
                <div className="trace-selector-option-top">
                  <span className="trace-selector-option-name">{summary.flowName}</span>
                  <span
                    className={`trace-selector-option-status ${
                      summary.hasError
                        ? "trace-selector-option-status-error"
                        : "trace-selector-option-status-ok"
                    }`}
                  >
                    {isPrimaryWhenCompareMode ? "Primary" : summary.statusLabel}
                  </span>
                </div>

                <span className="trace-selector-option-meta">
                  {summary.shortId} • {summary.eventCount} events • {summary.nodeCount} nodes • {summary.durationLabel} • {summary.lastSeenLabel}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
