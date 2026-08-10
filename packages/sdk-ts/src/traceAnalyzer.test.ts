import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PersistedEvent } from "./schema";
import { analyzeTrace, dedupeEvents } from "./traceAnalyzer";

const TRACE_ID = "test-trace-001";

function baseEvent(overrides: Partial<PersistedEvent> & Pick<PersistedEvent, "event_type" | "span_id">): PersistedEvent {
  return {
    ingest_id: overrides.ingest_id ?? `ingest-${overrides.span_id}-${overrides.event_type}`,
    trace_id: TRACE_ID,
    span_id: overrides.span_id,
    parent_span_id: overrides.parent_span_id ?? null,
    event_type: overrides.event_type,
    node_name: overrides.node_name ?? "",
    payload: overrides.payload ?? {},
    timestamp: overrides.timestamp ?? 1_000_000,
    ingest_timestamp: overrides.ingest_timestamp ?? 1_000_000,
    schema_version: "0.1.0",
    ...overrides,
  };
}

describe("dedupeEvents", () => {
  it("does not double-count duplicate ingest_ids", () => {
    const event = baseEvent({ event_type: "llm_request", span_id: "s1", ingest_id: "dup-1" });
    const deduped = dedupeEvents([event, { ...event }, event]);
    assert.equal(deduped.length, 1);
  });
});

describe("analyzeTrace", () => {
  it("Test 1 — successful trace", () => {
    const events: PersistedEvent[] = [
      baseEvent({ event_type: "agent_start", span_id: "root", node_name: "LangGraph", timestamp: 1 }),
      baseEvent({ event_type: "agent_start", span_id: "s1", node_name: "orchestrator", timestamp: 2 }),
      baseEvent({ event_type: "agent_end", span_id: "s1", timestamp: 3, payload: { outputs: {} } }),
      baseEvent({
        event_type: "tool_result",
        span_id: "s2",
        node_name: "PolicyRetriever",
        timestamp: 4,
        payload: {
          retrieval_results: [{ score: 0.278, text: "policy" }],
        },
      }),
      baseEvent({ event_type: "llm_request", span_id: "s3", timestamp: 5, payload: { provider: "ollama:llama3.2:1b" } }),
      baseEvent({ event_type: "llm_response", span_id: "s3", timestamp: 6, payload: {} }),
      baseEvent({
        event_type: "agent_end",
        span_id: "s4",
        node_name: "compliance_validator",
        timestamp: 7,
        payload: {
          outputs: {
            validation: { approved: true, failed_checks: [] },
          },
        },
      }),
      baseEvent({ event_type: "agent_start", span_id: "s5", node_name: "response_composer", timestamp: 8 }),
      baseEvent({ event_type: "agent_end", span_id: "root", node_name: "LangGraph", timestamp: 9 }),
    ];

    const summary = analyzeTrace(TRACE_ID, events);
    assert.ok(summary);
    assert.equal(summary.status, "success");
    assert.equal(summary.validator_outcome, "passed");
    assert.equal(summary.llm_call_count, 1);
  });

  it("Test 2 — blocked trace (Variant B structure)", () => {
    const events: PersistedEvent[] = [
      baseEvent({ event_type: "agent_start", span_id: "root", node_name: "LangGraph", timestamp: 1 }),
      baseEvent({ event_type: "agent_start", span_id: "s1", node_name: "orchestrator", timestamp: 2 }),
      baseEvent({
        event_type: "tool_result",
        span_id: "s2",
        node_name: "PolicyRetriever",
        timestamp: 3,
        payload: {
          retrieval_results: [{ score: 0.108, text: "faq" }],
        },
      }),
      baseEvent({ event_type: "llm_request", span_id: "s3", timestamp: 4, payload: { provider: "ollama:llama3.2:1b" } }),
      baseEvent({ event_type: "llm_response", span_id: "s3", timestamp: 5 }),
      baseEvent({
        event_type: "agent_end",
        span_id: "s4",
        node_name: "compliance_validator",
        timestamp: 6,
        payload: {
          outputs: {
            validation: {
              approved: false,
              failed_checks: ["policy_evidence_strong"],
              top_retrieval_score: 0.108,
            },
          },
        },
      }),
      baseEvent({ event_type: "agent_start", span_id: "s5", node_name: "compliance_blocked", timestamp: 7 }),
      baseEvent({
        event_type: "error",
        span_id: "s5",
        node_name: "PaymentGateway",
        timestamp: 8,
        payload: { type: "ComplianceBlocked" },
      }),
      baseEvent({ event_type: "agent_end", span_id: "root", node_name: "LangGraph", timestamp: 9 }),
    ];

    const summary = analyzeTrace(TRACE_ID, events);
    assert.ok(summary);
    assert.equal(summary.status, "blocked");
    assert.equal(summary.top_retrieval_score, 0.108);
    assert.equal(summary.validator_outcome, "failed");
    assert.ok(summary.failure_reasons?.includes("policy_evidence_strong"));
    assert.equal(summary.failure_node, "ComplianceValidator");
    assert.equal(summary.human_review_required, true);
  });

  it("Test 3 — runtime error", () => {
    const events: PersistedEvent[] = [
      baseEvent({ event_type: "agent_start", span_id: "root", node_name: "LangGraph", timestamp: 1 }),
      baseEvent({ event_type: "agent_start", span_id: "s1", node_name: "orchestrator", timestamp: 2 }),
      baseEvent({
        event_type: "error",
        span_id: "s1",
        node_name: "orchestrator",
        timestamp: 3,
        payload: { message: "crash" },
      }),
    ];

    const summary = analyzeTrace(TRACE_ID, events);
    assert.ok(summary);
    assert.equal(summary.status, "error");
    assert.equal(summary.error_count, 1);
  });

  it("Test 4 — running trace", () => {
    const events: PersistedEvent[] = [
      baseEvent({ event_type: "agent_start", span_id: "root", node_name: "LangGraph", timestamp: 1 }),
      baseEvent({ event_type: "agent_start", span_id: "s1", node_name: "orchestrator", timestamp: 2 }),
    ];

    const summary = analyzeTrace(TRACE_ID, events);
    assert.ok(summary);
    assert.equal(summary.status, "running");
  });

  it("Test 5 — duplicate events do not inflate counts", () => {
    const llmRequest = baseEvent({
      event_type: "llm_request",
      span_id: "s3",
      ingest_id: "same-id",
      timestamp: 5,
    });
    const llmResponse = baseEvent({
      event_type: "llm_response",
      span_id: "s3",
      ingest_id: "same-id-2",
      timestamp: 6,
    });

    const events = [
      baseEvent({ event_type: "agent_start", span_id: "root", node_name: "LangGraph", timestamp: 1 }),
      llmRequest,
      { ...llmRequest },
      llmResponse,
      { ...llmResponse },
    ];

    const summary = analyzeTrace(TRACE_ID, events);
    assert.ok(summary);
    assert.equal(summary.llm_call_count, 1);
  });

  it("Test 6 — missing retrieval score stays undefined", () => {
    const events: PersistedEvent[] = [
      baseEvent({ event_type: "agent_start", span_id: "root", node_name: "LangGraph", timestamp: 1 }),
      baseEvent({ event_type: "agent_end", span_id: "root", node_name: "LangGraph", timestamp: 2 }),
    ];

    const summary = analyzeTrace(TRACE_ID, events);
    assert.ok(summary);
    assert.equal(summary.top_retrieval_score, undefined);
  });

  it("Test 7 — blocked takes precedence over error event", () => {
    const events: PersistedEvent[] = [
      baseEvent({ event_type: "agent_start", span_id: "root", node_name: "LangGraph", timestamp: 1 }),
      baseEvent({
        event_type: "agent_end",
        span_id: "s4",
        timestamp: 2,
        payload: {
          outputs: { validation: { approved: false, failed_checks: ["policy_evidence_strong"] } },
        },
      }),
      baseEvent({ event_type: "agent_start", span_id: "s5", node_name: "compliance_blocked", timestamp: 3 }),
      baseEvent({ event_type: "error", span_id: "s5", node_name: "PaymentGateway", timestamp: 4 }),
    ];

    const summary = analyzeTrace(TRACE_ID, events);
    assert.ok(summary);
    assert.equal(summary.status, "blocked");
    assert.notEqual(summary.status, "error");
  });
});
