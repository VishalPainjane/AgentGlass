/**
 * Shared evaluator metadata helpers — provenance and score construction.
 */

import type { EvaluationScore } from "../schema";

export type EvaluatorType = "deterministic" | "llm";

export interface EvaluatorDefinition {
  id: string;
  name: string;
  version: string;
  description: string;
  evaluator_type: EvaluatorType;
  scope: string;
  pass_condition: string;
}

export function buildScore(
  def: EvaluatorDefinition,
  partial: Pick<EvaluationScore, "available" | "value" | "passed" | "explanation"> & {
    metadata?: Record<string, unknown>;
    provider?: string;
    model?: string;
  }
): EvaluationScore {
  return {
    evaluator: def.id,
    name: def.name,
    evaluator_type: def.evaluator_type,
    scope: def.scope,
    version: def.version,
    pass_condition: def.pass_condition,
    ...partial,
  };
}
