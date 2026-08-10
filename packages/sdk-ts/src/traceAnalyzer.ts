/**
 * Canonical trace analyzer — deterministic projection of raw events → TraceSummary.
 *
 * Pure: no React, no SQLite, no network. Same events always produce the same summary.
 */

import type { PersistedEvent, TraceSummary, TraceSummaryStatus, ValidatorOutcome } from "./schema";
import {
  canonicalNodeDisplayName,
  canonicalNodeKey,
  SUPPORT_RESEARCH_PIPELINE_ORDER,
} from "./nodeNormalization";

/* ------------------------------------------------------------------ */
/*  Event deduplication (idempotent ingest)                           */
/* ------------------------------------------------------------------ */

export function dedupeEvents(events: PersistedEvent[]): PersistedEvent[] {
  const seen = new Set<string>();
  const deduped: PersistedEvent[] = [];

  for (const event of events) {
    const key =
      event.ingest_id ||
      `${event.trace_id}:${event.span_id}:${event.event_type}:${event.timestamp}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(event);
  }

  return deduped.sort((a, b) => a.timestamp - b.timestamp);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function extractValidation(events: PersistedEvent[]): Record<string, unknown> | undefined {
  for (const event of events) {
    if (event.event_type !== "agent_end") continue;
    const outputs = event.payload?.outputs;
    if (!isRecord(outputs)) continue;
    const validation = outputs.validation;
    if (isRecord(validation)) return validation;
  }

  const rootEnd = [...events]
    .reverse()
    .find((e) => e.event_type === "agent_end" && e.node_name === "LangGraph");
  const output = rootEnd?.payload?.output;
  if (isRecord(output) && isRecord(output.validation)) {
    return output.validation;
  }

  return undefined;
}

function extractTopRetrievalScore(events: PersistedEvent[]): number | undefined {
  for (const event of events) {
    if (event.event_type !== "tool_result") continue;
    const results = event.payload?.retrieval_results;
    if (!Array.isArray(results) || results.length === 0) continue;
    const scores = results
      .map((r) => (isRecord(r) ? pickNumber(r, ["score"]) : undefined))
      .filter((s): s is number => s !== undefined);
    if (scores.length > 0) return Math.max(...scores);
  }

  const validation = extractValidation(events);
  if (validation) {
    return pickNumber(validation, ["top_retrieval_score"]);
  }

  return undefined;
}

function extractVariant(events: PersistedEvent[]): string | undefined {
  const rootEnd = [...events]
    .reverse()
    .find((e) => e.event_type === "agent_end" && e.node_name === "LangGraph");
  const output = rootEnd?.payload?.output;
  if (isRecord(output) && typeof output.variant === "string") {
    return output.variant.toLowerCase();
  }
  return undefined;
}

function collectNodeNames(events: PersistedEvent[]): Set<string> {
  const names = new Set<string>();
  for (const event of events) {
    if (event.node_name?.trim()) {
      names.add(canonicalNodeKey(event.node_name));
    }
  }
  return names;
}

function countUniqueSpans(events: PersistedEvent[]): number {
  return new Set(events.map((e) => e.span_id)).size;
}

function countLlmCalls(events: PersistedEvent[]): number {
  const requestSpans = new Set<string>();
  for (const event of events) {
    if (event.event_type === "llm_request") {
      requestSpans.add(event.span_id);
    }
  }
  return requestSpans.size;
}

function inferProviderFromPayload(payload: Record<string, unknown> | undefined): string | undefined {
  if (!payload) return undefined;
  if (typeof payload.provider === "string" && payload.provider.trim()) {
    const p = payload.provider;
    if (p.includes("ollama")) return "ollama";
    if (p.includes("openai")) return "openai";
    if (p.includes("groq")) return "groq";
    if (p.includes("fake")) return "fake-list-llm";
    return p;
  }
  const params = payload.params;
  if (isRecord(params) && typeof params._type === "string") {
    const type = params._type;
    if (type.includes("ollama")) return "ollama";
    if (type.includes("openai")) return "openai";
    if (type.includes("groq")) return "groq";
    if (type.includes("fake")) return "fake-list-llm";
  }
  return undefined;
}

function inferModelFromPayload(payload: Record<string, unknown> | undefined): string | undefined {
  if (!payload) return undefined;
  if (typeof payload.model === "string" && payload.model.trim() && payload.model !== "unknown") {
    const model = payload.model;
    if (model !== "ChatOllama" && model !== "LLM") return model;
  }
  const params = payload.params;
  if (isRecord(params)) {
    for (const key of ["model", "model_name", "model_id"]) {
      const value = params[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return undefined;
}

function collectLlmProvidersAndModels(events: PersistedEvent[]): {
  providers: string[];
  models: string[];
} {
  const providers = new Set<string>();
  const models = new Set<string>();

  for (const event of events) {
    if (event.event_type !== "llm_request") continue;
    const provider = inferProviderFromPayload(event.payload);
    const model = inferModelFromPayload(event.payload);
    if (provider) providers.add(provider);
    if (model) models.add(model);
  }

  return {
    providers: Array.from(providers),
    models: Array.from(models),
  };
}

function friendlyNodeName(raw: string): string {
  return canonicalNodeDisplayName(raw);
}

function extractPipelineNodes(events: PersistedEvent[]): string[] {
  const nodeNames = collectNodeNames(events);
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const key of SUPPORT_RESEARCH_PIPELINE_ORDER) {
    if (!nodeNames.has(key)) continue;
    const friendly = friendlyNodeName(key);
    const dedupeKey = friendly.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    ordered.push(friendly);
  }

  return ordered;
}

function resolveValidatorOutcome(
  validation: Record<string, unknown> | undefined,
  hasBlocked: boolean
): ValidatorOutcome {
  if (validation && typeof validation.approved === "boolean") {
    return validation.approved ? "passed" : "failed";
  }
  if (hasBlocked) return "failed";
  return "unknown";
}

function resolveStatus(
  events: PersistedEvent[],
  nodeNames: Set<string>,
  validatorOutcome: ValidatorOutcome,
  errorCount: number
): TraceSummaryStatus {
  const hasBlocked = nodeNames.has("compliance_blocked");
  const hasComposer = nodeNames.has("response_composer");
  const hasRootEnd = events.some(
    (e) => e.event_type === "agent_end" && e.node_name === "LangGraph"
  );

  if (hasBlocked || validatorOutcome === "failed") return "blocked";
  if (errorCount > 0) return "error";
  if (hasComposer || validatorOutcome === "passed") return "success";
  if (hasRootEnd) return "success";
  if (events.length > 0) return "running";
  return "unknown";
}

function resolveFailureNode(
  nodeNames: Set<string>,
  validatorOutcome: ValidatorOutcome
): string | undefined {
  if (validatorOutcome === "failed") return "ComplianceValidator";
  if (nodeNames.has("compliance_blocked")) return "PaymentGateway";
  return undefined;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

export function analyzeTrace(traceId: string, rawEvents: PersistedEvent[]): TraceSummary | null {
  const events = dedupeEvents(rawEvents);
  if (events.length === 0) return null;

  const nodeNames = collectNodeNames(events);
  const errorCount = events.filter((e) => e.event_type === "error").length;
  const toolCallCount = events.filter((e) => e.event_type === "tool_call").length;
  const retrievalCallCount = events.filter(
    (e) => e.event_type === "tool_result" && Array.isArray(e.payload?.retrieval_results)
  ).length;
  const llmCallCount = countLlmCalls(events);
  const validation = extractValidation(events);
  const validatorOutcome = resolveValidatorOutcome(
    validation,
    nodeNames.has("compliance_blocked")
  );
  const status = resolveStatus(events, nodeNames, validatorOutcome, errorCount);

  const first = events[0];
  const last = events[events.length - 1];
  const durationMicros =
    last.timestamp > first.timestamp ? last.timestamp - first.timestamp : undefined;

  const topRetrievalScore = extractTopRetrievalScore(events);
  const { providers, models } = collectLlmProvidersAndModels(events);

  let failureReasons: string[] | undefined;
  let humanReviewRequired: boolean | undefined;
  let failureNode: string | undefined;

  if (status === "blocked" || status === "error") {
    failureNode = resolveFailureNode(nodeNames, validatorOutcome);
    if (validation && Array.isArray(validation.failed_checks)) {
      failureReasons = validation.failed_checks.filter(
        (r): r is string => typeof r === "string"
      );
    }
    humanReviewRequired =
      status === "blocked" ||
      validatorOutcome === "failed" ||
      nodeNames.has("compliance_blocked");
  }

  const summary: TraceSummary = {
    trace_id: traceId,
    status,
    node_count: countUniqueSpans(events),
    llm_call_count: llmCallCount,
    tool_call_count: toolCallCount,
    retrieval_call_count: retrievalCallCount,
    error_count: errorCount,
    updated_at: last.timestamp,
  };

  if (durationMicros !== undefined) summary.duration_micros = durationMicros;
  if (topRetrievalScore !== undefined) summary.top_retrieval_score = topRetrievalScore;
  if (validatorOutcome !== "unknown") summary.validator_outcome = validatorOutcome;
  if (failureNode) summary.failure_node = failureNode;
  if (failureReasons && failureReasons.length > 0) summary.failure_reasons = failureReasons;
  if (humanReviewRequired !== undefined) summary.human_review_required = humanReviewRequired;
  if (providers.length > 0) summary.llm_providers = providers;
  if (models.length > 0) summary.llm_models = models;

  const variant = extractVariant(events);
  if (variant) summary.variant = variant;

  const pipelineNodes = extractPipelineNodes(events);
  if (pipelineNodes.length > 0) summary.pipeline_nodes = pipelineNodes;

  return summary;
}

/* ------------------------------------------------------------------ */
/*  Compare divergence (summary-level)                                */
/* ------------------------------------------------------------------ */

export interface ExecutionDivergenceRow {
  label: string;
  primary: string;
  compare: string;
  changed: boolean;
}

function formatStatusLabel(status: TraceSummaryStatus): string {
  return status.toUpperCase();
}

function formatValidatorLabel(summary: TraceSummary): string {
  if (summary.validator_outcome === "passed") return "PASS";
  if (summary.validator_outcome === "failed") return "FAIL";
  return "—";
}

function formatGatewayLabel(summary: TraceSummary): string {
  if (summary.status === "blocked") return "BLOCKED";
  if (summary.status === "success") return "ALLOWED";
  return "—";
}

export function buildExecutionDivergence(
  primary: TraceSummary | null,
  compare: TraceSummary | null
): ExecutionDivergenceRow[] {
  if (!primary || !compare) return [];

  const row = (label: string, p: string, c: string): ExecutionDivergenceRow => ({
    label,
    primary: p,
    compare: c,
    changed: p !== c,
  });

  return [
    row("Status", formatStatusLabel(primary.status), formatStatusLabel(compare.status)),
    row("Variant", primary.variant?.toUpperCase() ?? "—", compare.variant?.toUpperCase() ?? "—"),
    row(
      "Top retrieval score",
      primary.top_retrieval_score !== undefined
        ? primary.top_retrieval_score.toFixed(3)
        : "—",
      compare.top_retrieval_score !== undefined
        ? compare.top_retrieval_score.toFixed(3)
        : "—"
    ),
    row("Validator", formatValidatorLabel(primary), formatValidatorLabel(compare)),
    row("Gateway", formatGatewayLabel(primary), formatGatewayLabel(compare)),
    row("LLM calls", String(primary.llm_call_count), String(compare.llm_call_count)),
    row(
      "LLM provider",
      primary.llm_providers?.[0] ?? "unknown",
      compare.llm_providers?.[0] ?? "unknown"
    ),
  ];
}
