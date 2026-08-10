/**
 * AgentGlass Trace Schema v0
 *
 * This is the canonical event contract shared between all SDKs,
 * the local daemon, and the dashboard.  Every field added here
 * must be mirrored in the Python SDK Pydantic model and in the
 * daemon's SQLite schema.
 */

import { z } from "zod";

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

export const SCHEMA_VERSION = "0.1.0" as const;

export const EVENT_TYPES = [
  "agent_start",
  "agent_end",
  "tool_call",
  "tool_result",
  "llm_request",
  "llm_response",
  "llm_stream",
  "state_snapshot",
  "state_injection",
  "error",
] as const;

export type AgentGlassEventType = (typeof EVENT_TYPES)[number];

/* ------------------------------------------------------------------ */
/*  Zod Validators                                                    */
/* ------------------------------------------------------------------ */

export const AgentGlassEventSchema = z.object({
  /** Unique identifier for this specific event to ensure idempotency. */
  event_id: z.string().optional(),

  /** Unique identifier for the entire multi-agent run. */
  trace_id: z.string().min(1),

  /** Identifier for the specific node / agent currently executing. */
  span_id: z.string().min(1),

  /** Links back to the caller agent to reconstruct graph edges. */
  parent_span_id: z.string().min(1).nullish(),

  /** Lifecycle event label. */
  event_type: z.string().min(1),

  /** Human-readable name of the agent or node. */
  node_name: z.string().default(""),

  /** Arbitrary structured data — prompts, payloads, errors, etc. */
  payload: z.record(z.unknown()).optional().default({}),

  /** Microsecond-precision timestamp. */
  timestamp: z.number().int().nonnegative().optional(),

  /** Schema contract version. */
  schema_version: z.string().default(SCHEMA_VERSION),
});

export type AgentGlassEvent = z.infer<typeof AgentGlassEventSchema>;

/* ------------------------------------------------------------------ */
/*  Persisted Event (daemon-side, after ingestion)                    */
/* ------------------------------------------------------------------ */

export const PersistedEventSchema = AgentGlassEventSchema.extend({
  /** Server-assigned unique id for this ingested event. */
  ingest_id: z.string().min(1),

  /** Server-side ingestion timestamp (µs). */
  ingest_timestamp: z.number().int().nonnegative(),

  /** Guaranteed non-optional after persistence. */
  timestamp: z.number().int().nonnegative(),
});

export type PersistedEvent = z.infer<typeof PersistedEventSchema>;

/* ------------------------------------------------------------------ */
/*  Trace Metadata (returned by list-traces endpoint)                 */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Trace Summary (canonical derived observability projection)        */
/* ------------------------------------------------------------------ */

export const TraceSummaryStatusSchema = z.enum([
  "running",
  "success",
  "error",
  "blocked",
  "unknown",
]);

export type TraceSummaryStatus = z.infer<typeof TraceSummaryStatusSchema>;

export const ValidatorOutcomeSchema = z.enum(["passed", "failed", "unknown"]);

export type ValidatorOutcome = z.infer<typeof ValidatorOutcomeSchema>;

export const TraceSummarySchema = z.object({
  trace_id: z.string(),
  status: TraceSummaryStatusSchema,
  duration_micros: z.number().int().nonnegative().optional(),
  node_count: z.number().int().nonnegative(),
  llm_call_count: z.number().int().nonnegative(),
  tool_call_count: z.number().int().nonnegative(),
  retrieval_call_count: z.number().int().nonnegative(),
  error_count: z.number().int().nonnegative(),
  top_retrieval_score: z.number().optional(),
  validator_outcome: ValidatorOutcomeSchema.optional(),
  failure_node: z.string().optional(),
  failure_reasons: z.array(z.string()).optional(),
  human_review_required: z.boolean().optional(),
  llm_providers: z.array(z.string()).optional(),
  llm_models: z.array(z.string()).optional(),
  variant: z.string().optional(),
  pipeline_nodes: z.array(z.string()).optional(),
  updated_at: z.number().int().nonnegative(),
});

export type TraceSummary = z.infer<typeof TraceSummarySchema>;

export const TraceMetadataSchema = z.object({
  trace_id: z.string(),
  event_count: z.number().int().nonnegative(),
  first_timestamp: z.number().int().nonnegative(),
  last_timestamp: z.number().int().nonnegative(),
  has_error: z.boolean(),
  summary: TraceSummarySchema.optional(),
});

export type TraceMetadata = z.infer<typeof TraceMetadataSchema>;

/* ------------------------------------------------------------------ */
/*  Trace Evaluation (deterministic quality judgments)                */
/* ------------------------------------------------------------------ */

export const EvaluationScoreSchema = z.object({
  /** Versioned evaluator id, e.g. task_completion:v1 */
  evaluator: z.string(),
  /** Short evaluator name without version */
  name: z.string(),
  /** False when the evaluator cannot produce a meaningful score */
  available: z.boolean(),
  /** Normalized score 0.0 (worst) – 1.0 (best); omitted when unavailable */
  value: z.number().min(0).max(1).optional(),
  /** Pass/fail for this evaluator; omitted when unavailable */
  passed: z.boolean().optional(),
  /** Deterministic explanation derived from trace facts */
  explanation: z.string().optional(),
  /** deterministic | llm */
  evaluator_type: z.enum(["deterministic", "llm"]).optional(),
  /** Workflow or trace scope this evaluator applies to */
  scope: z.string().optional(),
  /** Evaluator version without id prefix, e.g. v1 */
  version: z.string().optional(),
  /** Human-readable pass threshold description */
  pass_condition: z.string().optional(),
  /** Evaluator-specific facts (baseline, observed counts, etc.) */
  metadata: z.record(z.unknown()).optional(),
  /** LLM judge provider (semantic evaluators only) */
  provider: z.string().optional(),
  /** LLM judge model (semantic evaluators only) */
  model: z.string().optional(),
});

export type EvaluationScore = z.infer<typeof EvaluationScoreSchema>;

export const TraceEvaluationSchema = z.object({
  trace_id: z.string(),
  scores: z.array(EvaluationScoreSchema),
  /** Arithmetic mean of available normalized scores */
  overall_score: z.number().min(0).max(1).optional(),
  /** True when every available evaluator passed */
  passed: z.boolean(),
  evaluated_at: z.number().int().nonnegative(),
  /** How overall_score was computed */
  aggregation_method: z.string().optional(),
  /** Count of evaluators that produced a score */
  evaluators_available: z.number().int().nonnegative().optional(),
  /** Count of evaluators that passed */
  evaluators_passed: z.number().int().nonnegative().optional(),
});

export type TraceEvaluation = z.infer<typeof TraceEvaluationSchema>;
