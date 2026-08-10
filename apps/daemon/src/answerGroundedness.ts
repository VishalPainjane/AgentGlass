/**
 * answer_groundedness:v1 — local Ollama semantic evaluator.
 *
 * Judges whether the agent's answer is supported by retrieved evidence.
 * Runs in the daemon only (requires Ollama network access).
 */

import type { EvaluationScore, PersistedEvent } from "@agentglass/sdk-ts";
import { extractSemanticEvalContext } from "@agentglass/sdk-ts";

export const ANSWER_GROUNDEDNESS_VERSION = "v1";
export const ANSWER_GROUNDEDNESS_ID = `answer_groundedness:${ANSWER_GROUNDEDNESS_VERSION}`;
export const DEFAULT_OLLAMA_MODEL = "llama3.2:1b";
export const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";

interface JudgeResponse {
  score: number;
  passed: boolean;
  reason: string;
}

function buildUnavailableScore(explanation: string): EvaluationScore {
  return {
    evaluator: ANSWER_GROUNDEDNESS_ID,
    name: "answer_groundedness",
    evaluator_type: "llm",
    scope: "support-research:v1",
    version: ANSWER_GROUNDEDNESS_VERSION,
    pass_condition: "score >= 0.7 and judge marks passed",
    available: false,
    explanation,
    provider: "ollama",
    model: DEFAULT_OLLAMA_MODEL,
  };
}

function buildPrompt(question: string, evidence: string[], answer: string): string {
  const evidenceBlock = evidence.map((e, i) => `${i + 1}. ${e}`).join("\n");
  return `You are an evaluation judge. Determine whether the agent answer is adequately supported by the retrieved evidence.

Question:
${question}

Evidence:
${evidenceBlock}

Agent Answer:
${answer}

Evaluate whether the answer is supported by the evidence. Do not use outside knowledge.

Return strict JSON only:
{
  "score": 0.0,
  "passed": true,
  "reason": "one sentence explanation"
}

score must be between 0.0 and 1.0. passed should be true when score >= 0.7.`;
}

function parseJudgeResponse(text: string): JudgeResponse | null {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const score = typeof parsed.score === "number" ? parsed.score : Number(parsed.score);
    if (!Number.isFinite(score) || score < 0 || score > 1) return null;
    const passed = typeof parsed.passed === "boolean" ? parsed.passed : score >= 0.7;
    const reason = typeof parsed.reason === "string" ? parsed.reason : "No reason provided.";
    return { score, passed, reason };
  } catch {
    return null;
  }
}

export async function evaluateAnswerGroundedness(
  events: PersistedEvent[],
  options: { ollamaUrl?: string; model?: string } = {}
): Promise<EvaluationScore> {
  const ollamaUrl = options.ollamaUrl ?? process.env.AGENTGLASS_OLLAMA_URL ?? DEFAULT_OLLAMA_URL;
  const model = options.model ?? process.env.AGENTGLASS_OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL;

  const context = extractSemanticEvalContext(events);
  if (!context.available) {
    return buildUnavailableScore(
      context.unavailableReason ?? "Insufficient trace data for groundedness evaluation."
    );
  }

  const prompt = buildPrompt(context.question!, context.evidence, context.answer!);

  try {
    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        format: "json",
        stream: false,
        options: { temperature: 0 },
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      return buildUnavailableScore(`Judge model unavailable (HTTP ${response.status}).`);
    }

    const body = (await response.json()) as { message?: { content?: string } };
    const content = body.message?.content;
    if (!content) {
      return buildUnavailableScore("Judge model returned an empty response.");
    }

    const judged = parseJudgeResponse(content);
    if (!judged) {
      return buildUnavailableScore("Could not parse judge model response.");
    }

    return {
      evaluator: ANSWER_GROUNDEDNESS_ID,
      name: "answer_groundedness",
      evaluator_type: "llm",
      scope: "support-research:v1",
      version: ANSWER_GROUNDEDNESS_VERSION,
      pass_condition: "score >= 0.7 and judge marks passed",
      available: true,
      value: Math.round(judged.score * 1000) / 1000,
      passed: judged.passed,
      explanation: judged.reason,
      provider: "ollama",
      model,
    };
  } catch {
    return buildUnavailableScore("Judge model unavailable.");
  }
}
