/**
 * Extract compact structured context for semantic (LLM) evaluators.
 * Pure function — no network calls.
 */

import type { PersistedEvent } from "../schema";
import { dedupeEvents } from "../traceAnalyzer";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export interface SemanticEvalContext {
  available: boolean;
  question?: string;
  evidence: string[];
  answer?: string;
  unavailableReason?: string;
}

export function extractSemanticEvalContext(events: PersistedEvent[]): SemanticEvalContext {
  const sorted = dedupeEvents(events);

  let question: string | undefined;
  const rootStart = sorted.find(
    (e) => e.event_type === "agent_start" && e.node_name === "LangGraph"
  );
  const rootInput = rootStart?.payload?.input;
  if (isRecord(rootInput)) {
    question = pickString(rootInput, ["query", "question", "user_query"]);
  }

  const evidence: string[] = [];
  for (const event of sorted) {
    if (event.event_type !== "tool_result") continue;
    const results = event.payload?.retrieval_results;
    if (!Array.isArray(results)) continue;
    for (const item of results) {
      if (!isRecord(item)) continue;
      const text = pickString(item, ["text", "content", "chunk"]);
      const score = typeof item.score === "number" ? item.score : undefined;
      if (text) {
        evidence.push(score !== undefined ? `[score=${score.toFixed(3)}] ${text}` : text);
      }
    }
  }

  let answer: string | undefined;
  const rootEnd = [...sorted]
    .reverse()
    .find((e) => e.event_type === "agent_end" && e.node_name === "LangGraph");
  const output = rootEnd?.payload?.output;
  if (isRecord(output)) {
    answer =
      pickString(output, ["final_response", "answer"]) ??
      pickString(output, ["llm_conclusion", "conclusion"]);
  }

  if (!answer) {
    const composerEnd = [...sorted]
      .reverse()
      .find(
        (e) =>
          e.event_type === "agent_end" &&
          e.node_name.toLowerCase().includes("response")
      );
    const composerOutput = composerEnd?.payload?.output ?? composerEnd?.payload?.outputs;
    if (isRecord(composerOutput)) {
      answer = pickString(composerOutput, ["final_response", "answer", "content"]);
    }
  }

  if (!answer) {
    const lastLlm = [...sorted].reverse().find((e) => e.event_type === "llm_response");
    const response = lastLlm?.payload?.response;
    if (typeof response === "string" && response.trim()) {
      answer = response.trim();
    }
  }

  if (!question) {
    return {
      available: false,
      evidence,
      unavailableReason: "No user question found in trace input.",
    };
  }

  if (evidence.length === 0) {
    return {
      available: false,
      question,
      evidence,
      unavailableReason: "No retrieved evidence found in trace.",
    };
  }

  if (!answer) {
    return {
      available: false,
      question,
      evidence,
      unavailableReason: "No agent answer found in trace output.",
    };
  }

  return { available: true, question, evidence, answer };
}
