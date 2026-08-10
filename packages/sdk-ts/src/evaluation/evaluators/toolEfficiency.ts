/**
 * tool_efficiency:v1
 *
 * Measures tool/retrieval activity against a workflow-specific baseline.
 * Scope: support-research demo workflow only — not a universal efficiency metric.
 */

import type { EvaluationScore, PersistedEvent, TraceSummary } from "../../schema";
import { buildScore } from "../evaluatorMeta";
import type { ToolEfficiencyOptions, TraceEvaluator } from "../types";

export const TOOL_EFFICIENCY_VERSION = "v1";
export const TOOL_EFFICIENCY_ID = `tool_efficiency:${TOOL_EFFICIENCY_VERSION}`;
export const SUPPORT_RESEARCH_SCOPE = "support-research:v1";

/** Default baseline for the support-research demo workflow (1 retrieval + 1 log analysis). */
export const SUPPORT_RESEARCH_TOOL_BASELINE = 2;

const PASS_THRESHOLD = 0.8;

const DEFINITION = {
  id: TOOL_EFFICIENCY_ID,
  name: "tool_efficiency",
  version: TOOL_EFFICIENCY_VERSION,
  description:
    "Tool efficiency against the configured workflow baseline (retrieval + tool calls).",
  evaluator_type: "deterministic" as const,
  scope: SUPPORT_RESEARCH_SCOPE,
  pass_condition: `score >= ${PASS_THRESHOLD}`,
};

export function createToolEfficiencyEvaluator(
  options: ToolEfficiencyOptions = {}
): TraceEvaluator {
  const baseline = options.baselineToolActivity ?? SUPPORT_RESEARCH_TOOL_BASELINE;

  return {
    ...DEFINITION,

    evaluate(summary: TraceSummary, _events: PersistedEvent[]): EvaluationScore {
      if (summary.status === "running") {
        return buildScore(DEFINITION, {
          available: false,
          metadata: { scope: SUPPORT_RESEARCH_SCOPE, baseline_tool_calls: baseline },
          explanation: "Tool efficiency cannot be scored while the trace is still running.",
        });
      }

      if (!Number.isFinite(baseline) || baseline <= 0) {
        return buildScore(DEFINITION, {
          available: false,
          metadata: { scope: SUPPORT_RESEARCH_SCOPE },
          explanation: "Tool efficiency baseline is not configured for this workflow.",
        });
      }

      const observed = summary.tool_call_count + summary.retrieval_call_count;
      let value: number;
      let explanation: string;

      if (observed <= baseline) {
        value = 1;
        explanation = `${observed} observed call(s) within baseline of ${baseline}.`;
      } else {
        const excess = observed - baseline;
        value = Math.max(0, 1 - excess / baseline);
        explanation = `${observed} observed calls against configured baseline of ${baseline}.`;
      }

      const passed = value >= PASS_THRESHOLD;

      return buildScore(DEFINITION, {
        available: true,
        value: roundScore(value),
        passed,
        explanation,
        metadata: {
          scope: SUPPORT_RESEARCH_SCOPE,
          baseline_tool_calls: baseline,
          observed_calls: observed,
        },
      });
    },
  };
}

export const toolEfficiencyEvaluator = createToolEfficiencyEvaluator();

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}
