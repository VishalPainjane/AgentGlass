/**
 * TraceSelector — Searchable dropdown to pick which trace to visualize
 *
 * Phase 1 redesign:
 * - Search input at top of dropdown
 * - Keyboard navigation (↑/↓, Enter, Escape)
 * - Stable width, long-name truncation
 * - Accessible ARIA roles
 */

"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useTraceStore } from "../hooks/useTraceStore";
import { formatDuration, formatRelativeTime } from "../lib/eventHelpers";
import { useHasMounted } from "../hooks/useHasMounted";

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
  const hasMounted = useHasMounted();

  const selectedTraceId = useTraceStore((s) => s.selectedTraceId);
  const compareTraceId = useTraceStore((s) => s.compareTraceId);
  const selectTrace = useTraceStore((s) => s.selectTrace);
  const setCompareTraceId = useTraceStore((s) => s.setCompareTraceId);

  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

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
        lastSeenLabel: hasMounted ? formatRelativeTime(trace.last_timestamp) : "...",
        statusLabel: summarizeStatus(trace.has_error, lastEventType),
      };
    });
  }, [events, traces, hasMounted]);

  const selectedSummary = summaries.find((summary) => summary.traceId === value) ?? null;

  // Build filtered list for dropdown
  const filteredSummaries = useMemo(() => {
    if (!searchQuery.trim()) return summaries;
    const q = searchQuery.toLowerCase();
    return summaries.filter(
      (s) =>
        s.flowName.toLowerCase().includes(q) ||
        s.shortId.toLowerCase().includes(q) ||
        s.traceId.toLowerCase().includes(q) ||
        s.statusLabel.toLowerCase().includes(q)
    );
  }, [summaries, searchQuery]);

  // Build selectable items list (including "None" option for compare mode)
  const selectableItems = useMemo(() => {
    const items: Array<{ type: "none" } | { type: "trace"; summary: TraceRunSummary }> = [];
    if (mode === "compare") {
      items.push({ type: "none" });
    }
    for (const s of filteredSummaries) {
      items.push({ type: "trace", summary: s });
    }
    return items;
  }, [mode, filteredSummaries]);

  // Auto-clear compare if it matches primary
  useEffect(() => {
    if (mode !== "compare") return;
    if (compareTraceId && selectedTraceId && compareTraceId === selectedTraceId) {
      setCompareTraceId(null);
    }
  }, [mode, compareTraceId, selectedTraceId, setCompareTraceId]);

  // Click outside to close
  useEffect(() => {
    const onDocumentMouseDown = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setSearchQuery("");
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [open]);

  // Reset highlighted index when filtered items change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [filteredSummaries]);

  const handleSelect = useCallback(
    (traceId: string | null) => {
      onChange(traceId);
      setOpen(false);
      setSearchQuery("");
      setHighlightedIndex(-1);
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) {
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
          e.preventDefault();
          setOpen(true);
        }
        return;
      }

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          setOpen(false);
          setSearchQuery("");
          setHighlightedIndex(-1);
          break;

        case "ArrowDown":
          e.preventDefault();
          setHighlightedIndex((prev) => {
            const next = prev + 1;
            return next >= selectableItems.length ? 0 : next;
          });
          break;

        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex((prev) => {
            const next = prev - 1;
            return next < 0 ? selectableItems.length - 1 : next;
          });
          break;

        case "Enter": {
          e.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < selectableItems.length) {
            const item = selectableItems[highlightedIndex];
            if (item.type === "none") {
              handleSelect(null);
            } else {
              const isPrimaryWhenCompareMode =
                mode === "compare" && selectedTraceId && item.summary.traceId === selectedTraceId;
              if (!isPrimaryWhenCompareMode) {
                handleSelect(item.summary.traceId);
              }
            }
          }
          break;
        }
      }
    },
    [open, selectableItems, highlightedIndex, handleSelect, mode, selectedTraceId]
  );

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex < 0 || !menuRef.current) return;
    const items = menuRef.current.querySelectorAll("[data-trace-option]");
    if (items[highlightedIndex]) {
      items[highlightedIndex].scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex]);

  if (traces.length === 0) {
    return (
      <div className="trace-selector" id={`trace-selector-${mode}`}>
        <span className="trace-selector-empty">No traces available</span>
      </div>
    );
  }

  return (
    <div
      className={`trace-selector trace-selector-${mode}`}
      ref={containerRef}
      onKeyDown={handleKeyDown}
      id={`trace-selector-${mode}`}
    >
      {label && <span className="trace-selector-label">{label}</span>}
      <button
        type="button"
        className={`trace-selector-trigger ${open ? "trace-selector-trigger-open" : ""}`}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        id={`trace-selector-trigger-${mode}`}
      >

        {selectedSummary ? (
          <span className="trace-selector-trigger-main">
            <span className="trace-selector-trigger-name">{selectedSummary.flowName}</span>
            <span className="trace-selector-trigger-meta">
              {selectedSummary.shortId} • {selectedSummary.eventCount} events • {selectedSummary.durationLabel}
            </span>
          </span>
        ) : (
          <span className="trace-selector-trigger-placeholder">Select a flow to compare</span>
        )}
        <span className="trace-selector-caret" aria-hidden>▾</span>
      </button>

      {open && (
        <div className="trace-selector-menu" role="listbox" ref={menuRef}>
          <div className="trace-selector-search-wrap">
            <input
              ref={searchInputRef}
              type="text"
              className="trace-selector-search"
              placeholder="Search traces…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search traces"
              id={`trace-selector-search-${mode}`}
            />
          </div>

          {mode === "compare" && (
            <button
              type="button"
              data-trace-option
              className={`trace-selector-option ${value === null ? "trace-selector-option-selected" : ""} ${highlightedIndex === 0 ? "trace-selector-option-highlighted" : ""}`}
              onClick={() => handleSelect(null)}
              role="option"
              aria-selected={value === null}
            >
              <span className="trace-selector-option-name">None</span>
              <span className="trace-selector-option-meta">Disable branch comparison</span>
            </button>
          )}

          {filteredSummaries.length === 0 ? (
            <div className="trace-selector-no-results">No matching traces</div>
          ) : (
            filteredSummaries.map((summary, idx) => {
              const itemIndex = mode === "compare" ? idx + 1 : idx;
              const isSelected = summary.traceId === value;
              const isHighlighted = highlightedIndex === itemIndex;
              const isPrimaryWhenCompareMode =
                mode === "compare" && selectedTraceId && summary.traceId === selectedTraceId;

              return (
                <button
                  key={summary.traceId}
                  type="button"
                  data-trace-option
                  className={`trace-selector-option ${isSelected ? "trace-selector-option-selected" : ""} ${isHighlighted ? "trace-selector-option-highlighted" : ""}`}
                  onClick={() => {
                    if (isPrimaryWhenCompareMode) return;
                    handleSelect(summary.traceId);
                  }}
                  disabled={Boolean(isPrimaryWhenCompareMode)}
                  role="option"
                  aria-selected={isSelected}
                >
                  <span className="trace-selector-option-top">
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
                  </span>

                  <span className="trace-selector-option-meta">
                    {summary.shortId} • {summary.eventCount} events • {summary.nodeCount} nodes • {summary.durationLabel} • {summary.lastSeenLabel}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
