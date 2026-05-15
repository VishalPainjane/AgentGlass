import { randomUUID } from "node:crypto";
import {
  insertEvent,
  insertEventBatch,
  getEventsByTrace,
  getRecentEvents,
  getEventsSince,
  getTraces,
  getCacheableEvents,
  insertRcaResult,
  getRcaResult,
  insertCommand,
  getPendingCommands,
  updateCommandStatus,
  clearDatabase,
  type PersistedEventRow,
} from "./db";
import { writeBlob, readBlob } from "./blobStore";
import { IncomingEventSchema, type IncomingEvent, rowToJson, parseUrl, sendJson, readBody } from "./types";

const BLOB_THRESHOLD_BYTES = 10 * 1024;

function preparePayload(payloadObj: unknown): string {
  const payloadStr = JSON.stringify(payloadObj ?? {});
  if (payloadStr.length > BLOB_THRESHOLD_BYTES) {
    const hash = writeBlob(payloadStr);
    return JSON.stringify({ $blob: hash });
  }
  return payloadStr;
}

function resolvePayload(payloadObj: unknown): unknown {
  if (payloadObj && typeof payloadObj === "object" && typeof (payloadObj as any).$blob === "string") {
    const raw = readBlob((payloadObj as any).$blob);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    }
  }
  return payloadObj;
}

function persistEvent(event: IncomingEvent): PersistedEventRow | null {
  const now = Date.now() * 1000;
  const row: Omit<PersistedEventRow, "id"> = {
    ingest_id: event.event_id ?? randomUUID(),
    trace_id: event.trace_id,
    span_id: event.span_id,
    parent_span_id: event.parent_span_id ?? null,
    event_type: event.event_type,
    node_name: event.node_name,
    payload: preparePayload(event.payload),
    timestamp: event.timestamp ?? now,
    ingest_timestamp: now,
    schema_version: event.schema_version,
  };

  const inserted = insertEvent(row);
  if (!inserted) {
    console.warn(`[daemon] Duplicate event_id ignored: ${row.ingest_id}`);
    return null;
  }

  console.log(`[daemon] Persisted event: ${row.event_type} for trace ${row.trace_id.slice(0, 8)}`);
  return { ...row, id: 0 } as PersistedEventRow;
}

function persistEventBatch(events: IncomingEvent[]): PersistedEventRow[] {
  const now = Date.now() * 1000;
  const rows: Omit<PersistedEventRow, "id">[] = events.map((event) => ({
    ingest_id: event.event_id ?? randomUUID(),
    trace_id: event.trace_id,
    span_id: event.span_id,
    parent_span_id: event.parent_span_id ?? null,
    event_type: event.event_type,
    node_name: event.node_name,
    payload: preparePayload(event.payload),
    timestamp: event.timestamp ?? now,
    ingest_timestamp: now,
    schema_version: event.schema_version,
  }));

  const insertedRows = insertEventBatch(rows);
  return insertedRows.map((r) => ({ ...r, id: 0 }) as PersistedEventRow);
}

export type BroadcastCallback = (event: Record<string, unknown>) => void;
let broadcastCallback: BroadcastCallback | null = null;

export function setBroadcastCallback(callback: BroadcastCallback): void {
  broadcastCallback = null;
  broadcastCallback = callback;
}

function broadcast(event: Record<string, unknown>): void {
  if (broadcastCallback) {
    broadcastCallback(event);
  }
}

function handleIngest(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse): void {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return;
  }

  readBody(req)
    .then((body) => {
      const raw = JSON.parse(body);
      const incoming = Array.isArray(raw) ? raw : [raw];
      console.log(`[daemon] Ingesting ${incoming.length} events`);
      const parsed = incoming.map((item) => IncomingEventSchema.parse(item));

      const persisted = parsed.length === 1
        ? [persistEvent(parsed[0])].filter(Boolean) as PersistedEventRow[]
        : persistEventBatch(parsed);

      for (const p of persisted) {
        broadcast(rowToJson(p));
      }

      sendJson(res, 202, { accepted: persisted.length });
    })
    .catch((error) => {
      console.error("[daemon] Ingest error:", error);
      sendJson(res, 400, {
        error: "invalid_payload",
        message: error instanceof Error ? error.message : "Unknown parsing error",
      });
    });
}

function handleCreateCommand(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse): void {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return;
  }

  readBody(req)
    .then((body) => {
      const raw = JSON.parse(body);
      const id = randomUUID();
      const payloadStr = typeof raw.payload === "string" ? raw.payload : JSON.stringify(raw.payload || {});

      insertCommand({
        id,
        trace_id: raw.trace_id,
        target_span: raw.target_span || null,
        command_type: raw.command_type,
        payload: payloadStr,
      });

      persistEvent({
        event_id: randomUUID(),
        trace_id: raw.trace_id,
        span_id: raw.target_span || randomUUID(),
        parent_span_id: null,
        event_type: "god_mode_command",
        node_name: "GodMode",
        payload: { command_id: id, type: raw.command_type, data: payloadStr },
        timestamp: Date.now() * 1000,
        schema_version: "1.0.0",
      });

      sendJson(res, 202, { id, status: "pending" });
    })
    .catch(() => {
      sendJson(res, 400, { error: "invalid_command" });
    });
}

function handlePollCommands(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse): void {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return;
  }

  readBody(req)
    .then((body) => {
      const { trace_id, target_span } = JSON.parse(body);

      if (!trace_id || !target_span) {
        sendJson(res, 400, { error: "missing_params" });
        return;
      }

      const pending = getPendingCommands(trace_id, target_span);
      for (const cmd of pending) {
        updateCommandStatus(cmd.id, "acknowledged");
      }

      sendJson(res, 200, { commands: pending });
    })
    .catch(() => {
      sendJson(res, 400, { error: "invalid_poll_request" });
    });
}

function handleListTraces(_req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse): void {
  const traces = getTraces().map((t) => ({
    ...t,
    has_error: Boolean(t.has_error),
  }));
  sendJson(res, 200, { traces });
}

function handleGetCache(_req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse): void {
  const events = getCacheableEvents().map(rowToJson);
  sendJson(res, 200, { events });
}

function handleClearDatabase(_req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse): void {
  clearDatabase();
  sendJson(res, 200, { status: "cleared" });
}

function handleGetTraceEvents(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, traceId: string): void {
  const events = getEventsByTrace(traceId).map(rowToJson);
  sendJson(res, 200, { events });
}

function handleGetEventsSince(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse): void {
  const { searchParams } = parseUrl(req.url);
  const since = Number(searchParams.get("since") ?? "0");
  const events = getEventsSince(since).map(rowToJson);
  sendJson(res, 200, { events });
}

function handleExportTrace(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, traceId: string): void {
  const events = getEventsByTrace(traceId).map((row) => {
    const obj = rowToJson(row);
    obj.payload = resolvePayload(obj.payload);
    return obj as Record<string, unknown>;
  });

  if (!events || events.length === 0) {
    sendJson(res, 404, { error: "trace_not_found" });
    return;
  }

  events.sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));

  const rootStart = events.find((e) => e.event_type === "agent_start" && !e.parent_span_id);
  const rootEnd = events.find((e) => e.event_type === "agent_end" && !e.parent_span_id);
  const toolResults = events.filter((e) => e.event_type === "tool_result");
  const llmResponses = events.filter((e) => e.event_type === "llm_response");

  const getPayload = (e: Record<string, unknown> | undefined): Record<string, unknown> => (e?.payload as Record<string, unknown>) || {};
  const initialInputs = getPayload(rootStart)?.inputs as Record<string, unknown> | undefined || getPayload(rootStart);
  const expectedOutputs = getPayload(rootEnd)?.outputs as Record<string, unknown> | undefined || getPayload(rootEnd);

  const toolsMap: Record<string, unknown[]> = {};
  for (const tr of toolResults) {
    const trAny = tr as Record<string, unknown>;
    const p = getPayload(tr);
    const name = String(p.tool_name || "") || String(trAny.node_name || "") || "unknown_tool";
    if (!toolsMap[name]) toolsMap[name] = [];
    toolsMap[name].push((p.result as unknown) || p);
  }

  const llmMocks = (llmResponses as Record<string, unknown>[]).map((e) => {
    const p = getPayload(e);
    return {
      model: (p as Record<string, unknown>).model || "unknown",
      response: (p as Record<string, unknown>).response || p,
    };
  });

  const py = `"""Auto-generated Pytest Fixtures for AgentGlass Trace: ${traceId}
Total Events: ${events.length}
"""

import json
from unittest.mock import patch

INITIAL_INPUTS = json.loads(r"""${JSON.stringify(initialInputs, null, 4)}""")

EXPECTED_OUTPUTS = json.loads(r"""${JSON.stringify(expectedOutputs, null, 4)}""")

MOCKED_TOOLS = json.loads(r"""${JSON.stringify(toolsMap, null, 4)}""")

MOCKED_LLMS = json.loads(r"""${JSON.stringify(llmMocks, null, 4)}""")

def mock_agent_environment():
    with patch("your_module.tools.execute") as mock_tool, \\
         patch("your_module.llm.call") as mock_llm:
        def tool_side_effect(tool_name, *args, **kwargs):
            results = MOCKED_TOOLS.get(tool_name, [])
            if results:
                return results.pop(0)
            return {}
        mock_tool.side_effect = tool_side_effect
        mock_llm.side_effect = [m["response"] for m in MOCKED_LLMS]
        yield mock_tool, mock_llm

def test_trace_replay(mock_agent_environment):
    pass
`;

  res.writeHead(200, {
    "content-type": "text/x-python",
    "content-disposition": `attachment; filename="test_trace_${traceId}.py"`,
  });
  res.end(py);
}

async function handleAnalyzeError(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, traceId: string, spanId: string): Promise<void> {
  const cached = getRcaResult(traceId, spanId);
  if (cached) {
    try {
      const parsed = JSON.parse(cached.analysis);
      sendJson(res, 200, parsed);
      return;
    } catch {
      // Fallback to re-analyze
    }
  }

  const events = getEventsByTrace(traceId).map((row) => {
    const obj = rowToJson(row);
    obj.payload = resolvePayload(obj.payload);
    return obj;
  });

  const nodeEvents = events.filter((e) => (e as Record<string, unknown>).span_id === spanId);
  if (!nodeEvents.length) {
    sendJson(res, 404, { error: "span_not_found" });
    return;
  }

  const errorEvent = nodeEvents.find((e) => (e as Record<string, unknown>).event_type === "error");
  if (!errorEvent) {
    sendJson(res, 400, { error: "no_error_event", message: "This span has no error to analyze." });
    return;
  }

  const modelName = process.env.AGENTGLASS_RCA_MODEL || "llama3.2:3b";
  const errorMessage = ((errorEvent as Record<string, unknown>).payload as Record<string, unknown>)?.message || "Unknown error";
  const nodeName = (errorEvent as Record<string, unknown>).node_name || "Unknown node";

  const sortedEvents = events.sort((a, b) => (Number((a as Record<string, unknown>).timestamp) || 0) - (Number((b as Record<string, unknown>).timestamp) || 0));
  const errorIndex = sortedEvents.findIndex((e) => (e as Record<string, unknown>).span_id === spanId && (e as Record<string, unknown>).event_type === "error");
  const recentEvents = sortedEvents.slice(Math.max(0, errorIndex - 5), Math.max(0, errorIndex));

  const prompt = `Analyze the following error in an AI agent system.
Agent Node: ${nodeName}
Error Message: ${errorMessage}
Recent Events context:
${JSON.stringify(recentEvents.map((e) => ({ type: (e as Record<string, unknown>).event_type, node: (e as Record<string, unknown>).node_name, payload: (e as Record<string, unknown>).payload })), null, 2)}

Provide a JSON response with the following keys:
- rootCause (string): A short sentence explaining the root cause.
- explanation (string): A detailed explanation of why it failed.
- suggestedFix (string): A concrete suggestion to fix the issue.
- origin_span_id (string | null): If the root cause originated from a specific previous event, output its span_id. Otherwise null.
- confidence (number): A float between 0 and 1 indicating your confidence.

Do not output any markdown code blocks, only the raw JSON.`;

  try {
    const ollamaRes = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        prompt,
        stream: false,
        format: "json",
      }),
    });

    if (!ollamaRes.ok) {
      throw new Error(`Ollama responded with status: ${ollamaRes.status}`);
    }

    const ollamaData = (await ollamaRes.json()) as Record<string, unknown>;
    const rawText = (ollamaData as Record<string, unknown>).response as string;
    const parsedAnalysis = JSON.parse(rawText);

    const finalAnalysis = {
      model: modelName,
      rootCause: (parsedAnalysis as Record<string, unknown>).rootCause || "Unknown root cause",
      explanation: (parsedAnalysis as Record<string, unknown>).explanation || "No explanation provided.",
      suggestedFix: (parsedAnalysis as Record<string, unknown>).suggestedFix || "No fix suggested.",
      origin_span_id: (parsedAnalysis as Record<string, unknown>).origin_span_id || null,
      confidence: (parsedAnalysis as Record<string, unknown>).confidence || 0.8,
    };

    insertRcaResult(traceId, spanId, JSON.stringify(finalAnalysis));
    sendJson(res, 200, finalAnalysis);
  } catch (e) {
    console.error("[Ollama RCA] Error:", e);

    const fallbackAnalysis = {
      model: "Fallback Mock Analysis (Ollama not reachable)",
      rootCause: "Unexpected application exception.",
      explanation: `Analysis of trace ID ${traceId.slice(0, 8)}:\nThe \`${nodeName}\` agent threw an exception.\n\nError message:\n>>> ${errorMessage}\n\nThe system could not reach the local Ollama instance (${modelName}) at http://localhost:11434 to perform a real root-cause analysis.`,
      suggestedFix: `Ensure Ollama is installed, running, and the correct model is pulled (\`ollama run ${modelName}\`).`,
      origin_span_id: null,
      confidence: 0.0,
    };
    sendJson(res, 200, fallbackAnalysis);
  }
}

function handleGetBlob(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, hash: string): void {
  const blobContent = readBlob(hash);
  if (!blobContent) {
    sendJson(res, 404, { error: "blob_not_found" });
    return;
  }
  res.writeHead(200, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
  });
  res.end(blobContent);
}

export function handleRoute(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse): void {
  const { pathname, searchParams } = parseUrl(req.url);

  if (req.method === "OPTIONS") {
    sendJson(res, 204, null);
    return;
  }

  if (req.method === "GET" && pathname === "/health") {
    const { dbPath } = require("./db");
    sendJson(res, 200, { status: "ok", db: dbPath });
    return;
  }

  if (req.method === "POST" && pathname === "/v1/events") {
    handleIngest(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/v1/commands") {
    handleCreateCommand(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/v1/commands/poll") {
    handlePollCommands(req, res);
    return;
  }

  if (req.method === "GET" && pathname === "/v1/traces") {
    handleListTraces(req, res);
    return;
  }

  if (req.method === "GET" && pathname === "/v1/cache") {
    handleGetCache(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/v1/system/clear") {
    handleClearDatabase(req, res);
    return;
  }

  const traceMatch = pathname.match(/^\/v1\/traces\/([^/]+)\/events$/);
  if (req.method === "GET" && traceMatch) {
    handleGetTraceEvents(req, res, traceMatch[1]);
    return;
  }

  const exportMatch = pathname.match(/^\/v1\/traces\/([^/]+)\/export$/);
  if (req.method === "GET" && exportMatch) {
    handleExportTrace(req, res, exportMatch[1]);
    return;
  }

  const analyzeMatch = pathname.match(/^\/v1\/traces\/([^/]+)\/spans\/([^/]+)\/analyze$/);
  if (req.method === "GET" && analyzeMatch) {
    handleAnalyzeError(req, res, analyzeMatch[1], analyzeMatch[2]).then();
    return;
  }

  const blobMatch = pathname.match(/^\/v1\/blobs\/([^/]+)$/);
  if (req.method === "GET" && blobMatch) {
    handleGetBlob(req, res, blobMatch[1]);
    return;
  }

  if (req.method === "GET" && pathname === "/v1/events") {
    handleGetEventsSince(req, res);
    return;
  }

  sendJson(res, 404, { error: "not_found" });
}