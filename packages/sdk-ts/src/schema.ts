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

export const TraceMetadataSchema = z.object({
  trace_id: z.string(),
  event_count: z.number().int().nonnegative(),
  first_timestamp: z.number().int().nonnegative(),
  last_timestamp: z.number().int().nonnegative(),
  has_error: z.boolean(),
});

export type TraceMetadata = z.infer<typeof TraceMetadataSchema>;
