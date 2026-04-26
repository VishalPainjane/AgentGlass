/**
 * AgentGlass TypeScript SDK
 *
 * Provides the client for emitting telemetry events to the local
 * AgentGlass daemon, plus a convenience wrapper for instrumenting
 * async functions.
 */

import { randomUUID } from "node:crypto";

export {
  SCHEMA_VERSION,
  EVENT_TYPES,
  AgentGlassEventSchema,
  PersistedEventSchema,
  TraceMetadataSchema,
} from "./schema";

export type {
  AgentGlassEvent,
  AgentGlassEventType,
  PersistedEvent,
  TraceMetadata,
} from "./schema";

import { SCHEMA_VERSION, type AgentGlassEvent } from "./schema";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function nowMicros(): number {
  return Date.now() * 1000;
}

/* ------------------------------------------------------------------ */
/*  Client Options                                                    */
/* ------------------------------------------------------------------ */

export interface AgentGlassClientOptions {
  daemonUrl?: string;
  flushIntervalMs?: number;
  maxBatchSize?: number;
}

/* ------------------------------------------------------------------ */
/*  Client                                                            */
/* ------------------------------------------------------------------ */

export class AgentGlassClient {
  private readonly daemonUrl: string;
  private readonly flushIntervalMs: number;
  private readonly maxBatchSize: number;
  private readonly queue: AgentGlassEvent[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private flushing = false;

  constructor(options: AgentGlassClientOptions = {}) {
    this.daemonUrl = options.daemonUrl ?? "http://127.0.0.1:7777";
    this.flushIntervalMs = options.flushIntervalMs ?? 250;
    this.maxBatchSize = options.maxBatchSize ?? 50;
  }

  /* ------ lifecycle ------ */

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.flush();
    }, this.flushIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /* ------ tracking ------ */

  track(
    event: Omit<AgentGlassEvent, "timestamp" | "schema_version" | "event_id"> & {
      timestamp?: number;
      schema_version?: string;
      event_id?: string;
    }
  ): void {
    this.queue.push({
      ...event,
      event_id: event.event_id ?? (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)),
      node_name: event.node_name ?? "",
      payload: event.payload ?? {},
      timestamp: event.timestamp ?? nowMicros(),
      schema_version: event.schema_version ?? SCHEMA_VERSION,
    });

    if (this.queue.length >= this.maxBatchSize) {
      void this.flush();
    }
  }

  /* ------ span helpers ------ */

  createSpan(options: {
    traceId: string;
    parentSpanId?: string;
    nodeName: string;
  }): { spanId: string; traceId: string; parentSpanId: string | null } {
    return {
      spanId: randomUUID(),
      traceId: options.traceId,
      parentSpanId: options.parentSpanId ?? null,
    };
  }

  startTrace(): string {
    return randomUUID();
  }

  /* ------ flush ------ */

  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;

    this.flushing = true;
    const batch = this.queue.splice(0, this.maxBatchSize);

    try {
      await fetch(`${this.daemonUrl}/v1/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(batch),
      });
    } catch {
      this.queue.unshift(...batch);
    } finally {
      this.flushing = false;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  withAgentGlass wrapper                                            */
/* ------------------------------------------------------------------ */

interface SpanWrapperOptions {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
}

export function withAgentGlass<TArgs extends unknown[], TResult>(
  target: (...args: TArgs) => Promise<TResult> | TResult,
  client: AgentGlassClient,
  options: SpanWrapperOptions
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    client.track({
      trace_id: options.traceId,
      span_id: options.spanId,
      parent_span_id: options.parentSpanId ?? null,
      event_type: "agent_start",
      node_name: options.name,
      payload: { name: options.name },
    });

    try {
      const result = await target(...args);
      client.track({
        trace_id: options.traceId,
        span_id: options.spanId,
        parent_span_id: options.parentSpanId ?? null,
        event_type: "agent_end",
        node_name: options.name,
        payload: { name: options.name },
      });
      return result;
    } catch (error) {
      client.track({
        trace_id: options.traceId,
        span_id: options.spanId,
        parent_span_id: options.parentSpanId ?? null,
        event_type: "error",
        node_name: options.name,
        payload: {
          name: options.name,
          message: error instanceof Error ? error.message : "Unknown error",
        },
      });
      throw error;
    }
  };
}
