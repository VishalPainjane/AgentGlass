"use client";

import { useMemo, useState } from "react";
import { useTraceStore } from "../hooks/useTraceStore";
import { formatDuration, formatTimestamp, type PersistedEvent } from "../lib/eventHelpers";
import { useHydratedPayload } from "./NodeInspector";

interface TokenTotals {
  input: number;
  output: number;
}

interface TraceExecutionSummary {
  traceId: string;
  shortId: string;
  flowName: string;
  status: "Completed" | "Error" | "Running";
  eventCount: number;
  nodeCount: number;
  toolCalls: number;
  llmCalls: number;
  errorCount: number;
  durationMicros: number;
  durationLabel: string;
  startedAt: string;
  finishedAt: string;
  tokenInput: number;
  tokenOutput: number;
  totalTokens: number;
  finalNodeName: string;
  finalEventType: string;
  checkpoints: string[];
  models: string[];
}

interface DiffRow {
  path: string;
  primaryValue?: string;
  compareValue?: string;
  kind: "changed" | "same" | "primary-only" | "compare-only";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function leafToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  if (value === undefined) return "undefined";

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function flattenJson(value: unknown, path: string = "$", output: Map<string, string> = new Map()): Map<string, string> {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      output.set(path, "[]");
      return output;
    }

    value.forEach((entry, index) => {
      flattenJson(entry, `${path}[${index}]`, output);
    });
    return output;
  }

  if (isRecord(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      output.set(path, "{}");
      return output;
    }

    keys.forEach((key) => {
      flattenJson(value[key], `${path}.${key}`, output);
    });
    return output;
  }

  output.set(path, leafToString(value));
  return output;
}

function buildDiffRows(primary: unknown, compare: unknown): DiffRow[] {
  const primaryMap = flattenJson(primary);
  const compareMap = flattenJson(compare);
  const keys = Array.from(new Set([...primaryMap.keys(), ...compareMap.keys()])).sort((a, b) =>
    a.localeCompare(b)
  );

  const rows = keys.map<DiffRow>((path) => {
    const primaryValue = primaryMap.get(path);
    const compareValue = compareMap.get(path);

    if (primaryValue === undefined) {
      return { path, primaryValue: undefined, compareValue, kind: "compare-only" };
    }
    if (compareValue === undefined) {
      return { path, primaryValue, compareValue: undefined, kind: "primary-only" };
    }
    if (primaryValue === compareValue) {
      return { path, primaryValue, compareValue, kind: "same" };
    }

    return { path, primaryValue, compareValue, kind: "changed" };
  });

  const rank: Record<DiffRow["kind"], number> = {
    changed: 0,
    "primary-only": 1,
    "compare-only": 2,
    same: 3,
  };

  return rows.sort((a, b) => {
    const rankDiff = rank[a.kind] - rank[b.kind];
    if (rankDiff !== 0) return rankDiff;
    return a.path.localeCompare(b.path);
  });
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

function extractTokenTotals(payload: Record<string, unknown>): TokenTotals {
  const directInput = pickNumber(payload, ["input_tokens", "prompt_tokens"]);
  const directOutput = pickNumber(payload, ["output_tokens", "completion_tokens"]);

  let input = directInput ?? 0;
  let output = directOutput ?? 0;

  const nestedCandidates = [payload.tokens, payload.token_usage, payload.usage];
  for (const nested of nestedCandidates) {
    if (!isRecord(nested)) continue;

    if (input === 0) {
      input = pickNumber(nested, ["input", "prompt", "input_tokens", "prompt_tokens"]) ?? 0;
    }
    if (output === 0) {
      output = pickNumber(nested, ["output", "completion", "output_tokens", "completion_tokens"]) ?? 0;
    }
  }

  return { input, output };
}

function deriveFlowName(events: PersistedEvent[]): string {
  const rootStart = events.find(
    (event) => event.event_type === "agent_start" && event.parent_span_id === null && event.node_name
  );
  if (rootStart?.node_name) return rootStart.node_name;

  const firstNamed = events.find((event) => event.node_name.trim().length > 0);
  return firstNamed?.node_name ?? "Unnamed Flow";
}

function summarizeTrace(traceId: string | null, events: PersistedEvent[]): TraceExecutionSummary | null {
  if (!traceId || events.length === 0) return null;

  const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const first = sortedEvents[0];
  const last = sortedEvents[sortedEvents.length - 1];

  const uniqueSpanIds = new Set(sortedEvents.map((event) => event.span_id));
  const checkpoints = new Set<string>();
  const models = new Set<string>();
  let tokenInput = 0;
  let tokenOutput = 0;
  let toolCalls = 0;
  let llmCalls = 0;
  let errorCount = 0;

  for (const event of sortedEvents) {
    const payload = event.payload;

    if (event.event_type === "tool_call") toolCalls += 1;
    if (event.event_type === "llm_request") llmCalls += 1;
    if (event.event_type === "error") errorCount += 1;

    const tokens = extractTokenTotals(payload);
    tokenInput += tokens.input;
    tokenOutput += tokens.output;

    const model = pickString(payload, ["model"]);
    if (model) models.add(model);

    if (event.event_type === "state_snapshot") {
      const checkpoint = pickString(payload, ["checkpoint", "stage"]);
      if (checkpoint) checkpoints.add(checkpoint);
    }
  }

  const durationMicros = Math.max(0, last.timestamp - first.timestamp);
  const status: TraceExecutionSummary["status"] =
    errorCount > 0 ? "Error" : last.event_type === "agent_end" ? "Completed" : "Running";

  return {
    traceId,
    shortId: traceId.slice(0, 8),
    flowName: deriveFlowName(sortedEvents),
    status,
    eventCount: sortedEvents.length,
    nodeCount: uniqueSpanIds.size,
    toolCalls,
    llmCalls,
    errorCount,
    durationMicros,
    durationLabel: durationMicros > 0 ? formatDuration(first.timestamp, last.timestamp) : "< 1ms",
    startedAt: formatTimestamp(first.timestamp),
    finishedAt: formatTimestamp(last.timestamp),
    tokenInput,
    tokenOutput,
    totalTokens: tokenInput + tokenOutput,
    finalNodeName: last.node_name || "Unknown",
    finalEventType: last.event_type,
    checkpoints: Array.from(checkpoints),
    models: Array.from(models),
  };
}

function formatSignedNumber(delta: number): string {
  if (delta === 0) return "0";
  return `${delta > 0 ? "+" : ""}${delta}`;
}

function formatSignedDurationMicros(deltaMicros: number): string {
  if (deltaMicros === 0) return "0ms";
  const absoluteMicros = Math.abs(deltaMicros);
  const label =
    absoluteMicros < 1000
      ? `${absoluteMicros}µs`
      : absoluteMicros < 1_000_000
        ? `${(absoluteMicros / 1000).toFixed(1)}ms`
        : `${(absoluteMicros / 1_000_000).toFixed(2)}s`;
  return `${deltaMicros > 0 ? "+" : "-"}${label}`;
}

function getTerminalOutput(events: PersistedEvent[]): unknown {
  if (events.length === 0) return { $error: "No events in trace" };

  const lastState = [...events].reverse().find((event) => event.event_type === "state_snapshot" && event.payload);
  if (lastState) return lastState.payload;

  const lastResult = [...events].reverse().find(
    (event) => (event.event_type === "tool_result" || event.event_type === "llm_response") && event.payload
  );
  if (lastResult) return lastResult.payload;

  const lastEventWithPayload = [...events]
    .reverse()
    .find((event) => event.payload && typeof event.payload === "object" && Object.keys(event.payload).length > 0);

  if (lastEventWithPayload) {
    return lastEventWithPayload.payload;
  }

  return {
    status: "finished",
    message: "Trace completed with no structured terminal payload.",
  };
}

function TraceSummaryCard({
  title,
  summary,
  branch,
}: {
  title: string;
  summary: TraceExecutionSummary | null;
  branch: "primary" | "compare";
}) {
  if (!summary) {
    return (
      <section className={`compare-summary-card compare-summary-card-${branch}`}>
        <div className="compare-summary-header">
          <h3>{title}</h3>
        </div>
        <div className="compare-summary-empty">Select a trace to load this branch.</div>
      </section>
    );
  }

  return (
    <section className={`compare-summary-card compare-summary-card-${branch}`}>
      <div className="compare-summary-header">
        <h3>{title}</h3>
        <span
          className={`compare-summary-status ${
            summary.status === "Error" ? "compare-summary-status-error" : "compare-summary-status-ok"
          }`}
        >
          {summary.status}
        </span>
      </div>

      <div className="compare-summary-name-row">
        <span className="compare-summary-flow">{summary.flowName}</span>
        <span className="compare-summary-trace-id">{summary.shortId}</span>
      </div>

      <div className="compare-summary-grid-rows">
        <div className="compare-summary-row">
          <span>Events</span>
          <strong>{summary.eventCount}</strong>
        </div>
        <div className="compare-summary-row">
          <span>Nodes</span>
          <strong>{summary.nodeCount}</strong>
        </div>
        <div className="compare-summary-row">
          <span>Duration</span>
          <strong>{summary.durationLabel}</strong>
        </div>
        <div className="compare-summary-row">
          <span>Tokens (in/out)</span>
          <strong>
            {summary.tokenInput}/{summary.tokenOutput}
          </strong>
        </div>
        <div className="compare-summary-row">
          <span>LLM / Tool Calls</span>
          <strong>
            {summary.llmCalls} / {summary.toolCalls}
          </strong>
        </div>
        <div className="compare-summary-row">
          <span>Final Route</span>
          <strong>{summary.finalNodeName}</strong>
        </div>
      </div>

      <div className="compare-summary-footnote">
        <span>
          {summary.startedAt} {"->"} {summary.finishedAt}
        </span>
        <span>{summary.checkpoints.length > 0 ? summary.checkpoints.join(", ") : "No checkpoints"}</span>
        <span>{summary.models.length > 0 ? summary.models.join(", ") : "No model metadata"}</span>
      </div>
    </section>
  );
}

export default function TraceComparePanel() {
  const [showOnlyChanges, setShowOnlyChanges] = useState(true);

  const selectedTraceId = useTraceStore((s) => s.selectedTraceId);
  const compareTraceId = useTraceStore((s) => s.compareTraceId);
  const allEvents = useTraceStore((s) => s.events);

  const primaryEvents = useMemo(() => {
    if (!selectedTraceId) return [];
    return allEvents.filter((event) => event.trace_id === selectedTraceId);
  }, [allEvents, selectedTraceId]);

  const compareEvents = useMemo(() => {
    if (!compareTraceId) return [];
    return allEvents.filter((event) => event.trace_id === compareTraceId);
  }, [allEvents, compareTraceId]);

  const primaryOutput = useMemo(() => getTerminalOutput(primaryEvents), [primaryEvents]);
  const compareOutput = useMemo(() => {
    if (!compareTraceId) return null;
    return getTerminalOutput(compareEvents);
  }, [compareEvents, compareTraceId]);

  const primarySummary = useMemo(
    () => summarizeTrace(selectedTraceId, primaryEvents),
    [selectedTraceId, primaryEvents]
  );
  const compareSummary = useMemo(
    () => summarizeTrace(compareTraceId, compareEvents),
    [compareTraceId, compareEvents]
  );

  const { hydrated: primaryHydrated, isLoadingBlob: loadingPrimary } = useHydratedPayload(primaryOutput);
  const { hydrated: compareHydrated, isLoadingBlob: loadingCompare } = useHydratedPayload(compareOutput);

  const hasBothBranches = Boolean(primarySummary && compareSummary);

  const diffRows = useMemo(() => {
    if (!hasBothBranches) return [];
    return buildDiffRows(primaryHydrated, compareHydrated);
  }, [compareHydrated, hasBothBranches, primaryHydrated]);

  const visibleRows = useMemo(() => {
    const filtered = showOnlyChanges
      ? diffRows.filter((row) => row.kind !== "same")
      : diffRows;

    return filtered.slice(0, 250);
  }, [diffRows, showOnlyChanges]);

  const diffStats = useMemo(() => {
    const changed = diffRows.filter((row) => row.kind === "changed").length;
    const primaryOnly = diffRows.filter((row) => row.kind === "primary-only").length;
    const compareOnly = diffRows.filter((row) => row.kind === "compare-only").length;
    const same = diffRows.filter((row) => row.kind === "same").length;

    return { changed, primaryOnly, compareOnly, same };
  }, [diffRows]);

  const delta = useMemo(() => {
    if (!primarySummary || !compareSummary) {
      return {
        eventDelta: 0,
        tokenDelta: 0,
        durationDeltaMicros: 0,
      };
    }

    return {
      eventDelta: compareSummary.eventCount - primarySummary.eventCount,
      tokenDelta: compareSummary.totalTokens - primarySummary.totalTokens,
      durationDeltaMicros: compareSummary.durationMicros - primarySummary.durationMicros,
    };
  }, [compareSummary, primarySummary]);

  if (!selectedTraceId) {
    return (
      <div className="trace-compare-panel">
        <div className="compare-empty-state">
          <h3>No active flow selected</h3>
          <p>Choose a primary trace from the top bar to start branch analysis.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="trace-compare-panel">
      <div className="compare-header">
        <div>
          <h2>Execution Branch Compare</h2>
          <p>
            Track how one state change affects routing, latency, tokens, and terminal output across two flow runs.
          </p>
        </div>

        <div className="compare-header-actions">
          <button
            type="button"
            className="compare-toggle-button"
            onClick={() => setShowOnlyChanges((value) => !value)}
            disabled={!hasBothBranches}
          >
            {showOnlyChanges ? "Show unchanged keys" : "Show changed keys only"}
          </button>
          <span className="compare-diff-pill">
            {hasBothBranches ? `${diffStats.changed} changed keys` : "Select Branch Beta"}
          </span>
        </div>
      </div>

      <div className="compare-summary-layout">
        <TraceSummaryCard title="Branch Alpha (Primary)" summary={primarySummary} branch="primary" />

        <section className="compare-delta-card">
          <h3>Branch Delta</h3>
          <div className="compare-summary-row">
            <span>Event Count</span>
            <strong>{formatSignedNumber(delta.eventDelta)}</strong>
          </div>
          <div className="compare-summary-row">
            <span>Total Tokens</span>
            <strong>{formatSignedNumber(delta.tokenDelta)}</strong>
          </div>
          <div className="compare-summary-row">
            <span>Duration</span>
            <strong>{formatSignedDurationMicros(delta.durationDeltaMicros)}</strong>
          </div>
          <div className="compare-summary-row">
            <span>Primary Final Event</span>
            <strong>{primarySummary?.finalEventType ?? "n/a"}</strong>
          </div>
          <div className="compare-summary-row">
            <span>Compare Final Event</span>
            <strong>{compareSummary?.finalEventType ?? "n/a"}</strong>
          </div>
          <p className="compare-delta-help">
            Positive values mean Branch Beta consumed more resources or ran longer than Branch Alpha.
          </p>
        </section>

        <TraceSummaryCard title="Branch Beta (Compare)" summary={compareSummary} branch="compare" />
      </div>

      {hasBothBranches ? (
        <section className="compare-diff-section">
          <div className="compare-diff-header">
            <h3>Structured State Diff</h3>
            <span>
              {diffStats.changed} changed • {diffStats.primaryOnly} only in alpha • {diffStats.compareOnly} only in beta • {diffStats.same} unchanged
            </span>
          </div>

          <div className="compare-diff-table-wrap">
            <table className="compare-diff-table">
              <thead>
                <tr>
                  <th>JSON Path</th>
                  <th>Branch Alpha</th>
                  <th>Branch Beta</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.path} className={`compare-diff-row compare-diff-row-${row.kind}`}>
                    <td className="compare-diff-path">{row.path}</td>
                    <td>{row.primaryValue ?? "-"}</td>
                    <td>{row.compareValue ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="compare-empty-state compare-empty-state-inline">
          <h3>Pick a second branch</h3>
          <p>Select Branch Beta in the top bar to unlock side-by-side diffs and branch deltas.</p>
        </div>
      )}

      <div className="compare-columns">
        <div className="compare-col">
          <div className="compare-col-header">
            <h3>Branch Alpha Output</h3>
            <span className="trace-id">{primarySummary?.flowName ?? selectedTraceId.slice(0, 8)}</span>
          </div>
          <div className="compare-col-body">
            {loadingPrimary ? (
              <div>Loading payload...</div>
            ) : (
              <pre>{JSON.stringify(primaryHydrated ?? null, null, 2)}</pre>
            )}
          </div>
        </div>

        <div className="compare-col">
          <div className="compare-col-header">
            <h3>Branch Beta Output</h3>
            <span className="trace-id">{compareSummary?.flowName ?? "Not selected"}</span>
          </div>
          <div className="compare-col-body">
            {compareSummary ? (
              loadingCompare ? (
                <div>Loading payload...</div>
              ) : (
                <pre>{JSON.stringify(compareHydrated ?? null, null, 2)}</pre>
              )
            ) : (
              <div>Pick Branch Beta to view output.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
