import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PersistedEvent, TraceSummary } from "../schema";
import { evaluateTrace, computeOverallScore } from "./evaluateTrace";
import { taskCompletionEvaluator } from "./evaluators/taskCompletion";
import { createToolEfficiencyEvaluator } from "./evaluators/toolEfficiency";
import {
  loopDetectionEvaluator,
  extractLogicalSteps,
  findRepeatedCycle,
} from "./evaluators/loopDetection";

const TRACE_ID = "eval-test-trace";

function summary(overrides: Partial<TraceSummary> = {}): TraceSummary {
  return {
    trace_id: TRACE_ID,
    status: "success",
    node_count: 5,
    llm_call_count: 1,
    tool_call_count: 0,
    retrieval_call_count: 1,
    error_count: 0,
    updated_at: 10_000,
    ...overrides,
  };
}

function event(
  overrides: Partial<PersistedEvent> & Pick<PersistedEvent, "event_type" | "span_id">
): PersistedEvent {
  return {
    ingest_id: overrides.ingest_id ?? `ing-${overrides.span_id}`,
    trace_id: TRACE_ID,
    span_id: overrides.span_id,
    parent_span_id: overrides.parent_span_id ?? null,
    event_type: overrides.event_type,
    node_name: overrides.node_name ?? "",
    payload: overrides.payload ?? {},
    timestamp: overrides.timestamp ?? 1,
    ingest_timestamp: overrides.ingest_timestamp ?? 1,
    schema_version: "0.1.0",
    ...overrides,
  };
}

describe("task_completion evaluator", () => {
  it("success → 1", () => {
    const score = taskCompletionEvaluator.evaluate(summary({ status: "success" }), []);
    assert.equal(score.available, true);
    assert.equal(score.value, 1);
    assert.equal(score.passed, true);
  });

  it("blocked → 0", () => {
    const score = taskCompletionEvaluator.evaluate(summary({ status: "blocked" }), []);
    assert.equal(score.value, 0);
    assert.equal(score.passed, false);
    assert.match(score.explanation ?? "", /blocked/i);
  });

  it("error → 0", () => {
    const score = taskCompletionEvaluator.evaluate(summary({ status: "error" }), []);
    assert.equal(score.value, 0);
    assert.equal(score.passed, false);
  });

  it("running → unavailable", () => {
    const score = taskCompletionEvaluator.evaluate(summary({ status: "running" }), []);
    assert.equal(score.available, false);
    assert.equal(score.value, undefined);
  });

  it("unknown → unavailable", () => {
    const score = taskCompletionEvaluator.evaluate(summary({ status: "unknown" }), []);
    assert.equal(score.available, false);
  });
});

describe("tool_efficiency evaluator", () => {
  const evaluator = createToolEfficiencyEvaluator({ baselineToolActivity: 2 });

  it("baseline met → 1.0", () => {
    const score = evaluator.evaluate(
      summary({ tool_call_count: 0, retrieval_call_count: 2 }),
      []
    );
    assert.equal(score.value, 1);
    assert.equal(score.passed, true);
  });

  it("under baseline → 1.0", () => {
    const score = evaluator.evaluate(
      summary({ tool_call_count: 0, retrieval_call_count: 1 }),
      []
    );
    assert.equal(score.value, 1);
  });

  it("baseline exceeded → penalized", () => {
    const score = evaluator.evaluate(
      summary({ tool_call_count: 2, retrieval_call_count: 2 }),
      []
    );
    assert.equal(score.value, 0);
    assert.equal(score.passed, false);
  });

  it("no baseline → unavailable", () => {
    const noBaseline = createToolEfficiencyEvaluator({ baselineToolActivity: 0 });
    const score = noBaseline.evaluate(summary(), []);
    assert.equal(score.available, false);
  });

  it("running → unavailable", () => {
    const score = evaluator.evaluate(summary({ status: "running" }), []);
    assert.equal(score.available, false);
  });
});

describe("loop_detection evaluator", () => {
  it("A B C D → no loop", () => {
    const steps = ["a", "b", "c", "d"];
    assert.equal(findRepeatedCycle(steps), null);
    const score = loopDetectionEvaluator.evaluate(summary(), stepsToEvents(steps));
    assert.equal(score.value, 1);
    assert.equal(score.passed, true);
  });

  it("A B A B A B → loop", () => {
    const steps = ["a", "b", "a", "b", "a", "b"];
    assert.ok(findRepeatedCycle(steps));
    const score = loopDetectionEvaluator.evaluate(summary(), stepsToEvents(steps));
    assert.equal(score.value, 0);
    assert.equal(score.passed, false);
  });

  it("A B C B C B → loop (length-2 cycle B→C)", () => {
    const steps = ["a", "b", "c", "b", "c", "b", "c"];
    assert.ok(findRepeatedCycle(steps));
  });

  it("A B B → not a loop", () => {
    const steps = ["a", "b", "b"];
    assert.equal(findRepeatedCycle(steps), null);
  });

  it("A B C A B C → not a loop (only 2 repeats)", () => {
    const steps = ["a", "b", "c", "a", "b", "c"];
    assert.equal(findRepeatedCycle(steps), null);
  });
});

describe("evaluateTrace overall", () => {
  it("averages only available scores", () => {
    const scores = [
      { evaluator: "a:v1", name: "a", available: true, value: 1, passed: true },
      { evaluator: "b:v1", name: "b", available: false },
      { evaluator: "c:v1", name: "c", available: true, value: 0.8, passed: true },
    ];
    assert.equal(computeOverallScore(scores), 0.9);
  });

  it("Variant B blocked trace fails task completion", () => {
    const result = evaluateTrace(
      summary({ status: "blocked", validator_outcome: "failed" }),
      []
    );
    const task = result.scores.find((s) => s.name === "task_completion");
    assert.equal(task?.value, 0);
    assert.equal(result.passed, false);
  });
});

function stepsToEvents(steps: string[]): PersistedEvent[] {
  return steps.map((step, i) =>
    event({
      event_type: "agent_start",
      span_id: `s${i}`,
      node_name: step,
      timestamp: i + 1,
    })
  );
}

describe("extractLogicalSteps", () => {
  it("ignores LangGraph root", () => {
    const events = [
      event({ event_type: "agent_start", span_id: "root", node_name: "LangGraph" }),
      event({ event_type: "agent_start", span_id: "s1", node_name: "orchestrator" }),
    ];
    assert.deepEqual(extractLogicalSteps(events), ["orchestrator"]);
  });
});
