import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDebuggingNarrative } from "./debuggingNarrative.js";
import type { TraceSummary } from "./schema.js";

function summary(overrides: Partial<TraceSummary>): TraceSummary {
  return {
    trace_id: "t1",
    status: "blocked",
    node_count: 5,
    llm_call_count: 1,
    tool_call_count: 0,
    retrieval_call_count: 1,
    error_count: 0,
    updated_at: 1,
    ...overrides,
  };
}

describe("buildDebuggingNarrative", () => {
  it("blocked trace with weak retrieval produces causal chain", () => {
    const narrative = buildDebuggingNarrative(
      summary({
        top_retrieval_score: 0.108,
        validator_outcome: "failed",
        failure_reasons: ["policy_evidence_strong"],
        human_review_required: true,
      })
    );

    assert.ok(narrative);
    assert.equal(narrative?.status, "blocked");
    assert.match(narrative?.causalChain ?? "", /Weak retrieval evidence/);
    assert.match(narrative?.causalChain ?? "", /PaymentGateway was blocked/);
  });

  it("success trace returns success headline", () => {
    const narrative = buildDebuggingNarrative(summary({ status: "success" }));
    assert.equal(narrative?.headline, "Execution completed successfully");
  });
});
