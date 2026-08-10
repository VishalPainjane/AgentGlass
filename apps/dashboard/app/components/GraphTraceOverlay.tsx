/**
 * GraphTraceOverlay — compact trace status chip on the graph canvas.
 * Keeps the graph as the hero; summary details live in Compare / Node Inspector.
 */

"use client";

import Link from "next/link";
import { useSelectedTraceSummary } from "../hooks/useTraceStore";

export default function GraphTraceOverlay() {
  const summary = useSelectedTraceSummary();
  if (!summary) return null;

  const status = summary.status.toUpperCase();
  const retrieval =
    summary.top_retrieval_score !== undefined
      ? summary.top_retrieval_score.toFixed(3)
      : null;

  return (
    <div className="graph-trace-overlay" aria-label="Trace status">
      {summary.variant && (
        <span className="graph-trace-overlay-pill graph-trace-overlay-variant">
          Variant {summary.variant.toUpperCase()}
        </span>
      )}
      <span
        className={`graph-trace-overlay-pill graph-trace-overlay-status graph-trace-overlay-status-${summary.status}`}
      >
        {status}
      </span>
      {retrieval !== null && (
        <span className="graph-trace-overlay-pill">Retrieval {retrieval}</span>
      )}
      {summary.validator_outcome && (
        <span className="graph-trace-overlay-pill">
          Validator {summary.validator_outcome === "passed" ? "PASS" : "FAIL"}
        </span>
      )}
      <span className="graph-trace-overlay-pill graph-trace-overlay-muted">
        {summary.llm_call_count} LLM · {summary.node_count} nodes
      </span>
      <Link href="/compare" className="graph-trace-overlay-pill graph-trace-overlay-link">
        Evaluation on Compare →
      </Link>
    </div>
  );
}
