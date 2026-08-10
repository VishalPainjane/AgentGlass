import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BLOCKED_TRACE = "eval-blocked-trace";
const SUCCESS_TRACE = "eval-success-trace";

describe("trace evaluation persistence integration", () => {
  let tempDir: string;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), "agentglass-eval-test-"));
    process.env.AGENTGLASS_DATA_DIR = tempDir;
  });

  after(async () => {
    const { closeDb } = await import("./db.js");
    closeDb();
    rmSync(tempDir, { recursive: true, force: true });
    delete process.env.AGENTGLASS_DATA_DIR;
  });

  it("Variant B blocked trace fails task_completion with deterministic explanation", async () => {
    const { insertEvent } = await import("./db.js");
    const { recomputeAndPersistSummary } = await import("./traceSummary.js");
    const { runAndPersistEvaluation } = await import("./traceEvaluation.js");

    seedBlockedTrace(insertEvent, BLOCKED_TRACE);
    recomputeAndPersistSummary(BLOCKED_TRACE);

    const evaluation = await runAndPersistEvaluation(BLOCKED_TRACE);
    assert.ok(evaluation);
    assert.equal(evaluation.passed, false);

    const task = evaluation.scores.find((s) => s.name === "task_completion");
    assert.equal(task?.value, 0);
    assert.equal(task?.passed, false);
    assert.match(task?.explanation ?? "", /BLOCKED/i);

    const loop = evaluation.scores.find((s) => s.name === "loop_detection");
    assert.equal(loop?.value, 1);
  });

  it("Variant A success trace passes task_completion", async () => {
    const { insertEvent } = await import("./db.js");
    const { recomputeAndPersistSummary } = await import("./traceSummary.js");
    const { runAndPersistEvaluation } = await import("./traceEvaluation.js");

    seedSuccessTrace(insertEvent, SUCCESS_TRACE);
    recomputeAndPersistSummary(SUCCESS_TRACE);

    const evaluation = await runAndPersistEvaluation(SUCCESS_TRACE);
    assert.ok(evaluation);

    const task = evaluation.scores.find((s) => s.name === "task_completion");
    assert.equal(task?.value, 1);
    assert.equal(task?.passed, true);

    const loop = evaluation.scores.find((s) => s.name === "loop_detection");
    assert.equal(loop?.value, 1);
  });
});

function seedBlockedTrace(
  insertEvent: (event: Record<string, unknown>) => boolean,
  traceId: string
): void {
  const events = [
    eventRow(traceId, "e1", "root", "agent_start", "LangGraph", 1),
    eventRow(traceId, "e2", "s1", "agent_start", "orchestrator", 2),
    eventRow(traceId, "e3", "s2", "tool_result", "PolicyRetriever", 3, {
      retrieval_results: [{ score: 0.108 }],
    }),
    eventRow(traceId, "e4", "s3", "llm_request", "RootCauseAnalyst", 4),
    eventRow(traceId, "e5", "s3", "llm_response", "RootCauseAnalyst", 5),
    eventRow(traceId, "e6", "s4", "agent_end", "compliance_validator", 6, {
      outputs: { validation: { approved: false, failed_checks: ["policy_evidence_strong"] } },
    }),
    eventRow(traceId, "e7", "s5", "error", "PaymentGateway", 7, { message: "blocked" }),
    eventRow(traceId, "e8", "root", "agent_end", "LangGraph", 8, {
      output: { variant: "b", validation: { approved: false } },
    }),
  ];
  for (const row of events) insertEvent(row);
}

function seedSuccessTrace(
  insertEvent: (event: Record<string, unknown>) => boolean,
  traceId: string
): void {
  const events = [
    eventRow(traceId, "e1", "root", "agent_start", "LangGraph", 1),
    eventRow(traceId, "e2", "s1", "agent_start", "orchestrator", 2),
    eventRow(traceId, "e3", "s2", "tool_result", "PolicyRetriever", 3, {
      retrieval_results: [{ score: 0.278 }],
    }),
    eventRow(traceId, "e4", "s3", "llm_request", "RootCauseAnalyst", 4),
    eventRow(traceId, "e5", "s3", "llm_response", "RootCauseAnalyst", 5),
    eventRow(traceId, "e6", "s4", "agent_end", "compliance_validator", 6, {
      outputs: { validation: { approved: true, failed_checks: [] } },
    }),
    eventRow(traceId, "e7", "s5", "agent_start", "response_composer", 7),
    eventRow(traceId, "e8", "root", "agent_end", "LangGraph", 8, {
      output: { variant: "a", validation: { approved: true } },
    }),
  ];
  for (const row of events) insertEvent(row);
}

function eventRow(
  traceId: string,
  ingestId: string,
  spanId: string,
  eventType: string,
  nodeName: string,
  timestamp: number,
  payload: Record<string, unknown> = {}
) {
  return {
    ingest_id: `${traceId}-${ingestId}`,
    trace_id: traceId,
    span_id: spanId,
    parent_span_id: spanId === "root" ? null : "root",
    event_type: eventType,
    node_name: nodeName,
    payload: JSON.stringify(payload),
    timestamp,
    ingest_timestamp: timestamp,
    schema_version: "0.1.0",
  };
}
