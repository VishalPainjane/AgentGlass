import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TRACE_ID = "blocked-variant-b-test";

describe("trace summary persistence integration", () => {
  let tempDir: string;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), "agentglass-daemon-test-"));
    process.env.AGENTGLASS_DATA_DIR = tempDir;
  });

  after(async () => {
    const { closeDb } = await import("./db.js");
    closeDb();
    rmSync(tempDir, { recursive: true, force: true });
    delete process.env.AGENTGLASS_DATA_DIR;
  });

  it("ingest → persist → compute summary → GET trace returns blocked variant fields", async () => {
    const { insertEvent, getEventsByTrace } = await import("./db.js");
    const { recomputeAndPersistSummary, getStoredSummary } = await import("./traceSummary.js");

    const events = [
      {
        ingest_id: "e1",
        trace_id: TRACE_ID,
        span_id: "root",
        parent_span_id: null,
        event_type: "agent_start",
        node_name: "LangGraph",
        payload: "{}",
        timestamp: 1,
        ingest_timestamp: 1,
        schema_version: "0.1.0",
      },
      {
        ingest_id: "e2",
        trace_id: TRACE_ID,
        span_id: "s2",
        parent_span_id: "root",
        event_type: "tool_result",
        node_name: "PolicyRetriever",
        payload: JSON.stringify({
          retrieval_results: [{ score: 0.108, text: "weak policy" }],
        }),
        timestamp: 2,
        ingest_timestamp: 2,
        schema_version: "0.1.0",
      },
      {
        ingest_id: "e3",
        trace_id: TRACE_ID,
        span_id: "s3",
        parent_span_id: "root",
        event_type: "llm_request",
        node_name: "RootCauseAnalyst",
        payload: JSON.stringify({ provider: "ollama", model: "llama3.2:1b" }),
        timestamp: 3,
        ingest_timestamp: 3,
        schema_version: "0.1.0",
      },
      {
        ingest_id: "e4",
        trace_id: TRACE_ID,
        span_id: "s3",
        parent_span_id: "root",
        event_type: "llm_response",
        node_name: "RootCauseAnalyst",
        payload: "{}",
        timestamp: 4,
        ingest_timestamp: 4,
        schema_version: "0.1.0",
      },
      {
        ingest_id: "e5",
        trace_id: TRACE_ID,
        span_id: "s4",
        parent_span_id: "root",
        event_type: "agent_end",
        node_name: "compliance_validator",
        payload: JSON.stringify({
          outputs: {
            validation: {
              approved: false,
              failed_checks: ["policy_evidence_strong"],
            },
          },
        }),
        timestamp: 5,
        ingest_timestamp: 5,
        schema_version: "0.1.0",
      },
      {
        ingest_id: "e6",
        trace_id: TRACE_ID,
        span_id: "s5",
        parent_span_id: "root",
        event_type: "error",
        node_name: "PaymentGateway",
        payload: JSON.stringify({ message: "compliance_blocked" }),
        timestamp: 6,
        ingest_timestamp: 6,
        schema_version: "0.1.0",
      },
      {
        ingest_id: "e7",
        trace_id: TRACE_ID,
        span_id: "root",
        parent_span_id: null,
        event_type: "agent_end",
        node_name: "LangGraph",
        payload: JSON.stringify({
          output: {
            variant: "b",
            validation: {
              approved: false,
              failed_checks: ["policy_evidence_strong"],
              top_retrieval_score: 0.108,
            },
          },
        }),
        timestamp: 7,
        ingest_timestamp: 7,
        schema_version: "0.1.0",
      },
    ];

    for (const event of events) {
      const inserted = insertEvent(event);
      assert.equal(inserted, true);
    }

    assert.equal(getEventsByTrace(TRACE_ID).length, 7);

    const summary = recomputeAndPersistSummary(TRACE_ID);
    assert.ok(summary);
    assert.equal(summary.status, "blocked");
    assert.equal(summary.top_retrieval_score, 0.108);
    assert.equal(summary.validator_outcome, "failed");
    assert.ok(summary.failure_node);
    assert.ok(summary.failure_reasons?.includes("policy_evidence_strong"));

    const stored = getStoredSummary(TRACE_ID);
    assert.ok(stored);
    assert.equal(stored.status, "blocked");
    assert.equal(stored.top_retrieval_score, 0.108);
  });
});
