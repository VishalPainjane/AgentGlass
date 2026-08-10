/**
 * TraceSummaryPanel — Concise execution overview from canonical persisted summary.
 */

"use client";

import { useMemo } from "react";
import { useSelectedTraceEvents, useSelectedTraceSummary } from "../hooks/useTraceStore";
import { formatDuration } from "../lib/eventHelpers";
import { summarizeLlmCalls } from "../lib/traceAnalysis";
import { buildDebuggingNarrative } from "@agentglass/sdk-ts/browser";

function statusIcon(status: string): string {
  switch (status.toUpperCase()) {
    case "SUCCESS":
      return "✅";
    case "BLOCKED":
      return "❌";
    case "ERROR":
      return "⚠️";
    default:
      return "⏳";
  }
}

function statusLabel(status: string): string {
  return status.toUpperCase();
}

function unavailable(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "not captured";
  return String(value);
}

export default function TraceSummaryPanel() {
  const summary = useSelectedTraceSummary();
  const events = useSelectedTraceEvents();

  const llmCalls = useMemo(() => summarizeLlmCalls(events), [events]);
  const debugging = useMemo(
    () => (summary ? buildDebuggingNarrative(summary) : null),
    [summary]
  );

  if (!summary) return null;

  const durationLabel =
    summary.duration_micros !== undefined && summary.duration_micros > 0
      ? formatDuration(summary.updated_at - summary.duration_micros, summary.updated_at)
      : "< 1ms";

  const showFailure =
    summary.status === "blocked" ||
    summary.status === "error" ||
    summary.validator_outcome === "failed";

  return (
    <section className="trace-summary-panel" aria-label="Trace summary">
      <div className="trace-summary-header">
        <h3>Trace Summary</h3>
        {summary.variant && (
          <span className="trace-summary-variant">Variant {summary.variant.toUpperCase()}</span>
        )}
      </div>

      <div className="trace-summary-grid">
        <div className="trace-summary-stat">
          <span className="trace-summary-label">Status</span>
          <strong className={`trace-summary-status trace-summary-status-${summary.status}`}>
            {statusIcon(summary.status)} {statusLabel(summary.status)}
          </strong>
        </div>
        <div className="trace-summary-stat">
          <span className="trace-summary-label">Duration</span>
          <strong>{durationLabel}</strong>
        </div>
        <div className="trace-summary-stat">
          <span className="trace-summary-label">Nodes</span>
          <strong>{summary.node_count}</strong>
        </div>
        <div className="trace-summary-stat">
          <span className="trace-summary-label">LLM Calls</span>
          <strong>{summary.llm_call_count}</strong>
        </div>
        <div className="trace-summary-stat">
          <span className="trace-summary-label">Retrieval</span>
          <strong>{summary.retrieval_call_count}</strong>
        </div>
        <div className="trace-summary-stat">
          <span className="trace-summary-label">Provider</span>
          <strong>{unavailable(summary.llm_providers?.[0])}</strong>
        </div>
      </div>

      {summary.pipeline_nodes && summary.pipeline_nodes.length > 0 && (
        <div className="trace-summary-pipeline">
          <span className="trace-summary-label">Pipeline</span>
          <div className="trace-summary-pipeline-nodes">
            {summary.pipeline_nodes.map((node, i) => (
              <span key={node} className="trace-summary-pipeline-node">
                {i > 0 && <span className="trace-summary-pipeline-arrow">→</span>}
                {node}
              </span>
            ))}
          </div>
        </div>
      )}

      {debugging && debugging.status !== "success" && (
        <div className="trace-summary-debugging">
          <h4>Debugging Summary</h4>
          <p className="trace-summary-debugging-headline">
            {debugging.status === "blocked" ? "❌" : "⚠️"} {debugging.headline}
          </p>
          {debugging.likelyUpstreamSignal && (
            <p>
              <span className="trace-summary-label">Likely upstream signal</span>
              <strong>{debugging.likelyUpstreamSignal}</strong>
            </p>
          )}
          {debugging.failureNode && (
            <p>
              <span className="trace-summary-label">Failure</span>
              <strong>{debugging.failureNode}</strong>
            </p>
          )}
          {debugging.failedChecks && debugging.failedChecks.length > 0 && (
            <p>
              <span className="trace-summary-label">Failed check</span>
              <strong>{debugging.failedChecks.join(", ")}</strong>
            </p>
          )}
          {debugging.downstreamEffect && (
            <p>
              <span className="trace-summary-label">Downstream effect</span>
              <strong>{debugging.downstreamEffect}</strong>
            </p>
          )}
          <p>
            <span className="trace-summary-label">Human review</span>
            <strong>{debugging.humanReviewRequired ? "Required" : "No"}</strong>
          </p>
          {debugging.causalChain && (
            <p className="trace-summary-causal-hint">{debugging.causalChain}</p>
          )}
        </div>
      )}

      {showFailure && (
        <div className="trace-summary-failure">
          <h4>Failure Analysis</h4>
          <div className="trace-summary-failure-grid">
            <div>
              <span className="trace-summary-label">Failure node</span>
              <strong>{unavailable(summary.failure_node)}</strong>
            </div>
            <div>
              <span className="trace-summary-label">Reason</span>
              <strong>
                {summary.failure_reasons && summary.failure_reasons.length > 0
                  ? summary.failure_reasons.join(", ")
                  : "not captured"}
              </strong>
            </div>
            <div>
              <span className="trace-summary-label">Top retrieval</span>
              <strong>
                {summary.top_retrieval_score !== undefined
                  ? summary.top_retrieval_score.toFixed(3)
                  : "not captured"}
              </strong>
            </div>
            <div>
              <span className="trace-summary-label">Validator</span>
              <strong>
                {summary.validator_outcome === "passed"
                  ? "PASS"
                  : summary.validator_outcome === "failed"
                    ? "FAIL"
                    : "not captured"}
              </strong>
            </div>
          </div>
        </div>
      )}

      {llmCalls.length > 0 && (
        <div className="trace-summary-llm">
          <h4>LLM Telemetry</h4>
          {llmCalls.map((call, i) => (
            <div key={call.spanId} className="trace-summary-llm-row">
              <span className="trace-summary-llm-index">Call {i + 1}</span>
              <span>Provider: {unavailable(call.provider)}</span>
              <span>Model: {unavailable(call.model)}</span>
              <span>Duration: {unavailable(call.durationLabel)}</span>
              <span>
                Tokens:{" "}
                {call.inputTokens != null || call.outputTokens != null
                  ? `${call.inputTokens ?? "?"} in / ${call.outputTokens ?? "?"} out`
                  : "not available (Ollama)"}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="trace-summary-trace-id" title={summary.trace_id}>
        Trace: {summary.trace_id.slice(0, 8)}…{summary.trace_id.slice(-4)}
      </div>
    </section>
  );
}
