/**

 * Dashboard trace helpers — presentation utilities only.

 *

 * Canonical trace summary fields come from the daemon via @agentglass/sdk-ts.

 * This module keeps UI-specific helpers (LLM call rows, formatting) that read raw events.

 */



import type { PersistedEvent } from "./eventHelpers";

import { formatDuration } from "./eventHelpers";



export { buildExecutionDivergence } from "@agentglass/sdk-ts/browser";

export type { ExecutionDivergenceRow } from "@agentglass/sdk-ts/browser";



export interface LlmCallSummary {

  spanId: string;

  provider: string | null;

  model: string | null;

  startTime: number | null;

  endTime: number | null;

  durationLabel: string | null;

  inputTokens: number | null;

  outputTokens: number | null;

  finishReason: string | null;

  hasPrompt: boolean;

  hasResponse: boolean;

}



function isRecord(value: unknown): value is Record<string, unknown> {

  return typeof value === "object" && value !== null && !Array.isArray(value);

}



function pickNumber(record: Record<string, unknown>, keys: string[]): number | null {

  for (const key of keys) {

    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) return value;

  }

  return null;

}



function inferProviderFromParams(params: unknown): string | null {

  if (!isRecord(params)) return null;

  const type = params._type;

  if (typeof type === "string") {

    if (type.includes("ollama")) return "ollama";

    if (type.includes("openai")) return "openai";

    if (type.includes("groq")) return "groq";

    if (type.includes("fake")) return "fake-list-llm";

    return type;

  }

  return null;

}



function inferModelFromParams(params: unknown): string | null {

  if (!isRecord(params)) return null;

  for (const key of ["model", "model_name", "model_id"]) {

    const value = params[key];

    if (typeof value === "string" && value.trim()) return value;

  }

  return null;

}



function extractTokenUsage(responsePayload: unknown): {

  input: number | null;

  output: number | null;

  finishReason: string | null;

} {

  if (!isRecord(responsePayload)) {

    return { input: null, output: null, finishReason: null };

  }



  if (typeof responsePayload.finish_reason === "string") {

    const tokenUsage = responsePayload.token_usage;

    if (isRecord(tokenUsage)) {

      return {

        input: pickNumber(tokenUsage, ["input_tokens", "prompt_tokens", "input"]),

        output: pickNumber(tokenUsage, ["output_tokens", "completion_tokens", "output"]),

        finishReason: responsePayload.finish_reason,

      };

    }

  }



  const response = responsePayload.response;

  const responseText = typeof response === "string" ? response : "";



  const inputMatch = responseText.match(/input_tokens[=:]\s*(\d+)/i);

  const outputMatch = responseText.match(/output_tokens[=:]\s*(\d+)/i);

  const finishMatch = responseText.match(/finish_reason[=:]\s*['"]?([\w-]+)/i);



  if (inputMatch || outputMatch) {

    return {

      input: inputMatch ? Number(inputMatch[1]) : null,

      output: outputMatch ? Number(outputMatch[1]) : null,

      finishReason: finishMatch?.[1] ?? null,

    };

  }



  if (isRecord(response)) {

    const llmOutput = response.llm_output;

    if (isRecord(llmOutput)) {

      const tokenUsage = llmOutput.token_usage ?? llmOutput.usage;

      if (isRecord(tokenUsage)) {

        return {

          input: pickNumber(tokenUsage, ["input_tokens", "prompt_tokens", "input"]),

          output: pickNumber(tokenUsage, ["output_tokens", "completion_tokens", "output"]),

          finishReason:

            typeof llmOutput.finish_reason === "string" ? llmOutput.finish_reason : null,

        };

      }

    }

  }



  return { input: null, output: null, finishReason: null };

}



/** Per-call LLM telemetry for deep inspection — not part of TraceSummary. */

export function summarizeLlmCalls(events: PersistedEvent[]): LlmCallSummary[] {

  const requests = new Map<string, PersistedEvent>();

  const responses = new Map<string, PersistedEvent>();



  for (const event of events) {

    if (event.event_type === "llm_request") requests.set(event.span_id, event);

    if (event.event_type === "llm_response") responses.set(event.span_id, event);

  }



  const summaries: LlmCallSummary[] = [];



  for (const [spanId, request] of requests) {

    const response = responses.get(spanId);

    const params = request.payload?.params;

    const provider =

      (typeof request.payload?.provider === "string" ? request.payload.provider : null) ??

      inferProviderFromParams(params);

    const model =

      (typeof request.payload?.model === "string" ? request.payload.model : null) ??

      inferModelFromParams(params);

    const tokens = response

      ? extractTokenUsage(response.payload)

      : { input: null, output: null, finishReason: null };



    let durationLabel: string | null = null;

    if (response) {

      const durationMicros = pickNumber(response.payload ?? {}, ["duration_micros"]);

      if (durationMicros !== null) {

        durationLabel = formatDuration(request.timestamp, request.timestamp + durationMicros);

      } else {

        durationLabel = formatDuration(request.timestamp, response.timestamp);

      }

    }



    summaries.push({

      spanId,

      provider,

      model,

      startTime: request.timestamp,

      endTime: response?.timestamp ?? null,

      durationLabel,

      inputTokens: tokens.input,

      outputTokens: tokens.output,

      finishReason: tokens.finishReason,

      hasPrompt: Array.isArray(request.payload?.prompts) && request.payload.prompts.length > 0,

      hasResponse: Boolean(response),

    });

  }



  return summaries;

}


