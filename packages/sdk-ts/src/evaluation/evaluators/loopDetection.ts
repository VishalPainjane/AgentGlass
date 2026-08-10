/**
 * loop_detection:v1
 *
 * Detects repeated cyclic execution of logical steps without meaningful progress.
 */

import type { EvaluationScore, PersistedEvent, TraceSummary } from "../../schema";
import { canonicalNodeKey } from "../../nodeNormalization";
import { buildScore } from "../evaluatorMeta";
import type { TraceEvaluator } from "../types";

export const LOOP_DETECTION_VERSION = "v1";
export const LOOP_DETECTION_ID = `loop_detection:${LOOP_DETECTION_VERSION}`;

const MIN_CYCLE_LEN = 2;
const MAX_CYCLE_LEN = 3;
const MIN_REPEATS = 3;

const DEFINITION = {
  id: LOOP_DETECTION_ID,
  name: "loop_detection",
  version: LOOP_DETECTION_VERSION,
  description:
    "Detects repeated execution cycles of the same logical steps without progress.",
  evaluator_type: "deterministic" as const,
  scope: "trace-level",
  pass_condition: "no repeated cycle of length 2–3 detected ≥3 times consecutively",
};

export const loopDetectionEvaluator: TraceEvaluator = {
  ...DEFINITION,

  evaluate(_summary: TraceSummary, events: PersistedEvent[]): EvaluationScore {
    const steps = extractLogicalSteps(events);

    if (steps.length === 0) {
      return buildScore(DEFINITION, {
        available: false,
        explanation: "Loop detection requires agent_start events with node names.",
      });
    }

    const loop = findRepeatedCycle(steps);
    if (loop) {
      return buildScore(DEFINITION, {
        available: true,
        value: 0,
        passed: false,
        explanation: `Repeated execution cycle detected: ${loop}.`,
      });
    }

    return buildScore(DEFINITION, {
      available: true,
      value: 1,
      passed: true,
      explanation: "No repeated execution cycle detected.",
    });
  },
};

export function extractLogicalSteps(events: PersistedEvent[]): string[] {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const steps: string[] = [];

  for (const event of sorted) {
    if (event.event_type !== "agent_start") continue;
    if (!event.node_name || event.node_name === "LangGraph") continue;
    steps.push(canonicalNodeKey(event.node_name));
  }

  return steps;
}

export function findRepeatedCycle(steps: string[]): string | null {
  for (let cycleLen = MIN_CYCLE_LEN; cycleLen <= MAX_CYCLE_LEN; cycleLen++) {
    const minLength = cycleLen * MIN_REPEATS;
    if (steps.length < minLength) continue;

    for (let start = 0; start <= steps.length - minLength; start++) {
      const pattern = steps.slice(start, start + cycleLen);
      let repeats = 1;
      let pos = start + cycleLen;

      while (pos + cycleLen <= steps.length) {
        const segment = steps.slice(pos, pos + cycleLen);
        if (segmentsEqual(segment, pattern)) {
          repeats++;
          pos += cycleLen;
        } else {
          break;
        }
      }

      if (repeats >= MIN_REPEATS) {
        const label = pattern.join(" → ");
        const cycleLabel = Array.from({ length: MIN_REPEATS }, () => label).join(" → ");
        return cycleLabel;
      }
    }
  }

  return null;
}

function segmentsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((step, i) => step === b[i]);
}
