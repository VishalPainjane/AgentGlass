import type { PersistedEvent } from "./eventHelpers";

const SCHEMA_VERSION = "0.1.0";

export function createDemoTraceEvents(): PersistedEvent[] {
  const traceId = "demo-trace";
  const start = Date.now() * 1000 - 8_000_000;

  const events: Array<Omit<PersistedEvent, "ingest_id" | "ingest_timestamp" | "schema_version">> = [
    {
      trace_id: traceId,
      span_id: "span-root",
      parent_span_id: null,
      event_type: "agent_start",
      node_name: "CoordinatorAgent",
      payload: { objective: "Find and summarize memory safety wins in Rust" },
      timestamp: start,
    },
    {
      trace_id: traceId,
      span_id: "span-planner",
      parent_span_id: "span-root",
      event_type: "agent_start",
      node_name: "PlannerAgent",
      payload: { task: "Break objective into retrieval and synthesis steps" },
      timestamp: start + 700_000,
    },
    {
      trace_id: traceId,
      span_id: "span-retriever",
      parent_span_id: "span-planner",
      event_type: "tool_call",
      node_name: "DocsSearch",
      payload: { query: "Rust ownership borrow checker runtime safety" },
      timestamp: start + 1_300_000,
    },
    {
      trace_id: traceId,
      span_id: "span-retriever",
      parent_span_id: "span-planner",
      event_type: "tool_result",
      node_name: "DocsSearch",
      payload: {
        hits: 3,
        top_docs: ["The Rust Book", "Rust Nomicon", "Rust By Example"],
      },
      timestamp: start + 2_100_000,
    },
    {
      trace_id: traceId,
      span_id: "span-writer",
      parent_span_id: "span-planner",
      event_type: "llm_request",
      node_name: "WriterAgent",
      payload: { model: "gpt-4o-mini", tokens_in: 612 },
      timestamp: start + 2_800_000,
    },
    {
      trace_id: traceId,
      span_id: "span-writer",
      parent_span_id: "span-planner",
      event_type: "llm_response",
      node_name: "WriterAgent",
      payload: {
        tokens_out: 248,
        summary: "Ownership and borrowing eliminate data races without a GC.",
      },
      timestamp: start + 3_900_000,
    },
    {
      trace_id: traceId,
      span_id: "span-planner",
      parent_span_id: "span-root",
      event_type: "agent_end",
      node_name: "PlannerAgent",
      payload: { status: "ok" },
      timestamp: start + 4_900_000,
    },
    {
      trace_id: traceId,
      span_id: "span-root",
      parent_span_id: null,
      event_type: "agent_end",
      node_name: "CoordinatorAgent",
      payload: { status: "completed", confidence: 0.93 },
      timestamp: start + 5_800_000,
    },
  ];

  return events.map((event, index) => ({
    ...event,
    ingest_id: `demo-${index + 1}`,
    ingest_timestamp: event.timestamp + 1_000,
    schema_version: SCHEMA_VERSION,
  }));
}
