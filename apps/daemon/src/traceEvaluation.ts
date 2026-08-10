/**
 * Trace evaluation service — run deterministic + optional semantic evaluators.
 */

import {
  evaluateTrace,
  computeOverallScore,
  computeOverallPassed,
} from "@agentglass/sdk-ts";
import type { TraceEvaluation } from "@agentglass/sdk-ts";
import {
  getEventsByTrace,
  upsertEvaluationScores,
  getEvaluationScores,
} from "./db";
import { rowToPersistedEvent } from "./traceSummary";
import { getStoredSummary, recomputeAndPersistSummary } from "./traceSummary";
import { evaluateAnswerGroundedness } from "./answerGroundedness";

export interface RunEvaluationOptions {
  semantic?: boolean;
}

export async function runAndPersistEvaluation(
  traceId: string,
  options: RunEvaluationOptions = {}
): Promise<TraceEvaluation | null> {
  const events = getEventsByTrace(traceId).map(rowToPersistedEvent);
  if (events.length === 0) return null;

  const summary = getStoredSummary(traceId) ?? recomputeAndPersistSummary(traceId);
  if (!summary) return null;

  const evaluation = evaluateTrace(summary, events);

  if (options.semantic) {
    const semanticScore = await evaluateAnswerGroundedness(events);
    evaluation.scores.push(semanticScore);
    evaluation.overall_score = computeOverallScore(evaluation.scores);
    evaluation.passed = computeOverallPassed(evaluation.scores);
    const available = evaluation.scores.filter((s) => s.available && typeof s.value === "number");
    evaluation.evaluators_available = available.length;
    evaluation.evaluators_passed = available.filter((s) => s.passed === true).length;
  }

  upsertEvaluationScores(traceId, evaluation);
  return evaluation;
}

export function getStoredEvaluation(traceId: string): TraceEvaluation | null {
  return getEvaluationScores(traceId);
}
