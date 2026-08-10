/**
 * Evaluator interface — smallest useful abstraction for deterministic trace scoring.
 */

import type { EvaluationScore, PersistedEvent, TraceSummary } from "../schema";
import type { EvaluatorDefinition, EvaluatorType } from "./evaluatorMeta";

export interface TraceEvaluator extends EvaluatorDefinition {
  /** Stable evaluator id with version, e.g. `task_completion:v1`. */
  readonly id: string;
  /** Short name without version, e.g. `task_completion`. */
  readonly name: string;
  readonly description: string;
  readonly evaluator_type: EvaluatorType;
  readonly scope: string;
  readonly version: string;
  readonly pass_condition: string;
  evaluate(summary: TraceSummary, events: PersistedEvent[]): EvaluationScore;
}

export interface ToolEfficiencyOptions {
  /** Expected tool activity for the support-research workflow (retrieval + log analysis). */
  baselineToolActivity?: number;
}

export interface EvaluateTraceOptions {
  toolEfficiency?: ToolEfficiencyOptions;
  evaluatedAt?: number;
}
