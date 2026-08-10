/**
 * Trace summary service — recompute canonical summaries from persisted events.
 */

import { analyzeTrace } from "@agentglass/sdk-ts";
import type { PersistedEvent, TraceSummary } from "@agentglass/sdk-ts";
import {
  getEventsByTrace,
  upsertTraceSummary,
  getTraceSummary,
  type PersistedEventRow,
} from "./db";

export function rowToPersistedEvent(row: PersistedEventRow): PersistedEvent {
  let payload: Record<string, unknown> = {};
  try {
    payload =
      typeof row.payload === "string" ? JSON.parse(row.payload) : (row.payload as Record<string, unknown>);
  } catch {
    payload = {};
  }

  return {
    ingest_id: row.ingest_id,
    trace_id: row.trace_id,
    span_id: row.span_id,
    parent_span_id: row.parent_span_id,
    event_type: row.event_type,
    node_name: row.node_name,
    payload,
    timestamp: row.timestamp,
    ingest_timestamp: row.ingest_timestamp,
    schema_version: row.schema_version,
  };
}

export function parseStoredSummary(row: { summary_json: string }): TraceSummary {
  return JSON.parse(row.summary_json) as TraceSummary;
}

export function recomputeAndPersistSummary(traceId: string): TraceSummary | null {
  const events = getEventsByTrace(traceId).map(rowToPersistedEvent);
  const summary = analyzeTrace(traceId, events);
  if (!summary) return null;

  upsertTraceSummary(traceId, JSON.stringify(summary), summary.updated_at);
  return summary;
}

export function getStoredSummary(traceId: string): TraceSummary | null {
  const row = getTraceSummary(traceId);
  if (!row) return null;
  try {
    return parseStoredSummary(row);
  } catch {
    return null;
  }
}

export function recomputeSummariesForTraces(traceIds: Iterable<string>): TraceSummary[] {
  const summaries: TraceSummary[] = [];
  for (const traceId of traceIds) {
    const summary = recomputeAndPersistSummary(traceId);
    if (summary) summaries.push(summary);
  }
  return summaries;
}
