/**
 * Event helper utilities
 *
 * Derives React Flow nodes and edges from the raw event stream,
 * and provides formatting helpers for the dashboard UI.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface PersistedEvent {
  id?: number;
  ingest_id: string;
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  event_type: string;
  node_name: string;
  payload: Record<string, unknown>;
  timestamp: number;
  ingest_timestamp: number;
  schema_version: string;
}

export interface TraceMetadata {
  trace_id: string;
  event_count: number;
  first_timestamp: number;
  last_timestamp: number;
  has_error: boolean;
}

export type NodeStatus = "running" | "completed" | "error" | "idle";

export interface GraphNode {
  spanId: string;
  parentSpanId: string | null;
  nodeName: string;
  status: NodeStatus;
  eventCount: number;
  events: PersistedEvent[];
  firstTimestamp: number;
  lastTimestamp: number;
}

export interface GraphEdge {
  source: string; // parent span_id
  target: string; // child span_id
}

/* ------------------------------------------------------------------ */
/*  Node derivation                                                   */
/* ------------------------------------------------------------------ */

export function deriveNodesFromEvents(events: PersistedEvent[]): Map<string, GraphNode> {
  const nodes = new Map<string, GraphNode>();

  for (const event of events) {
    const existing = nodes.get(event.span_id);

    if (existing) {
      existing.events.push(event);
      existing.eventCount++;
      existing.lastTimestamp = Math.max(existing.lastTimestamp, event.timestamp);

      // Update status based on latest event
      if (event.event_type === "error") {
        existing.status = "error";
      } else if (event.event_type === "agent_end") {
        if (existing.status !== "error") existing.status = "completed";
      } else if (
        event.event_type === "agent_start" &&
        existing.status !== "error" &&
        existing.status !== "completed"
      ) {
        existing.status = "running";
      }

      // Update name if we didn't have one
      if (!existing.nodeName && event.node_name) {
        existing.nodeName = event.node_name;
      }
    } else {
      let status: NodeStatus = "idle";
      if (event.event_type === "error") status = "error";
      else if (event.event_type === "agent_start") status = "running";
      else if (event.event_type === "agent_end") status = "completed";

      nodes.set(event.span_id, {
        spanId: event.span_id,
        parentSpanId: event.parent_span_id,
        nodeName: event.node_name || event.span_id.slice(0, 8),
        status,
        eventCount: 1,
        events: [event],
        firstTimestamp: event.timestamp,
        lastTimestamp: event.timestamp,
      });
    }
  }

  return nodes;
}

/* ------------------------------------------------------------------ */
/*  Edge derivation                                                   */
/* ------------------------------------------------------------------ */

export function deriveEdgesFromEvents(events: PersistedEvent[]): GraphEdge[] {
  const edgeSet = new Set<string>();
  const edges: GraphEdge[] = [];

  for (const event of events) {
    if (event.parent_span_id) {
      const key = `${event.parent_span_id}->${event.span_id}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push({
          source: event.parent_span_id,
          target: event.span_id,
        });
      }
    }
  }

  return edges;
}

/* ------------------------------------------------------------------ */
/*  Payload helpers                                                   */
/* ------------------------------------------------------------------ */

export function getNodePayloads(node: GraphNode): {
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
} {
  const startEvent = node.events.find((e) => e.event_type === "agent_start");
  const endEvent = node.events.find((e) => e.event_type === "agent_end");
  const errorEvent = node.events.find((e) => e.event_type === "error");

  return {
    input: startEvent?.payload ?? null,
    output: errorEvent?.payload ?? endEvent?.payload ?? null,
  };
}

/* ------------------------------------------------------------------ */
/*  Formatting                                                        */
/* ------------------------------------------------------------------ */

export function formatTimestamp(microseconds: number): string {
  const date = new Date(microseconds / 1000);
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

export function formatRelativeTime(microseconds: number): string {
  const now = Date.now() * 1000;
  const diff = now - microseconds;
  const seconds = Math.floor(diff / 1_000_000);

  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function formatDuration(startMicros: number, endMicros: number): string {
  const diff = endMicros - startMicros;
  if (diff < 1000) return `${diff}µs`;
  if (diff < 1_000_000) return `${(diff / 1000).toFixed(1)}ms`;
  return `${(diff / 1_000_000).toFixed(2)}s`;
}

export function getEventTypeColor(eventType: string): string {
  switch (eventType) {
    case "agent_start":
      return "#7cd8be";
    case "agent_end":
      return "#4ade80";
    case "tool_call":
      return "#fbbf24";
    case "tool_result":
      return "#f59e0b";
    case "llm_request":
      return "#818cf8";
    case "llm_response":
      return "#a78bfa";
    case "llm_stream":
      return "#c4b5fd";
    case "state_snapshot":
      return "#67e8f9";
    case "error":
      return "#f87171";
    default:
      return "#94a3b8";
  }
}

export function getStatusColor(status: NodeStatus): string {
  switch (status) {
    case "running":
      return "#7cd8be";
    case "completed":
      return "#4ade80";
    case "error":
      return "#f87171";
    case "idle":
      return "#94a3b8";
  }
}
