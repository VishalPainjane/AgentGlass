/**
 * Canonical evaluation entrypoint — deterministic, no network, no LLM.
 */

import type { EvaluationScore, PersistedEvent, TraceEvaluation, TraceSummary } from "../schema";
import { dedupeEvents } from "../traceAnalyzer";
import { defaultEvaluators } from "./evaluators";
import type { EvaluateTraceOptions, TraceEvaluator } from "./types";

export function computeOverallScore(scores: EvaluationScore[]): number | undefined {
  const available = scores.filter((s) => s.available && typeof s.value === "number");
  if (available.length === 0) return undefined;

  const sum = available.reduce((acc, s) => acc + (s.value as number), 0);
  return Math.round((sum / available.length) * 1000) / 1000;
}

export function computeOverallPassed(scores: EvaluationScore[]): boolean {
  const available = scores.filter((s) => s.available);
  if (available.length === 0) return false;
  return available.every((s) => s.passed === true);
}

export function evaluateTrace(
  summary: TraceSummary,
  rawEvents: PersistedEvent[],
  evaluators: TraceEvaluator[] = defaultEvaluators,
  options: EvaluateTraceOptions = {}
): TraceEvaluation {
  const events = dedupeEvents(rawEvents);
  const scores = evaluators.map((evaluator) => evaluator.evaluate(summary, events));
  const overall_score = computeOverallScore(scores);
  const passed = computeOverallPassed(scores);
  const availableScores = scores.filter((s) => s.available && typeof s.value === "number");

  return {
    trace_id: summary.trace_id,
    scores,
    overall_score,
    passed,
    evaluated_at: options.evaluatedAt ?? Date.now() * 1000,
    aggregation_method: "mean of available evaluator scores",
    evaluators_available: availableScores.length,
    evaluators_passed: availableScores.filter((s) => s.passed === true).length,
  };
}

export interface EvaluationDivergenceRow {
  label: string;
  primary: string;
  compare: string;
  changed: boolean;
}

function formatScoreValue(score: EvaluationScore | undefined): string {
  if (!score || !score.available || score.value === undefined) return "—";
  return score.value.toFixed(2);
}

function formatScoreLabel(name: string): string {
  return name
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildEvaluationDivergence(
  primary: TraceEvaluation | null,
  compare: TraceEvaluation | null
): EvaluationDivergenceRow[] {
  if (!primary || !compare) return [];

  const row = (label: string, p: string, c: string): EvaluationDivergenceRow => ({
    label,
    primary: p,
    compare: c,
    changed: p !== c,
  });

  const scoreByName = (evaluation: TraceEvaluation, name: string) =>
    evaluation.scores.find((s) => s.name === name);

  const rows: EvaluationDivergenceRow[] = [
    row(
      "Task Completion",
      formatScoreValue(scoreByName(primary, "task_completion")),
      formatScoreValue(scoreByName(compare, "task_completion"))
    ),
    row(
      "Tool Efficiency",
      formatScoreValue(scoreByName(primary, "tool_efficiency")),
      formatScoreValue(scoreByName(compare, "tool_efficiency"))
    ),
    row(
      "Loop Detection",
      formatScoreValue(scoreByName(primary, "loop_detection")),
      formatScoreValue(scoreByName(compare, "loop_detection"))
    ),
    row(
      "Answer Groundedness",
      formatScoreValue(scoreByName(primary, "answer_groundedness")),
      formatScoreValue(scoreByName(compare, "answer_groundedness"))
    ),
    row(
      "Evaluation Score",
      primary.overall_score !== undefined ? primary.overall_score.toFixed(2) : "—",
      compare.overall_score !== undefined ? compare.overall_score.toFixed(2) : "—"
    ),
  ];

  return rows;
}

export { formatScoreLabel };
