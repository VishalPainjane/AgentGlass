/**
 * TraceEvaluationPanel — evaluation scores with explanations and provenance.
 */

"use client";

import { useEffect, useState } from "react";
import type { TraceEvaluation } from "@agentglass/sdk-ts/browser";
import { formatScoreLabel } from "@agentglass/sdk-ts/browser";
import { useTraceStore } from "../hooks/useTraceStore";

function scoreStatusLabel(score: TraceEvaluation["scores"][number]): string {
  if (!score.available || score.value === undefined) return "Unavailable";
  return score.passed ? "PASS" : "FAIL";
}

function formatValue(score: TraceEvaluation["scores"][number]): string {
  if (!score.available || score.value === undefined) return "—";
  return score.value.toFixed(2);
}

export default function TraceEvaluationPanel() {
  const selectedTraceId = useTraceStore((s) => s.selectedTraceId);
  const [evaluation, setEvaluation] = useState<TraceEvaluation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedTraceId) {
      setEvaluation(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const { daemonHttp } = await import("../lib/daemonApi");
        const res = await fetch(daemonHttp(`/v1/traces/${selectedTraceId}/evaluation`));
        if (!res.ok) {
          throw new Error(`Evaluation unavailable (${res.status})`);
        }
        const data = (await res.json()) as TraceEvaluation;
        if (!cancelled) setEvaluation(data);
      } catch (err) {
        if (!cancelled) {
          setEvaluation(null);
          setError(err instanceof Error ? err.message : "Failed to load evaluation");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedTraceId]);

  if (!selectedTraceId) return null;

  return (
    <section className="trace-evaluation-panel" aria-label="Trace evaluation">
      <div className="trace-summary-header">
        <h3>Evaluation</h3>
        {evaluation && (
          <span
            className={`trace-evaluation-result trace-evaluation-result-${
              evaluation.passed ? "pass" : "fail"
            }`}
          >
            {evaluation.evaluators_passed ?? 0}/{evaluation.evaluators_available ?? 0} passed
          </span>
        )}
      </div>

      {loading && <p className="trace-evaluation-loading">Loading evaluation…</p>}
      {error && !loading && <p className="trace-evaluation-error">{error}</p>}

      {evaluation && !loading && (
        <>
          <div className="trace-evaluation-cards">
            {evaluation.scores.map((score) => (
              <div key={score.evaluator} className="trace-evaluation-card">
                <div className="trace-evaluation-card-header">
                  <strong>{formatScoreLabel(score.name)}</strong>
                  <span
                    className={`trace-evaluation-status ${
                      !score.available
                        ? "trace-evaluation-status-na"
                        : score.passed
                          ? "trace-evaluation-status-pass"
                          : "trace-evaluation-status-fail"
                    }`}
                  >
                    {scoreStatusLabel(score)}
                  </span>
                </div>
                <div className="trace-evaluation-value-large">{formatValue(score)}</div>
                {score.explanation && (
                  <p className="trace-evaluation-explanation">{score.explanation}</p>
                )}
                {score.metadata?.baseline_tool_calls !== undefined && (
                  <p className="trace-evaluation-meta">
                    Baseline: {String(score.metadata.baseline_tool_calls)} tool/retrieval calls
                  </p>
                )}
                {score.metadata?.observed_calls !== undefined && (
                  <p className="trace-evaluation-meta">
                    Observed: {String(score.metadata.observed_calls)} calls
                  </p>
                )}
                {score.scope && (
                  <p className="trace-evaluation-meta">Scope: {score.scope}</p>
                )}
                {score.provider && score.model && (
                  <p className="trace-evaluation-meta">
                    Judge: {score.provider} / {score.model}
                  </p>
                )}
                {score.evaluator_type && (
                  <p className="trace-evaluation-meta">
                    {score.evaluator} · {score.evaluator_type}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="trace-evaluation-overall">
            <div>
              <span>Evaluation Score</span>
              <strong>
                {evaluation.overall_score !== undefined
                  ? evaluation.overall_score.toFixed(2)
                  : "N/A"}
              </strong>
            </div>
            {evaluation.aggregation_method && (
              <p className="trace-evaluation-aggregation">
                Aggregation: {evaluation.aggregation_method}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
