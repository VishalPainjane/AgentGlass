/**
 * task_completion:v1
 *
 * Measures execution-level completion (not semantic answer quality).
 */

import type { EvaluationScore, PersistedEvent, TraceSummary } from "../../schema";
import { buildScore } from "../evaluatorMeta";
import type { TraceEvaluator } from "../types";

export const TASK_COMPLETION_VERSION = "v1";
export const TASK_COMPLETION_ID = `task_completion:${TASK_COMPLETION_VERSION}`;

const DEFINITION = {
  id: TASK_COMPLETION_ID,
  name: "task_completion",
  version: TASK_COMPLETION_VERSION,
  description: "Checks whether execution reached a successful terminal state.",
  evaluator_type: "deterministic" as const,
  scope: "trace-level",
  pass_condition: "value === 1.0 (trace status is success)",
};

export const taskCompletionEvaluator: TraceEvaluator = {
  ...DEFINITION,

  evaluate(summary: TraceSummary, _events: PersistedEvent[]): EvaluationScore {
    if (summary.status === "success") {
      return buildScore(DEFINITION, {
        available: true,
        value: 1,
        passed: true,
        explanation: "Trace completed successfully.",
      });
    }

    if (summary.status === "blocked") {
      return buildScore(DEFINITION, {
        available: true,
        value: 0,
        passed: false,
        explanation: "Trace ended in BLOCKED state.",
      });
    }

    if (summary.status === "error") {
      return buildScore(DEFINITION, {
        available: true,
        value: 0,
        passed: false,
        explanation: "Trace ended with a runtime error.",
      });
    }

    if (summary.status === "running") {
      return buildScore(DEFINITION, {
        available: false,
        explanation: "Task completion cannot be scored while the trace is still running.",
      });
    }

    return buildScore(DEFINITION, {
      available: false,
      explanation:
        "Task completion cannot be scored — insufficient telemetry to determine terminal status.",
    });
  },
};
