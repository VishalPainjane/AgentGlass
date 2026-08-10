/**
 * Deterministic debugging narrative from TraceSummary — no LLM required.
 */

import type { TraceSummary } from "./schema";

export interface DebuggingNarrative {
  headline: string;
  status: "success" | "blocked" | "error" | "running" | "unknown";
  likelyUpstreamSignal?: string;
  failureNode?: string;
  failedChecks?: string[];
  downstreamEffect?: string;
  humanReviewRequired: boolean;
  causalChain?: string;
}

export function buildDebuggingNarrative(summary: TraceSummary): DebuggingNarrative | null {
  if (summary.status === "success") {
    return {
      headline: "Execution completed successfully",
      status: "success",
      humanReviewRequired: false,
    };
  }

  if (summary.status === "running") {
    return {
      headline: "Execution still in progress",
      status: "running",
      humanReviewRequired: false,
    };
  }

  if (summary.status !== "blocked" && summary.status !== "error") {
    return null;
  }

  const narrative: DebuggingNarrative = {
    headline:
      summary.status === "blocked" ? "Execution blocked" : "Execution ended with error",
    status: summary.status,
    humanReviewRequired: summary.human_review_required ?? summary.status === "blocked",
  };

  if (summary.top_retrieval_score !== undefined) {
    narrative.likelyUpstreamSignal = `Retrieval score ${summary.top_retrieval_score.toFixed(3)}`;
  }

  if (summary.failure_node) {
    narrative.failureNode = summary.failure_node;
  }

  if (summary.failure_reasons && summary.failure_reasons.length > 0) {
    narrative.failedChecks = summary.failure_reasons;
  }

  if (summary.status === "blocked") {
    narrative.downstreamEffect = "PaymentGateway blocked";
  }

  const parts: string[] = [];
  if (summary.top_retrieval_score !== undefined && summary.top_retrieval_score < 0.15) {
    parts.push("Weak retrieval evidence");
  }
  if (summary.validator_outcome === "failed") {
    parts.push("ComplianceValidator rejected evidence");
  }
  if (summary.status === "blocked") {
    parts.push("PaymentGateway was blocked");
  }
  if (parts.length > 0) {
    narrative.causalChain = parts.join(" → ");
  }

  return narrative;
}
