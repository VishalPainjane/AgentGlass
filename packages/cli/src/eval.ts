/**
 * CLI output formatter for trace evaluations.
 */

interface EvaluationScore {
  name: string;
  evaluator?: string;
  available: boolean;
  value?: number;
  passed?: boolean;
  explanation?: string;
  evaluator_type?: string;
  scope?: string;
  version?: string;
  pass_condition?: string;
  metadata?: Record<string, unknown>;
  provider?: string;
  model?: string;
}

interface TraceEvaluation {
  trace_id: string;
  scores: EvaluationScore[];
  overall_score?: number;
  passed: boolean;
  aggregation_method?: string;
  evaluators_available?: number;
  evaluators_passed?: number;
}

function formatScoreLabel(name: string): string {
  return name
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatEvaluationCli(evaluation: TraceEvaluation): string {
  const lines: string[] = [];
  lines.push("AgentGlass Evaluation");
  lines.push("──────────────────────");
  lines.push("");
  lines.push(`Trace: ${evaluation.trace_id}`);
  lines.push("");

  for (const score of evaluation.scores) {
    const label = formatScoreLabel(score.name);
    lines.push(label);
    lines.push("─".repeat(Math.min(label.length, 40)));

    if (!score.available || score.value === undefined) {
      lines.push("Unavailable");
      if (score.explanation) lines.push(score.explanation);
      lines.push("");
      continue;
    }

    lines.push(`${score.passed ? "PASS" : "FAIL"}  ${score.value.toFixed(2)}`);
    if (score.explanation) lines.push(score.explanation);

    if (score.evaluator_type) {
      lines.push(`Type: ${score.evaluator_type}`);
    }
    if (score.scope) {
      lines.push(`Scope: ${score.scope}`);
    }
    if (score.metadata?.baseline_tool_calls !== undefined) {
      lines.push(`Baseline: ${score.metadata.baseline_tool_calls} tool/retrieval calls`);
    }
    if (score.metadata?.observed_calls !== undefined) {
      lines.push(`Observed: ${score.metadata.observed_calls} calls`);
    }
    if (score.provider && score.model) {
      lines.push(`Judge: ${score.provider} / ${score.model}`);
    }
    lines.push("");
  }

  lines.push("Evaluation Score");
  lines.push("─".repeat(16));
  if (evaluation.overall_score !== undefined) {
    lines.push(evaluation.overall_score.toFixed(2));
  } else {
    lines.push("—");
  }
  if (evaluation.evaluators_available !== undefined) {
    lines.push(
      `${evaluation.evaluators_available} evaluator(s), ${evaluation.evaluators_passed ?? 0} passed`
    );
  }
  if (evaluation.aggregation_method) {
    lines.push(`Aggregation: ${evaluation.aggregation_method}`);
  }
  lines.push("");
  lines.push(`Result: ${evaluation.passed ? "PASS" : "FAIL"}`);

  return lines.join("\n");
}

export type { TraceEvaluation, EvaluationScore };
