/**
 * Browser-safe exports — trace analyzer and schema only (no Node client).
 */

export {
  SCHEMA_VERSION,
  EVENT_TYPES,
  AgentGlassEventSchema,
  PersistedEventSchema,
  TraceMetadataSchema,
  TraceSummarySchema,
  TraceSummaryStatusSchema,
  ValidatorOutcomeSchema,
  EvaluationScoreSchema,
  TraceEvaluationSchema,
} from "./schema";

export type {
  AgentGlassEvent,
  AgentGlassEventType,
  PersistedEvent,
  TraceMetadata,
  TraceSummary,
  TraceSummaryStatus,
  ValidatorOutcome,
  EvaluationScore,
  TraceEvaluation,
} from "./schema";

export { analyzeTrace, dedupeEvents, buildExecutionDivergence } from "./traceAnalyzer";
export type { ExecutionDivergenceRow } from "./traceAnalyzer";

export { buildDebuggingNarrative } from "./debuggingNarrative";
export type { DebuggingNarrative } from "./debuggingNarrative";

export {
  canonicalNodeKey,
  canonicalNodeDisplayName,
  SUPPORT_RESEARCH_PIPELINE_ORDER,
} from "./nodeNormalization";

export { extractSemanticEvalContext } from "./evaluation/semanticContext";
export type { SemanticEvalContext } from "./evaluation/semanticContext";

export {
  evaluateTrace,
  computeOverallScore,
  computeOverallPassed,
  buildEvaluationDivergence,
  formatScoreLabel,
} from "./evaluation/evaluateTrace";

export type { EvaluationDivergenceRow } from "./evaluation/evaluateTrace";

export {
  defaultEvaluators,
  taskCompletionEvaluator,
  toolEfficiencyEvaluator,
  loopDetectionEvaluator,
  createToolEfficiencyEvaluator,
  SUPPORT_RESEARCH_TOOL_BASELINE,
} from "./evaluation/evaluators";

export type { TraceEvaluator, EvaluateTraceOptions, ToolEfficiencyOptions } from "./evaluation/types";
